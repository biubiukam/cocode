// packages/host-supervisor/src/service.ts
import net2 from "node:net";
import { closeSync, mkdirSync as mkdirSync2, openSync, readFileSync as readFileSync2, readdirSync as readdirSync2, rmSync as rmSync2, writeFileSync as writeFileSync2, renameSync } from "node:fs";
import { spawn } from "node:child_process";
import { join as join3 } from "node:path";
import { fileURLToPath } from "node:url";

// packages/host-supervisor/src/paths.ts
import { homedir as homedir2 } from "node:os";
import { join, resolve as resolve2 } from "node:path";

// packages/host-supervisor/src/protocol.ts
import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { resolve } from "node:path";
var SUPERVISOR_PROTOCOL_REVISION = "1.0";
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
  restoreNodePtyHelper(slot);
  const patch = join2(slot, "cocode-host.patch.yml");
  const rows = [
    "- insert:",
    "    - id: cocode-host-jsonrpc",
    `      name: ${JSON.stringify(pathToFileURL(pluginTarget).href)}`,
    "      config:",
    `        endpoint: ${JSON.stringify(jsonRpcEndpoint)}`,
    `        protocolRevision: "1.0"`,
    ...pluginEntries.flatMap(({ name, entry: entry2 }, index) => [
      `    - id: cocode-plugin-${index}`,
      `      name: ${JSON.stringify(pathToFileURL(entry2).href)}`
    ]),
    ""
  ].join("\n");
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

// packages/host-supervisor/src/service.ts
async function runSupervisorService(stateDirectory) {
  mkdirSync2(stateDirectory, { recursive: true, mode: 448 });
  const scope = JSON.parse(readFileSync2(scopePath(stateDirectory), "utf8"));
  const service = new SupervisorService(stateDirectory, scope);
  await service.start();
  await service.wait();
}
var SupervisorService = class {
  constructor(directory, scope) {
    this.directory = directory;
    this.scope = scope;
  }
  directory;
  scope;
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
    mkdirSync2(leaseDirectory(this.directory), { recursive: true, mode: 448 });
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
    const requestedScope = canonicalizeScope(request.scope);
    if (JSON.stringify(requestedScope) !== JSON.stringify(this.scope)) {
      throw new Error("Host scope does not match this Supervisor scope");
    }
    if (!this.host || !isHostDescriptorCompatible(this.host.descriptor, this.scope, request)) {
      if (this.host && this.leases.size > 0) throw new Error("existing Host is incompatible while leases are active");
      if (this.host) await this.stopHost();
      await this.startHost(request);
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
    return { leaseId: id, expiresAt, descriptor: this.host.descriptor };
  }
  async startHost(request) {
    const jsonRpcEndpoint = process.platform === "win32" ? `\\\\.\\pipe\\cocode-dsh-jsonrpc-${hostKey(this.scope)}` : join3(this.directory, "dsh-jsonrpc.sock");
    const pluginPath = fileURLToPath(new URL("./host-jsonrpc-plugin.js", import.meta.url));
    const slot = prepareRuntimeSlot(this.scope, jsonRpcEndpoint, pluginPath);
    const workspace = join3(this.scope.dshHome, "workspaces", "default");
    mkdirSync2(workspace, { recursive: true });
    const args2 = this.scope.profile === "web" ? ["web"] : ["--profile", this.scope.profile];
    args2.push("--patch", slot.patch, "--port", "0");
    const child = spawn(process.execPath, [slot.entry, ...args2], {
      cwd: workspace,
      env: { ...process.env, DSH_HOME: this.scope.dshHome, COCODE_DSH_PROFILE: this.scope.profile },
      stdio: ["ignore", "pipe", "pipe"]
    });
    child.once("exit", () => {
      if (this.host?.child !== child) return;
      this.host = null;
      rmSync2(descriptorPath(this.directory), { force: true });
    });
    let output = "";
    const ready = new Promise((resolve5, reject) => {
      const timer = setTimeout(() => reject(new Error(`DSH Host startup timed out.
${output}`)), 6e4);
      const inspect = (chunk) => {
        output += chunk.toString();
        const match = output.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+)/);
        if (match?.[1]) {
          clearTimeout(timer);
          resolve5(match[1]);
        }
      };
      child.stdout?.on("data", inspect);
      child.stderr?.on("data", (chunk) => {
        output += chunk.toString();
      });
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("exit", (code) => {
        if (code !== null) {
          clearTimeout(timer);
          reject(new Error(`DSH Host exited before ready: ${String(code)}
${output}`));
        }
      });
    });
    const webUrl = await ready;
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
  }
  async status() {
    return this.host?.descriptor ?? this.readDescriptor();
  }
  renew(id) {
    const record = this.leases.get(id);
    if (!record) throw new Error("unknown lease");
    record.expiresAt = new Date(Date.now() + LEASE_TTL_MS).toISOString();
    this.persistLease(record);
    return { expiresAt: record.expiresAt };
  }
  async release(id) {
    this.leases.delete(id);
    rmSync2(join3(leaseDirectory(this.directory), `${id}.json`), { force: true });
    if (this.leases.size === 0 && this.host) this.armIdleShutdown();
    return {};
  }
  armIdleShutdown() {
    if (!this.host || this.host.idleTimer) return;
    this.host.idleTimer = setTimeout(() => {
      void this.stopHost();
    }, Number(process.env.COCODE_HOST_IDLE_TIMEOUT_MS ?? 2e4));
    this.host.idleTimer.unref?.();
  }
  async stopHost() {
    const host = this.host;
    if (!host) return;
    this.host = null;
    const pid = host.child?.pid ?? host.descriptor.hostPid;
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
  }
  cleanupLeases() {
    const now = Date.now();
    for (const record of this.leases.values()) if (Date.parse(record.expiresAt) <= now) {
      this.leases.delete(record.leaseId);
      rmSync2(join3(leaseDirectory(this.directory), `${record.leaseId}.json`), { force: true });
    }
  }
  loadLeases() {
    for (const file of readdirSync2(leaseDirectory(this.directory), { withFileTypes: true })) {
      if (!file.name.endsWith(".json")) continue;
      try {
        const record = JSON.parse(readFileSync2(join3(leaseDirectory(this.directory), file.name), "utf8"));
        if (Date.parse(record.expiresAt) > Date.now()) this.leases.set(record.leaseId, record);
      } catch {
        rmSync2(join3(leaseDirectory(this.directory), file.name), { force: true });
      }
    }
  }
  persistLease(record) {
    writeFileSync2(join3(leaseDirectory(this.directory), `${record.leaseId}.json`), JSON.stringify(record) + "\n", { mode: 384 });
  }
  writeDescriptor(descriptor) {
    const temp = `${descriptorPath(this.directory)}.${process.pid}.tmp`;
    writeFileSync2(temp, JSON.stringify(descriptor, null, 2) + "\n", { mode: 384 });
    renameSync(temp, descriptorPath(this.directory));
  }
  readDescriptor() {
    try {
      return JSON.parse(readFileSync2(descriptorPath(this.directory), "utf8"));
    } catch {
      return null;
    }
  }
  doctor() {
    return { supervisorProtocolRevision: SUPERVISOR_PROTOCOL_REVISION, scope: this.scope, descriptor: this.readDescriptor(), leaseCount: this.leases.size, pid: process.pid };
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
        const fd = openSync(lockPath(this.directory), "wx", 384);
        try {
          writeFileSync2(fd, JSON.stringify({ pid: process.pid, startedAt: (/* @__PURE__ */ new Date()).toISOString() }) + "\n");
        } finally {
          closeSync(fd);
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
import { existsSync as existsSync3, mkdirSync as mkdirSync3, readdirSync as readdirSync3, writeFileSync as writeFileSync3 } from "node:fs";
import { spawn as spawn2 } from "node:child_process";
import { join as join4 } from "node:path";
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
    mkdirSync3(directory, { recursive: true, mode: 448 });
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
    if (!existsSync3(home)) throw new Error(`unknown lease: ${leaseId2}`);
    for (const entry of readdirSync3(home, { withFileTypes: true, encoding: "utf8" })) {
      if (!entry.isDirectory()) continue;
      const directory = join4(home, entry.name);
      if (!existsSync3(join4(leaseDirectory(directory), `${leaseId2}.json`))) continue;
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
    try {
      return await openLineConnection(endpoint);
    } catch {
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
