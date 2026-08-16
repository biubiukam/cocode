// packages/host-supervisor/src/service.ts
import net2 from "node:net";
import { closeSync as closeSync2, mkdirSync as mkdirSync3, openSync as openSync2, readFileSync as readFileSync2, readdirSync as readdirSync3, rmSync as rmSync2, writeFileSync as writeFileSync2, renameSync as renameSync2 } from "node:fs";
import { spawn } from "node:child_process";
import { join as join4 } from "node:path";
import { fileURLToPath } from "node:url";

// packages/host-supervisor/src/paths.ts
import { homedir as homedir2 } from "node:os";
import { join, resolve as resolve2 } from "node:path";

// packages/host-supervisor/src/protocol.ts
import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { resolve } from "node:path";
var SUPERVISOR_PROTOCOL_REVISION = "1.0";
var SUPERVISOR_BUILD_REVISION = "runtime-plugin-resolution-v2";
var HOST_PROTOCOL_REVISION = "1.0";
var LEASE_TTL_MS = 3e4;
function canonicalizeScope(scope) {
  const dshHome = resolve(scope.dshHome.trim() || `${homedir()}/.dsh`);
  const profile = scope.profile.trim() || "web";
  const fingerprint = scope.hostConfigFingerprint.trim() || "default";
  const runtimeChannel = scope.runtimeChannel === "preview" || scope.runtimeChannel === "dev" ? scope.runtimeChannel : "stable";
  return { dshHome, profile, hostConfigFingerprint: fingerprint, runtimeChannel };
}
function hostKey(scope) {
  const normalized = canonicalizeScope(scope);
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex").slice(0, 32);
}
function leaseId() {
  return randomUUID();
}
function isHostDescriptorCompatible(descriptor, scope, request) {
  const normalized = canonicalizeScope(scope);
  if (descriptor.hostKey !== hostKey(normalized)) return false;
  if (descriptor.dshHome !== normalized.dshHome) return false;
  if (descriptor.profile !== normalized.profile) return false;
  if (descriptor.hostConfigFingerprint !== normalized.hostConfigFingerprint) return false;
  if (descriptor.supervisorProtocolRevision.split(".")[0] !== SUPERVISOR_PROTOCOL_REVISION.split(".")[0]) return false;
  if (descriptor.hostProtocolRevision.split(".")[0] !== request.minProtocolRevision.split(".")[0]) return false;
  if (!request.requiredServices.every((service) => descriptor.services.some((entry) => entry.service === service))) return false;
  return (request.requiredCapabilities ?? []).every((capability) => descriptor.capabilities.includes(capability));
}

// packages/host-supervisor/src/paths.ts
function supervisorHome() {
  return resolve2(process.env.COCODE_SUPERVISOR_HOME?.trim() || join(homedir2(), ".cocode", "host-supervisor"));
}
function runtimeHome() {
  return resolve2(process.env.COCODE_HOST_RUNTIME_HOME?.trim() || join(homedir2(), ".cocode", "host-runtimes"));
}
function scopeDirectory(scope) {
  return join(supervisorHome(), hostKey(scope));
}
function endpointFor(directory) {
  return process.platform === "win32" ? `\\\\.\\pipe\\cocode-host-supervisor-${directory.split(/[\\/]/).pop()}` : join(directory, "supervisor.sock");
}
function descriptorPath(directory) {
  return join(directory, "host.json");
}
function scopePath(directory) {
  return join(directory, "scope.json");
}
function lockPath(directory) {
  return join(directory, "supervisor.lock");
}
function leaseDirectory(directory) {
  return join(directory, "leases");
}
function runtimeSlotDirectory(scope, runtimeVersion) {
  return join(runtimeHome(), `${hostKey(scope)}-${runtimeVersion}`);
}

// packages/host-supervisor/src/ipc.ts
import net from "node:net";
function openLineConnection(endpoint) {
  return new Promise((resolve5, reject) => {
    const socket = net.createConnection(endpoint);
    const peer = new LinePeer(socket, socket);
    const onError = (error) => {
      socket.destroy();
      reject(error);
    };
    socket.once("error", onError);
    socket.once("connect", () => {
      socket.off("error", onError);
      resolve5(peer);
    });
  });
}
var LinePeer = class {
  constructor(input, output) {
    this.input = input;
    this.output = output;
    input.on("data", (chunk) => this.onData(chunk.toString()));
    input.once("close", () => this.fail(new Error("IPC connection closed")));
    input.once("error", (error) => this.fail(error instanceof Error ? error : new Error(String(error))));
  }
  input;
  output;
  buffer = "";
  nextId = 1;
  pending = /* @__PURE__ */ new Map();
  notifications = /* @__PURE__ */ new Set();
  closeHandlers = /* @__PURE__ */ new Set();
  closed = false;
  closeNotified = false;
  request(method, params = {}, timeoutMs = 3e4) {
    if (this.closed) return Promise.reject(new Error("IPC connection is closed"));
    const id = this.nextId++;
    return new Promise((resolve5, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve: (value) => {
        clearTimeout(timer);
        resolve5(value);
      }, reject: (error) => {
        clearTimeout(timer);
        reject(error);
      } });
      this.output.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}
`);
    });
  }
  onNotification(handler) {
    this.notifications.add(handler);
    return () => this.notifications.delete(handler);
  }
  onClose(handler) {
    this.closeHandlers.add(handler);
    return () => this.closeHandlers.delete(handler);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    const destroy = this.input;
    destroy.destroy?.();
    this.fail(new Error("IPC connection closed"));
  }
  onData(chunk) {
    this.buffer += chunk;
    for (; ; ) {
      const index = this.buffer.indexOf("\n");
      if (index < 0) return;
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (!line) continue;
      let frame;
      try {
        frame = JSON.parse(line);
      } catch {
        continue;
      }
      if (typeof frame.id === "number") {
        const pending = this.pending.get(frame.id);
        if (!pending) continue;
        this.pending.delete(frame.id);
        if (frame.error) pending.reject(new Error(frame.error.message));
        else pending.resolve(frame.result);
      } else if (typeof frame.method === "string") {
        for (const handler of this.notifications) handler(frame.method, frame.params ?? {});
      }
    }
  }
  fail(error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    if (this.closeNotified) return;
    this.closeNotified = true;
    for (const handler of this.closeHandlers) handler(error);
  }
};
async function listenLineServer(server, endpoint) {
  if (process.platform !== "win32") {
    const fs = await import("node:fs/promises");
    await fs.rm(endpoint, { force: true }).catch(() => void 0);
  }
  await new Promise((resolve5, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve5();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(endpoint);
  });
}

// packages/host-supervisor/src/runtime.ts
import { createRequire } from "node:module";
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join as join2, resolve as resolve3 } from "node:path";
import { pathToFileURL } from "node:url";
function resolveDshPackage() {
  const require2 = createRequire(import.meta.url);
  const entry = require2.resolve("@deepseek-ai/dsh/lib/bin.js");
  let root = dirname(entry);
  while (root !== dirname(root) && !existsSync(join2(root, "package.json"))) root = dirname(root);
  const manifest = JSON.parse(readFileSync(join2(root, "package.json"), "utf8"));
  const buildId = typeof manifest.buildId === "string" ? manifest.buildId : typeof manifest.gitHead === "string" ? manifest.gitHead : process.env.COCODE_DSH_BUILD_ID?.trim() || void 0;
  return { root, entry, version: String(manifest.version), ...buildId === void 0 ? {} : { buildId } };
}
function prepareRuntimeSlot(scope, jsonRpcEndpoint, pluginPath) {
  const dsh = resolveDshPackage();
  const slot = runtimeSlotDirectory(scope, dsh.version);
  const entry = join2(slot, "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
  const pluginRoot = resolve3(dirname(pluginPath), "../../../runtime/plugins");
  const pluginSources = existsSync(pluginRoot) ? readdirSync(pluginRoot, { withFileTypes: true }).filter((item) => item.isDirectory()).map((item) => join2(pluginRoot, item.name)) : [];
  if (!existsSync(entry)) {
    rmSync(slot, { recursive: true, force: true });
    mkdirSync(join2(slot, "node_modules", "@deepseek-ai"), { recursive: true });
    copyPackageClosure(dsh.root, slot, pluginSources);
    mkdirSync(slot, { recursive: true });
    writeFileSync(join2(slot, "package.json"), JSON.stringify({ type: "module", private: true }) + "\n");
  }
  const pluginTarget = join2(slot, "cocode-host-jsonrpc-plugin.mjs");
  cpSync(pluginPath, pluginTarget);
  const pluginEntries = [];
  if (existsSync(pluginRoot)) {
    for (const entry2 of readdirSync(pluginRoot, { withFileTypes: true })) {
      if (!entry2.isDirectory()) continue;
      const source = join2(pluginRoot, entry2.name);
      const target = join2(slot, "node_modules", ...entry2.name.split("/"));
      mkdirSync(dirname(target), { recursive: true });
      cpSync(source, target, { recursive: true, dereference: true });
      pluginEntries.push({ name: entry2.name, entry: join2(target, "lib", "index.js") });
    }
  }
  registerRuntimePluginsInDshManifest(slot, pluginEntries);
  restoreNodePtyHelper(slot);
  const patch = join2(slot, "cocode-host.patch.yml");
  const rows = createRuntimePatch(pathToFileURL(pluginTarget).href, jsonRpcEndpoint, pluginEntries);
  writeFileSync(patch, rows);
  writeFileSync(join2(slot, "active.json"), `${JSON.stringify({
    schemaVersion: 1,
    hostKey: hostKey(scope),
    runtimeVersion: dsh.version,
    ...dsh.buildId === void 0 ? {} : { buildId: dsh.buildId },
    runtimeChannel: scope.runtimeChannel,
    hostConfigFingerprint: scope.hostConfigFingerprint,
    jsonRpcEndpoint,
    plugins: pluginEntries
  }, null, 2)}
`);
  return { root: slot, entry, version: dsh.version, ...dsh.buildId === void 0 ? {} : { buildId: dsh.buildId }, patch, jsonRpcEndpoint };
}
function registerRuntimePluginsInDshManifest(slot, pluginEntries) {
  const manifestPath = join2(slot, "node_modules", "@deepseek-ai", "dsh", "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const pluginManifests = pluginEntries.map(({ name }) => {
    const pluginManifestPath = join2(slot, "node_modules", ...name.split("/"), "package.json");
    return JSON.parse(readFileSync(pluginManifestPath, "utf8"));
  });
  const next = addRuntimePluginDependencies(manifest, pluginManifests);
  writeFileSync(manifestPath, `${JSON.stringify(next, null, 2)}
`);
}
function addRuntimePluginDependencies(manifest, pluginManifests) {
  const dependencies = { ...manifest.dependencies ?? {} };
  for (const plugin of pluginManifests) {
    if (typeof plugin.name !== "string" || plugin.name.length === 0) continue;
    dependencies[plugin.name] = typeof plugin.version === "string" && plugin.version.length > 0 ? plugin.version : "*";
  }
  return { ...manifest, dependencies };
}
function createRuntimePatch(jsonRpcPluginUrl, jsonRpcEndpoint, pluginEntries) {
  return [
    "- insert:",
    "    - id: cocode-host-jsonrpc",
    `      name: ${JSON.stringify(jsonRpcPluginUrl)}`,
    "      config:",
    `        endpoint: ${JSON.stringify(jsonRpcEndpoint)}`,
    `        protocolRevision: "1.0"`,
    ...pluginEntries.flatMap(({ name }) => [
      `    - id: ${name}`,
      `      name: ${JSON.stringify(name)}`
    ]),
    ""
  ].join("\n");
}
function restoreNodePtyHelper(root) {
  for (const helper of [
    join2(root, "node_modules", "node-pty", "prebuilds", `${process.platform}-${process.arch}`, "spawn-helper"),
    join2(root, "node_modules", "node-pty", "build", "Release", "spawn-helper")
  ]) {
    if (existsSync(helper)) chmodSync(helper, 493);
  }
}
function copyPackageClosure(dshRoot, slot, additionalRoots = []) {
  const targetModules = join2(slot, "node_modules");
  const pending = [realpathSync(dshRoot), ...additionalRoots.map((root) => realpathSync(root))];
  const copied = /* @__PURE__ */ new Set();
  const resolved = /* @__PURE__ */ new Map();
  while (pending.length > 0) {
    const sourceRoot = pending.shift();
    const manifestPath = join2(sourceRoot, "package.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (typeof manifest.name !== "string" || copied.has(manifest.name)) continue;
    copied.add(manifest.name);
    resolved.set(manifest.name, sourceRoot);
    const destination = join2(targetModules, ...manifest.name.split("/"));
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(sourceRoot, destination, {
      recursive: true,
      dereference: true,
      filter: (source) => basename(source) !== "node_modules"
    });
    const dependencies = {
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
      ...manifest.peerDependencies
    };
    const packageRequire = createRequire(manifestPath);
    for (const dependency of Object.keys(dependencies)) {
      if (resolved.has(dependency)) continue;
      try {
        const dependencyRoot = resolvePackageRoot(packageRequire, dependency);
        pending.push(dependencyRoot);
      } catch (error) {
        if (manifest.optionalDependencies?.[dependency] !== void 0 || manifest.peerDependenciesMeta?.[dependency]?.optional === true) continue;
        throw new Error(`Unable to resolve DSH runtime dependency ${dependency} from ${sourceRoot}: ${String(error)}`);
      }
    }
  }
}
function resolvePackageRoot(require2, packageName) {
  for (const searchPath of require2.resolve.paths(packageName) ?? []) {
    const candidate = join2(searchPath, ...packageName.split("/"));
    const manifestPath = join2(candidate, "package.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (manifest.name === packageName) return realpathSync(candidate);
  }
  throw new Error(`package root not found for ${packageName}`);
}

// packages/host-supervisor/src/logging.ts
import { createReadStream, createWriteStream, existsSync as existsSync2, mkdirSync as mkdirSync2, openSync, readdirSync as readdirSync2, statSync, unlinkSync, closeSync, writeSync, renameSync, fsyncSync } from "node:fs";
import { randomUUID as randomUUID2 } from "node:crypto";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { join as join3 } from "node:path";
import pino from "pino";
import { Writable } from "node:stream";
var MAX_BYTES = 20 * 1024 * 1024;
var MAX_FILES = 5;
var MAX_TOTAL_BYTES = 100 * 1024 * 1024;
var HostFileSink = class extends Writable {
  directory;
  currentPath;
  fd = null;
  bytes = 0;
  openedDate = "";
  available = true;
  constructor(directory) {
    super();
    this.directory = directory;
    this.currentPath = join3(directory, "current.jsonl");
    try {
      mkdirSync2(directory, { recursive: true, mode: 448 });
      this.open();
      this.prune();
    } catch (error) {
      this.available = false;
      try {
        process.stderr.write(`[cocode-host-log] ${String(error)}
`);
      } catch {
      }
    }
  }
  _write(chunk, _encoding, callback) {
    if (!this.available) {
      callback();
      return;
    }
    try {
      const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      this.rotateIfNeeded(value.length);
      if (this.fd === null) this.open();
      writeSync(this.fd, value);
      this.bytes += value.length;
      callback();
    } catch (error) {
      this.available = false;
      try {
        process.stderr.write(`[cocode-host-log] ${String(error)}
`);
      } catch {
      }
      callback();
    }
  }
  flush() {
    if (!this.available || this.fd === null) return;
    try {
      fsyncSync(this.fd);
    } catch (error) {
      this.available = false;
      try {
        process.stderr.write(`[cocode-host-log] ${String(error)}
`);
      } catch {
      }
    }
  }
  close() {
    if (this.fd === null) return;
    try {
      fsyncSync(this.fd);
    } catch {
    }
    closeSync(this.fd);
    this.fd = null;
  }
  open() {
    mkdirSync2(this.directory, { recursive: true, mode: 448 });
    this.fd = openSync(this.currentPath, "a", 384);
    const existing = existsSync2(this.currentPath) ? statSync(this.currentPath) : void 0;
    this.bytes = existing?.size ?? 0;
    this.openedDate = existing === void 0 || existing.size === 0 ? (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) : new Date(existing.mtimeMs).toISOString().slice(0, 10);
  }
  rotateIfNeeded(incomingBytes) {
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    if (this.bytes === 0 || this.bytes + incomingBytes <= MAX_BYTES && this.openedDate === today) return;
    this.close();
    const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    const rotated = join3(this.directory, `host-${stamp}.jsonl`);
    if (!renameCurrent(this.currentPath, rotated)) {
      try {
        this.open();
      } catch {
        this.available = false;
      }
      return;
    }
    try {
      this.open();
    } catch {
      this.available = false;
      return;
    }
    void this.compress(rotated);
    this.prune();
  }
  async compress(file) {
    const compressed = `${file}.gz`;
    try {
      await pipeline(createReadStream(file), createGzip({ level: 6 }), createWriteStream(compressed, { mode: 384 }));
      unlinkSync(file);
    } catch {
      try {
        unlinkSync(compressed);
      } catch {
      }
    }
  }
  prune() {
    const files = readdirSync2(this.directory).filter((file) => file.startsWith("host-") && (file.endsWith(".jsonl") || file.endsWith(".jsonl.gz"))).map((file) => ({ file, stat: statSync(join3(this.directory, file)) })).sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    let total = files.reduce((sum, entry) => sum + entry.stat.size, 0);
    const now = Date.now();
    for (const [index, entry] of files.entries()) {
      const expired = now - entry.stat.mtimeMs > 7 * 24 * 60 * 60 * 1e3;
      if (!expired && index < MAX_FILES && total <= MAX_TOTAL_BYTES) continue;
      try {
        unlinkSync(join3(this.directory, entry.file));
        total -= entry.stat.size;
      } catch {
      }
    }
  }
};
var HostLogger = class {
  logDirectory;
  sink;
  logger;
  appRunId = randomUUID2();
  constructor(options) {
    this.logDirectory = join3(options.stateDirectory, "logs", "host");
    this.sink = new HostFileSink(this.logDirectory);
    this.logger = pino({
      base: null,
      level: "info",
      timestamp: false,
      formatters: { level: (label) => ({ severityText: label.toUpperCase() }) },
      mixin: () => ({
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        serviceName: "cocode-host-supervisor",
        serviceVersion: options.runtimeVersion ?? "unknown",
        appRunId: this.appRunId
      })
    }, this.sink);
  }
  log(level, eventName, attributes) {
    const method = this.logger[level];
    method.call(this.logger, {
      eventName: safeText(eventName, 128),
      processType: "supervisor",
      component: "host-supervisor",
      ...attributes === void 0 ? {} : { attributes: sanitizeAttributes(attributes) }
    });
  }
  hostLine(stream, line) {
    const safe = sanitizeHostLine(line);
    this.logger.info({
      eventName: stream === "stderr" ? "dsh.host.stderr" : "dsh.host.stdout",
      processType: "dsh-host",
      component: "dsh-host",
      attributes: { stream, line: safe.text, truncated: safe.truncated }
    });
  }
  flush() {
    try {
      this.logger.flush();
    } catch {
    }
    this.sink.flush();
  }
  close() {
    this.flush();
    this.sink.close();
  }
};
function renameCurrent(current, rotated) {
  try {
    renameSync(current, rotated);
    return true;
  } catch {
    return false;
  }
}
function safeText(value, maxLength) {
  return value.replace(/[\r\n]/g, " ").replaceAll(String.fromCharCode(0), " ").slice(0, maxLength);
}
function sanitizeAttributes(attributes) {
  const sensitive = /(?:authorization|cookie|password|passwd|secret|token|api[-_]?key|credential|oauth|prompt|completion|response|body|headers?|args?|output|clipboard|env)/i;
  const result = {};
  for (const [key, value] of Object.entries(attributes).slice(0, 64)) {
    result[key] = sensitive.test(key) ? "[REDACTED]" : typeof value === "string" ? redactText(value) : value;
  }
  return result;
}
function sanitizeHostLine(value) {
  const redacted = redactText(value);
  const text = redacted.slice(0, 32768);
  return { text, truncated: redacted.length > text.length };
}
function redactText(value) {
  return safeText(value, 65536).replace(/((?:https?|wss?):\/\/[^\s?#]+)(?:\?[^\s#]*)?(?:#[^\s]*)?/gi, "$1").replace(/("(?:prompt|content|arguments|tool(?:_name)?|output|token|secret|password|api[-_]?key)"\s*:\s*)"[^"]*"/gi, '$1"[REDACTED]"').replace(/\b(?:prompt|content|arguments|tool(?:_name)?|output|token|secret|password|api[-_]?key)\s*[:=]\s*[^\s,;]+/gi, "[REDACTED]").replace(/\b(?:Bearer\s+)?(?:sk-|token[-_ ]?|password\s*[=:])[^\s,;]+/gi, "[REDACTED]");
}

// packages/host-supervisor/src/service.ts
async function runSupervisorService(stateDirectory) {
  mkdirSync3(stateDirectory, { recursive: true, mode: 448 });
  const scope = JSON.parse(readFileSync2(scopePath(stateDirectory), "utf8"));
  const logger = new HostLogger({ stateDirectory });
  const service = new SupervisorService(stateDirectory, scope, logger);
  try {
    await service.start();
    await service.wait();
  } catch (error) {
    logger.log("fatal", "supervisor.failed", { error: error instanceof Error ? error.message : String(error) });
    throw error;
  } finally {
    logger.close();
  }
}
var SupervisorService = class {
  constructor(directory, scope, logger) {
    this.directory = directory;
    this.scope = scope;
    this.logger = logger;
  }
  directory;
  scope;
  logger;
  get endpoint() {
    return endpointFor(this.directory);
  }
  leases = /* @__PURE__ */ new Map();
  host = null;
  server = null;
  stopped = false;
  hadHost = false;
  lockOwned = false;
  async start() {
    this.logger.log("info", "supervisor.start", { pid: process.pid });
    mkdirSync3(leaseDirectory(this.directory), { recursive: true, mode: 448 });
    this.acquireLock();
    this.loadLeases();
    this.server = net2.createServer((socket) => this.accept(socket));
    await listenLineServer(this.server, this.endpoint);
    if (process.platform !== "win32") {
      const fs = await import("node:fs/promises");
      await fs.chmod(this.endpoint, 384).catch(() => void 0);
    }
    await this.recoverExistingHost();
  }
  wait() {
    return new Promise((resolve5) => {
      const poll = () => {
        if (this.stopped) {
          resolve5();
          return;
        }
        this.cleanupLeases();
        if (this.hadHost && !this.host && this.leases.size === 0) {
          this.stop();
          resolve5();
          return;
        }
        setTimeout(poll, 2e3).unref();
      };
      poll();
    });
  }
  accept(socket) {
    let buffer = "";
    let chain = Promise.resolve();
    const onLine = (chunk) => {
      buffer += chunk.toString();
      for (; ; ) {
        const newline = buffer.indexOf("\n");
        if (newline < 0) return;
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        chain = chain.then(() => this.handleRaw(socket, line)).catch(() => void 0);
      }
    };
    socket.on("data", onLine);
    socket.once("close", () => socket.off("data", onLine));
  }
  async handleRaw(socket, line) {
    let frame;
    try {
      frame = JSON.parse(line);
    } catch {
      return;
    }
    if (typeof frame.id !== "number" || typeof frame.method !== "string") return;
    try {
      const result = await this.handle(frame.method, frame.params ?? {});
      socket.write(`${JSON.stringify({ jsonrpc: "2.0", id: frame.id, result })}
`);
    } catch (error) {
      socket.write(`${JSON.stringify({ jsonrpc: "2.0", id: frame.id, error: { code: -32e3, message: error instanceof Error ? error.message : String(error) } })}
`);
    }
  }
  async handle(method, params) {
    switch (method) {
      case "acquire":
        return this.acquire(params);
      case "renew":
        return this.renew(String(params.leaseId));
      case "release":
        return this.release(String(params.leaseId));
      case "status":
        return this.status();
      case "doctor":
        return this.doctor();
      default:
        throw new Error(`unknown supervisor method: ${method}`);
    }
  }
  async acquire(request) {
    this.cleanupLeases();
    this.logger.log("debug", "host.lease.acquire.started", { clientKind: request.clientKind, hostKey: hostKey(this.scope), requiredServices: request.requiredServices.join(",") });
    const requestedScope = canonicalizeScope(request.scope);
    if (JSON.stringify(requestedScope) !== JSON.stringify(this.scope)) {
      throw new Error("Host scope does not match this Supervisor scope");
    }
    if (!this.host || !isHostDescriptorCompatible(this.host.descriptor, this.scope, request)) {
      if (this.host && this.leases.size > 0) throw new Error("existing Host is incompatible while leases are active");
      if (this.host) await this.stopHost();
      try {
        await this.startHost(request);
      } catch (error) {
        this.stop();
        throw error;
      }
    }
    const id = leaseId();
    const expiresAt = new Date(Date.now() + LEASE_TTL_MS).toISOString();
    const record = { leaseId: id, clientKind: request.clientKind, pid: Number.isInteger(request.clientPid) ? Number(request.clientPid) : process.ppid, createdAt: (/* @__PURE__ */ new Date()).toISOString(), expiresAt };
    this.leases.set(id, record);
    this.persistLease(record);
    if (this.host?.idleTimer) {
      clearTimeout(this.host.idleTimer);
      delete this.host.idleTimer;
    }
    this.logger.log("info", "host.lease.acquired", { clientKind: request.clientKind, leaseId: shortId(id), leaseCount: this.leases.size });
    return { leaseId: id, expiresAt, descriptor: this.host.descriptor };
  }
  async startHost(request) {
    const jsonRpcEndpoint = process.platform === "win32" ? `\\\\.\\pipe\\cocode-dsh-jsonrpc-${hostKey(this.scope)}` : join4(this.directory, "dsh-jsonrpc.sock");
    const pluginPath = fileURLToPath(new URL("./host-jsonrpc-plugin.js", import.meta.url));
    const slot = prepareRuntimeSlot(this.scope, jsonRpcEndpoint, pluginPath);
    const workspace = join4(this.scope.dshHome, "workspaces", "default");
    mkdirSync3(workspace, { recursive: true });
    const args2 = this.scope.profile === "web" ? ["web"] : ["--profile", this.scope.profile];
    args2.push("--patch", slot.patch, "--port", "0");
    this.logger.log("info", "dsh.host.spawn.started", { profile: this.scope.profile, runtimeChannel: this.scope.runtimeChannel });
    const child = spawn(process.execPath, [slot.entry, ...args2], {
      cwd: workspace,
      env: { ...process.env, DSH_HOME: this.scope.dshHome, COCODE_DSH_PROFILE: this.scope.profile },
      stdio: ["ignore", "pipe", "pipe"]
    });
    const startupBuffer = new RingBuffer(256 * 1024);
    const streamBuffers = { stdout: "", stderr: "" };
    let readyObserved = false;
    const consume = (stream, chunk) => {
      const value = chunk.toString();
      startupBuffer.push(value);
      streamBuffers[stream] += value;
      const lines = streamBuffers[stream].split(/\r?\n/);
      streamBuffers[stream] = lines.pop() ?? "";
      for (const line of lines) if (line.length > 0) this.logger.hostLine(stream, line);
      if (Buffer.byteLength(streamBuffers[stream], "utf8") > 32 * 1024) {
        this.logger.hostLine(stream, `${streamBuffers[stream].slice(0, 32 * 1024)} [truncated]`);
        streamBuffers[stream] = "";
      }
    };
    const flushPartialLines = () => {
      for (const stream of ["stdout", "stderr"]) {
        const line = streamBuffers[stream];
        if (line.length > 0) this.logger.hostLine(stream, line);
        streamBuffers[stream] = "";
      }
    };
    const rejectStartup = (reject, error) => {
      if (readyObserved) return;
      readyObserved = true;
      reject(error);
    };
    const ready = new Promise((resolve5, reject) => {
      const timer = setTimeout(() => rejectStartup(reject, new Error(`DSH Host startup timed out.
${startupBuffer.value}`)), 6e4);
      const inspect = (chunk) => {
        consume("stdout", chunk);
        const match = startupBuffer.value.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+)/);
        if (match?.[1] && !readyObserved) {
          readyObserved = true;
          clearTimeout(timer);
          resolve5(match[1]);
        }
      };
      child.stdout?.on("data", inspect);
      child.stderr?.on("data", (chunk) => consume("stderr", chunk));
      child.once("error", (error) => {
        clearTimeout(timer);
        this.logger.log("error", "dsh.host.spawn.failed", { errorCode: String(error.code ?? "unknown") });
        rejectStartup(reject, error instanceof Error ? error : new Error(String(error)));
      });
      child.once("exit", (code, signal) => {
        flushPartialLines();
        clearTimeout(timer);
        this.logger.log("error", readyObserved ? "dsh.host.exit" : "dsh.host.exit.before-ready", {
          exitCode: code ?? -1,
          signal: signal ?? "none",
          hostPid: child.pid ?? -1
        });
        if (!readyObserved) rejectStartup(reject, new Error(`DSH Host exited before ready: ${String(code ?? signal ?? "unknown")}
${startupBuffer.value}`));
        if (this.host?.child === child) {
          this.host = null;
          rmSync2(descriptorPath(this.directory), { force: true });
        }
      });
    });
    const webUrl = await ready;
    startupBuffer.clear();
    await waitHttp(webUrl);
    await waitJsonRpc(jsonRpcEndpoint);
    const runtimeVersion = slot.version;
    const descriptor = {
      schemaVersion: 1,
      hostKey: hostKey(this.scope),
      supervisorProtocolRevision: SUPERVISOR_PROTOCOL_REVISION,
      hostPid: child.pid ?? -1,
      supervisorPid: process.pid,
      dshHome: this.scope.dshHome,
      profile: this.scope.profile,
      runtimeVersion,
      ...slot.buildId === void 0 ? {} : { buildId: slot.buildId },
      hostProtocolRevision: HOST_PROTOCOL_REVISION,
      hostConfigFingerprint: this.scope.hostConfigFingerprint,
      services: [
        { service: "web", transport: "tcp", endpoint: webUrl, protocolRevision: "1.0" },
        { service: "jsonrpc", transport: process.platform === "win32" ? "named-pipe" : "unix", endpoint: jsonRpcEndpoint, protocolRevision: "1.0" }
      ],
      capabilities: ["web", "jsonrpc", "session", "event", "workspace", "approval", "question"],
      startedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.host = { child, descriptor };
    this.hadHost = true;
    this.writeDescriptor(descriptor);
    this.logger.log("info", "dsh.host.ready", { hostPid: child.pid ?? -1, endpoint: webUrl });
  }
  async status() {
    return this.host?.descriptor ?? this.readDescriptor();
  }
  renew(id) {
    const record = this.leases.get(id);
    if (!record) throw new Error("unknown lease");
    record.expiresAt = new Date(Date.now() + LEASE_TTL_MS).toISOString();
    this.persistLease(record);
    this.logger.log("debug", "host.lease.renewed", { leaseId: shortId(id) });
    return { expiresAt: record.expiresAt };
  }
  async release(id) {
    const existed = this.leases.delete(id);
    rmSync2(join4(leaseDirectory(this.directory), `${id}.json`), { force: true });
    this.logger.log(existed ? "info" : "warn", existed ? "host.lease.released" : "host.lease.release.unknown", { leaseId: shortId(id), leaseCount: this.leases.size });
    if (this.leases.size === 0 && this.host) this.armIdleShutdown();
    return {};
  }
  armIdleShutdown() {
    if (!this.host || this.host.idleTimer) return;
    const timeoutMs = Number(process.env.COCODE_HOST_IDLE_TIMEOUT_MS ?? 2e4);
    this.logger.log("info", "dsh.host.idle-shutdown.armed", { timeoutMs });
    this.host.idleTimer = setTimeout(() => {
      void this.stopHost();
    }, timeoutMs);
    this.host.idleTimer.unref?.();
  }
  async stopHost() {
    const host = this.host;
    if (!host) return;
    this.host = null;
    const pid = host.child?.pid ?? host.descriptor.hostPid;
    this.logger.log("info", "dsh.host.stop.started", { hostPid: pid });
    if (pid > 0 && isProcessAlive(pid)) {
      try {
        if (host.child !== null) host.child.kill("SIGTERM");
        else process.kill(pid, "SIGTERM");
      } catch {
      }
      await waitForProcessExit(pid, 2e3);
      if (isProcessAlive(pid)) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
        }
      }
    }
    rmSync2(descriptorPath(this.directory), { force: true });
    this.logger.log("info", "dsh.host.stop.completed", { hostPid: pid });
  }
  cleanupLeases() {
    const now = Date.now();
    for (const record of this.leases.values()) if (Date.parse(record.expiresAt) <= now) {
      this.leases.delete(record.leaseId);
      rmSync2(join4(leaseDirectory(this.directory), `${record.leaseId}.json`), { force: true });
      this.logger.log("warn", "host.lease.expired", { leaseId: shortId(record.leaseId), clientKind: record.clientKind });
    }
  }
  loadLeases() {
    for (const file of readdirSync3(leaseDirectory(this.directory), { withFileTypes: true })) {
      if (!file.name.endsWith(".json")) continue;
      try {
        const record = JSON.parse(readFileSync2(join4(leaseDirectory(this.directory), file.name), "utf8"));
        if (Date.parse(record.expiresAt) > Date.now()) this.leases.set(record.leaseId, record);
      } catch {
        rmSync2(join4(leaseDirectory(this.directory), file.name), { force: true });
      }
    }
  }
  persistLease(record) {
    writeFileSync2(join4(leaseDirectory(this.directory), `${record.leaseId}.json`), JSON.stringify(record) + "\n", { mode: 384 });
  }
  writeDescriptor(descriptor) {
    const temp = `${descriptorPath(this.directory)}.${process.pid}.tmp`;
    writeFileSync2(temp, JSON.stringify(descriptor, null, 2) + "\n", { mode: 384 });
    renameSync2(temp, descriptorPath(this.directory));
  }
  readDescriptor() {
    try {
      return JSON.parse(readFileSync2(descriptorPath(this.directory), "utf8"));
    } catch {
      return null;
    }
  }
  doctor() {
    return { supervisorProtocolRevision: SUPERVISOR_PROTOCOL_REVISION, supervisorBuildRevision: SUPERVISOR_BUILD_REVISION, scope: this.scope, descriptor: this.readDescriptor(), leaseCount: this.leases.size, pid: process.pid };
  }
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    void this.stopHost();
    this.server?.close();
    if (this.lockOwned) rmSync2(lockPath(this.directory), { force: true });
    if (process.platform !== "win32") rmSync2(this.endpoint, { force: true });
  }
  acquireLock() {
    for (; ; ) {
      try {
        const fd = openSync2(lockPath(this.directory), "wx", 384);
        try {
          writeFileSync2(fd, JSON.stringify({ pid: process.pid, startedAt: (/* @__PURE__ */ new Date()).toISOString() }) + "\n");
        } finally {
          closeSync2(fd);
        }
        this.lockOwned = true;
        return;
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        let pid;
        try {
          const record = JSON.parse(readFileSync2(lockPath(this.directory), "utf8"));
          pid = record.pid;
        } catch {
        }
        if (pid !== void 0 && isProcessAlive(pid)) {
          throw new Error(`Host Supervisor is already running for ${this.directory}`);
        }
        rmSync2(lockPath(this.directory), { force: true });
      }
    }
  }
  async recoverExistingHost() {
    const descriptor = this.readDescriptor();
    if (descriptor === null) return;
    if (descriptor.hostKey !== hostKey(this.scope) || descriptor.dshHome !== this.scope.dshHome || descriptor.profile !== this.scope.profile || descriptor.hostConfigFingerprint !== this.scope.hostConfigFingerprint) {
      rmSync2(descriptorPath(this.directory), { force: true });
      return;
    }
    if (!isProcessAlive(descriptor.hostPid) || !await hostHealth(descriptor)) {
      rmSync2(descriptorPath(this.directory), { force: true });
      return;
    }
    this.host = { child: null, descriptor };
    this.hadHost = true;
    if (this.leases.size === 0) this.armIdleShutdown();
  }
};
function shortId(value) {
  return value.slice(0, 8);
}
var RingBuffer = class {
  constructor(maxBytes) {
    this.maxBytes = maxBytes;
  }
  maxBytes;
  buffer = Buffer.alloc(0);
  push(value) {
    const incoming = Buffer.from(value);
    this.buffer = Buffer.concat([this.buffer, incoming]);
    if (this.buffer.byteLength <= this.maxBytes) return;
    this.buffer = this.buffer.subarray(-this.maxBytes);
  }
  get value() {
    return this.buffer.toString("utf8");
  }
  clear() {
    this.buffer = Buffer.alloc(0);
  }
};
async function waitHttp(url) {
  const deadline = Date.now() + 3e4;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
    }
    await new Promise((resolve5) => setTimeout(resolve5, 100));
  }
  throw new Error(`DSH Web service did not become ready at ${url}`);
}
async function waitJsonRpc(endpoint) {
  const deadline = Date.now() + 3e4;
  while (Date.now() < deadline) {
    try {
      const socket = net2.createConnection(endpoint);
      await new Promise((resolve5, reject) => {
        socket.once("connect", () => resolve5());
        socket.once("error", reject);
      });
      socket.destroy();
      return;
    } catch {
    }
    await new Promise((resolve5) => setTimeout(resolve5, 100));
  }
  throw new Error(`DSH JSON-RPC service did not become ready at ${endpoint}`);
}
function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}
async function waitForProcessExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && isProcessAlive(pid)) await new Promise((resolve5) => setTimeout(resolve5, 100));
}
async function hostHealth(descriptor) {
  const web = descriptor.services.find((service) => service.service === "web");
  const jsonrpc = descriptor.services.find((service) => service.service === "jsonrpc");
  if (web === void 0 || jsonrpc === void 0) return false;
  try {
    await fetch(web.endpoint);
    const socket = net2.createConnection(jsonrpc.endpoint);
    await new Promise((resolve5, reject) => {
      socket.once("connect", () => resolve5());
      socket.once("error", reject);
    });
    socket.destroy();
    return true;
  } catch {
    return false;
  }
}

// packages/host-supervisor/src/bin.ts
import { homedir as homedir3 } from "node:os";
import { resolve as resolve4 } from "node:path";

// packages/host-supervisor/src/client.ts
import { existsSync as existsSync4, mkdirSync as mkdirSync4, readdirSync as readdirSync4, writeFileSync as writeFileSync3 } from "node:fs";
import { spawn as spawn2 } from "node:child_process";
import { join as join5 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
var LocalHostSupervisorClient = class {
  constructor(options = {}) {
    this.options = options;
  }
  options;
  activeLeases = /* @__PURE__ */ new Map();
  async acquire(request) {
    const scope = canonicalizeScope(request.scope);
    const directory = scopeDirectory(scope);
    mkdirSync4(directory, { recursive: true, mode: 448 });
    writeFileSync3(scopePath(directory), JSON.stringify(scope) + "\n", { mode: 384 });
    const peer = await this.connectOrStart(directory);
    let result;
    try {
      result = await peer.request("acquire", {
        ...request,
        scope,
        clientPid: process.pid
      });
    } catch (error) {
      peer.close();
      throw error;
    }
    let released = false;
    const renew = async () => {
      if (released) return;
      const renewed = await peer.request("renew", { leaseId: result.leaseId });
      result.expiresAt = renewed.expiresAt;
    };
    const timer = setInterval(() => {
      void renew().catch(() => void 0);
    }, Math.floor(LEASE_TTL_MS / 3));
    timer.unref?.();
    this.activeLeases.set(result.leaseId, { peer, timer });
    return {
      leaseId: result.leaseId,
      expiresAt: result.expiresAt,
      logDirectory: join5(directory, "logs", "host"),
      descriptor: result.descriptor,
      renew,
      release: async () => {
        if (released) return;
        released = true;
        await this.release(result.leaseId);
      }
    };
  }
  async status(scope) {
    const directory = scopeDirectory(canonicalizeScope(scope));
    let peer;
    try {
      peer = await openLineConnection(endpointFor(directory));
      return await peer.request("status", { scope: canonicalizeScope(scope) });
    } catch {
      return null;
    } finally {
      peer?.close();
    }
  }
  async release(leaseId2) {
    const active = this.activeLeases.get(leaseId2);
    if (active !== void 0) {
      this.activeLeases.delete(leaseId2);
      clearInterval(active.timer);
      await active.peer.request("release", { leaseId: leaseId2 }).catch(() => void 0);
      active.peer.close();
      return;
    }
    const home = supervisorHome();
    if (!existsSync4(home)) throw new Error(`unknown lease: ${leaseId2}`);
    for (const entry of readdirSync4(home, { withFileTypes: true, encoding: "utf8" })) {
      if (!entry.isDirectory()) continue;
      const directory = join5(home, entry.name);
      if (!existsSync4(join5(leaseDirectory(directory), `${leaseId2}.json`))) continue;
      try {
        const peer = await openLineConnection(endpointFor(directory));
        await peer.request("release", { leaseId: leaseId2 }).catch(() => void 0);
        peer.close();
        return;
      } catch {
      }
    }
    throw new Error(`unknown lease: ${leaseId2}`);
  }
  async connectOrStart(directory) {
    const endpoint = endpointFor(directory);
    let existing;
    try {
      existing = await openLineConnection(endpoint);
    } catch {
    }
    if (existing !== void 0) {
      try {
        const doctor = await existing.request("doctor");
        if (doctor.supervisorBuildRevision === SUPERVISOR_BUILD_REVISION) return existing;
        existing.close();
        if ((doctor.leaseCount ?? 0) > 0) {
          throw new Error("Host Supervisor is running an older build while active clients still hold leases; release them before upgrading.");
        }
        await stopStaleSupervisor(doctor.pid, doctor.descriptor?.hostPid);
      } catch (error) {
        existing.close();
        throw error;
      }
    }
    const serviceEntry = this.options.serviceEntry ?? process.env.COCODE_SUPERVISOR_SERVICE_ENTRY ?? fileURLToPath2(new URL("./bin.js", import.meta.url));
    const node = this.options.nodeExecutable ?? resolveNodeExecutable();
    const child = spawn2(node, [serviceEntry, "service", "--state-dir", directory], {
      detached: true,
      stdio: "ignore",
      env: { ...process.env, COCODE_SUPERVISOR_STATE_DIR: directory }
    });
    child.unref();
    const deadline = Date.now() + (this.options.startupTimeoutMs ?? 15e3);
    let lastError;
    while (Date.now() < deadline) {
      try {
        return await openLineConnection(endpoint);
      } catch (error) {
        lastError = error;
        await new Promise((resolve5) => setTimeout(resolve5, 100));
      }
    }
    throw new Error(`Host Supervisor did not become ready: ${String(lastError)}`);
  }
};
async function stopStaleSupervisor(supervisorPid, hostPid) {
  if (hostPid !== void 0 && isProcessAlive2(hostPid)) await terminateProcess(hostPid, "DSH Host");
  if (supervisorPid !== void 0 && isProcessAlive2(supervisorPid)) await terminateProcess(supervisorPid, "Host Supervisor");
}
async function terminateProcess(pid, label) {
  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    if (error.code !== "ESRCH") throw new Error(`Unable to stop stale ${label} (${pid}): ${String(error)}`);
  }
  const deadline = Date.now() + 2e3;
  while (Date.now() < deadline && isProcessAlive2(pid)) await new Promise((resolve5) => setTimeout(resolve5, 100));
  if (isProcessAlive2(pid)) throw new Error(`Stale ${label} (${pid}) did not exit after SIGTERM.`);
}
function isProcessAlive2(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}
function createHostSupervisorClient(options) {
  return new LocalHostSupervisorClient(options);
}
function resolveNodeExecutable() {
  const explicit = process.env.COCODE_NODE_EXECUTABLE?.trim();
  if (explicit) return explicit;
  const npmNode = process.env.npm_node_execpath?.trim();
  if (npmNode) return npmNode;
  return process.execPath.includes("Electron") || process.execPath.endsWith("electron") ? "node" : process.execPath;
}

// packages/host-supervisor/src/bin.ts
var args = process.argv.slice(2);
if (args[0] === "service") {
  const index = args.indexOf("--state-dir");
  const directory = index >= 0 ? args[index + 1] : process.env.COCODE_SUPERVISOR_STATE_DIR;
  if (!directory) throw new Error("cocode-host-supervisor service requires --state-dir");
  await runSupervisorService(directory);
} else if (args[0] === "doctor") {
  const home = process.env.DSH_HOME?.trim() || resolve4(homedir3(), ".dsh");
  const profile = process.env.DSH_PROFILE?.trim() || "web";
  const scope = {
    dshHome: home,
    profile,
    hostConfigFingerprint: process.env.COCODE_HOST_CONFIG_FINGERPRINT?.trim() || "cocode-web-jsonrpc-v1",
    runtimeChannel: process.env.COCODE_RUNTIME_CHANNEL === "preview" || process.env.COCODE_RUNTIME_CHANNEL === "dev" ? process.env.COCODE_RUNTIME_CHANNEL : "stable"
  };
  const checks = [
    ["package", true],
    ["DSH_HOME", home !== ""],
    ["profile", profile !== ""]
  ];
  let lease;
  try {
    lease = await createHostSupervisorClient().acquire({
      scope,
      clientKind: "standalone-tui",
      requiredServices: ["web", "jsonrpc"],
      minProtocolRevision: "1.0"
    });
    const descriptor = lease.descriptor;
    checks.push(
      ["supervisor IPC", true],
      ["Host descriptor", descriptor.schemaVersion === 1],
      ["Supervisor protocol", descriptor.supervisorProtocolRevision.startsWith("1.")],
      ["Web service", descriptor.services.some((service) => service.service === "web")],
      ["JSON-RPC service", descriptor.services.some((service) => service.service === "jsonrpc")],
      ["Host protocol", descriptor.hostProtocolRevision.startsWith("1.")],
      ["capabilities", ["session", "event", "workspace"].every((capability) => descriptor.capabilities.includes(capability))],
      ["DSH_HOME/profile", descriptor.dshHome === scope.dshHome && descriptor.profile === scope.profile],
      ["runtime version", descriptor.runtimeVersion !== ""],
      ["lease create/release", true]
    );
  } catch (error) {
    checks.push(["supervisor IPC", false], ["Host descriptor", false]);
    process.stderr.write(`doctor: ${error instanceof Error ? error.message : String(error)}
`);
  } finally {
    await lease?.release().catch(() => void 0);
  }
  for (const [label, ok] of checks) process.stdout.write(`${ok ? "ok" : "missing"} ${label}
`);
  process.exitCode = checks.every(([, ok]) => ok) ? 0 : 1;
} else if (args[0] === "--version" || args[0] === "-v") {
  process.stdout.write("0.1.0\n");
} else {
  process.stdout.write("Usage: cocode-host-supervisor [--version] | service --state-dir <directory>\n");
}
//# sourceMappingURL=bin.js.map
