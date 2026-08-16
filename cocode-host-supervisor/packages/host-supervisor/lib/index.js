// packages/host-supervisor/src/protocol.ts
import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { resolve } from "node:path";
var SUPERVISOR_PROTOCOL_REVISION = "1.0";
var SUPERVISOR_BUILD_REVISION = "runtime-lifecycle-v4";
var HOST_PROTOCOL_REVISION = "1.0";
var LEASE_TTL_MS = 3e4;
function canonicalizeScope(scope) {
  const dshHome = resolve(scope.dshHome.trim() || `${homedir()}/.dsh`);
  const profile = scope.profile.trim() || "web";
  const fingerprint2 = scope.hostConfigFingerprint.trim() || "default";
  const runtimeChannel = scope.runtimeChannel === "preview" || scope.runtimeChannel === "dev" ? scope.runtimeChannel : "stable";
  return { dshHome, profile, hostConfigFingerprint: fingerprint2, runtimeChannel };
}
function hostKey(scope) {
  const normalized = canonicalizeScope(scope);
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex").slice(0, 32);
}
function fingerprint(value) {
  return createHash("sha256").update(stableJson(value)).digest("hex").slice(0, 32);
}
function leaseId() {
  return randomUUID();
}
function stableJson(value) {
  if (value === void 0) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
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

// packages/host-supervisor/src/client.ts
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { join as join2 } from "node:path";
import { fileURLToPath } from "node:url";

// packages/host-supervisor/src/paths.ts
import { homedir as homedir2 } from "node:os";
import { join, resolve as resolve2 } from "node:path";
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
function scopePath(directory) {
  return join(directory, "scope.json");
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
  return new Promise((resolve4, reject) => {
    const socket = net.createConnection(endpoint);
    const peer = new LinePeer(socket, socket);
    const onError = (error) => {
      socket.destroy();
      reject(error);
    };
    socket.once("error", onError);
    socket.once("connect", () => {
      socket.off("error", onError);
      resolve4(peer);
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
    return new Promise((resolve4, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve: (value) => {
        clearTimeout(timer);
        resolve4(value);
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

// packages/host-supervisor/src/client.ts
function canReuseOlderSupervisor(request, doctor) {
  if ((doctor.leaseCount ?? 0) <= 0) return false;
  return doctor.descriptor !== void 0 && doctor.descriptor !== null && isHostDescriptorCompatible(
    doctor.descriptor,
    request.scope,
    request
  );
}
var LocalHostSupervisorClient = class {
  constructor(options = {}) {
    this.options = options;
  }
  options;
  activeLeases = /* @__PURE__ */ new Map();
  async acquire(request) {
    const scope = canonicalizeScope(request.scope);
    const directory = scopeDirectory(scope);
    mkdirSync(directory, { recursive: true, mode: 448 });
    writeFileSync(scopePath(directory), JSON.stringify(scope) + "\n", { mode: 384 });
    const peer = await this.connectOrStart(directory, request);
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
      logDirectory: join2(directory, "logs", "host"),
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
    if (!existsSync(home)) throw new Error(`unknown lease: ${leaseId2}`);
    for (const entry of readdirSync(home, { withFileTypes: true, encoding: "utf8" })) {
      if (!entry.isDirectory()) continue;
      const directory = join2(home, entry.name);
      if (!existsSync(join2(leaseDirectory(directory), `${leaseId2}.json`))) continue;
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
  async connectOrStart(directory, request) {
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
        if (canReuseOlderSupervisor(request, doctor)) return existing;
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
    const serviceEntry = this.options.serviceEntry ?? process.env.COCODE_SUPERVISOR_SERVICE_ENTRY ?? fileURLToPath(new URL("./bin.js", import.meta.url));
    const node = this.options.nodeExecutable ?? resolveNodeExecutable();
    const child = spawn(node, [serviceEntry, "service", "--state-dir", directory], {
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
        await new Promise((resolve4) => setTimeout(resolve4, 100));
      }
    }
    throw new Error(`Host Supervisor did not become ready: ${String(lastError)}`);
  }
};
async function stopStaleSupervisor(supervisorPid, hostPid) {
  if (hostPid !== void 0 && isProcessAlive(hostPid)) await terminateProcess(hostPid, "DSH Host");
  if (supervisorPid !== void 0 && isProcessAlive(supervisorPid)) await terminateProcess(supervisorPid, "Host Supervisor");
}
async function terminateProcess(pid, label) {
  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    if (error.code !== "ESRCH") throw new Error(`Unable to stop stale ${label} (${pid}): ${String(error)}`);
  }
  const deadline = Date.now() + 2e3;
  while (Date.now() < deadline && isProcessAlive(pid)) await new Promise((resolve4) => setTimeout(resolve4, 100));
  if (isProcessAlive(pid)) throw new Error(`Stale ${label} (${pid}) did not exit after SIGTERM.`);
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

// packages/host-supervisor/src/lifecycle.ts
function isLeaseActive(record, now, processAlive) {
  return Date.parse(record.expiresAt) > now && processAlive(record.pid);
}

// packages/host-supervisor/src/runtime.ts
import { createRequire } from "node:module";
import { chmodSync, cpSync, existsSync as existsSync2, mkdirSync as mkdirSync2, readFileSync, readdirSync as readdirSync2, realpathSync, rmSync, writeFileSync as writeFileSync2 } from "node:fs";
import { basename, dirname, join as join3, resolve as resolve3 } from "node:path";
import { pathToFileURL } from "node:url";
function mergeHostRuntimeEnv(baseEnv, runtimeEnv, dshHome) {
  return {
    ...baseEnv,
    ...runtimeEnv ?? {},
    DSH_HOME: dshHome
  };
}
function resolveDshPackage() {
  const require2 = createRequire(import.meta.url);
  const entry = require2.resolve("@deepseek-ai/dsh/lib/bin.js");
  let root = dirname(entry);
  while (root !== dirname(root) && !existsSync2(join3(root, "package.json"))) root = dirname(root);
  const manifest = JSON.parse(readFileSync(join3(root, "package.json"), "utf8"));
  const buildId = typeof manifest.buildId === "string" ? manifest.buildId : typeof manifest.gitHead === "string" ? manifest.gitHead : process.env.COCODE_DSH_BUILD_ID?.trim() || void 0;
  return { root, entry, version: String(manifest.version), ...buildId === void 0 ? {} : { buildId } };
}
function prepareRuntimeSlot(scope, jsonRpcEndpoint, pluginPath) {
  const dsh = resolveDshPackage();
  const slot = runtimeSlotDirectory(scope, dsh.version);
  const entry = join3(slot, "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
  const pluginRoot = resolve3(dirname(pluginPath), "../../../runtime/plugins");
  const pluginSources = existsSync2(pluginRoot) ? readdirSync2(pluginRoot, { withFileTypes: true }).filter((item) => item.isDirectory()).map((item) => join3(pluginRoot, item.name)) : [];
  if (!existsSync2(entry)) {
    rmSync(slot, { recursive: true, force: true });
    mkdirSync2(join3(slot, "node_modules", "@deepseek-ai"), { recursive: true });
    copyPackageClosure(dsh.root, slot, pluginSources);
    mkdirSync2(slot, { recursive: true });
    writeFileSync2(join3(slot, "package.json"), JSON.stringify({ type: "module", private: true }) + "\n");
  }
  const pluginTarget = join3(slot, "cocode-host-jsonrpc-plugin.mjs");
  cpSync(pluginPath, pluginTarget);
  const pluginEntries = [];
  if (existsSync2(pluginRoot)) {
    for (const entry2 of readdirSync2(pluginRoot, { withFileTypes: true })) {
      if (!entry2.isDirectory()) continue;
      const source = join3(pluginRoot, entry2.name);
      const target = join3(slot, "node_modules", ...entry2.name.split("/"));
      mkdirSync2(dirname(target), { recursive: true });
      cpSync(source, target, { recursive: true, dereference: true });
      pluginEntries.push({ name: entry2.name, entry: join3(target, "lib", "index.js") });
    }
  }
  registerRuntimePluginsInDshManifest(slot, pluginEntries);
  restoreNodePtyHelper(slot);
  const patch = join3(slot, "cocode-host.patch.yml");
  const rows = createRuntimePatch(pathToFileURL(pluginTarget).href, jsonRpcEndpoint, pluginEntries);
  writeFileSync2(patch, rows);
  writeFileSync2(join3(slot, "active.json"), `${JSON.stringify({
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
  const manifestPath = join3(slot, "node_modules", "@deepseek-ai", "dsh", "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const pluginManifests = pluginEntries.map(({ name }) => {
    const pluginManifestPath = join3(slot, "node_modules", ...name.split("/"), "package.json");
    return JSON.parse(readFileSync(pluginManifestPath, "utf8"));
  });
  const next = addRuntimePluginDependencies(manifest, pluginManifests);
  writeFileSync2(manifestPath, `${JSON.stringify(next, null, 2)}
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
    join3(root, "node_modules", "node-pty", "prebuilds", `${process.platform}-${process.arch}`, "spawn-helper"),
    join3(root, "node_modules", "node-pty", "build", "Release", "spawn-helper")
  ]) {
    if (existsSync2(helper)) chmodSync(helper, 493);
  }
}
function copyPackageClosure(dshRoot, slot, additionalRoots = []) {
  const targetModules = join3(slot, "node_modules");
  const pending = [realpathSync(dshRoot), ...additionalRoots.map((root) => realpathSync(root))];
  const copied = /* @__PURE__ */ new Set();
  const resolved = /* @__PURE__ */ new Map();
  while (pending.length > 0) {
    const sourceRoot = pending.shift();
    const manifestPath = join3(sourceRoot, "package.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (typeof manifest.name !== "string" || copied.has(manifest.name)) continue;
    copied.add(manifest.name);
    resolved.set(manifest.name, sourceRoot);
    const destination = join3(targetModules, ...manifest.name.split("/"));
    mkdirSync2(dirname(destination), { recursive: true });
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
        const dependencyRoot = resolvePackageRoot(packageRequire, dependency, dshRoot);
        pending.push(dependencyRoot);
      } catch (error) {
        if (manifest.optionalDependencies?.[dependency] !== void 0 || manifest.peerDependenciesMeta?.[dependency]?.optional === true) continue;
        throw new Error(`Unable to resolve DSH runtime dependency ${dependency} from ${sourceRoot}: ${String(error)}`);
      }
    }
  }
}
function resolvePackageRoot(require2, packageName, fallbackRoot) {
  for (const searchPath of require2.resolve.paths(packageName) ?? []) {
    const candidate = join3(searchPath, ...packageName.split("/"));
    const manifestPath = join3(candidate, "package.json");
    if (!existsSync2(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (manifest.name === packageName) return realpathSync(candidate);
  }
  if (fallbackRoot !== void 0 && fallbackRoot !== dirname(fallbackRoot)) {
    const fallbackRequire = createRequire(join3(fallbackRoot, "package.json"));
    if (fallbackRequire !== require2) return resolvePackageRoot(fallbackRequire, packageName);
  }
  throw new Error(`package root not found for ${packageName}`);
}

// packages/host-supervisor/src/socket-jsonrpc-client.ts
async function connectJsonRpc(endpoint, token) {
  const peer = await openLineConnection(endpoint.endpoint);
  const subscriptions = /* @__PURE__ */ new Set();
  const closeHandlers = /* @__PURE__ */ new Set();
  peer.onNotification((method, params) => {
    for (const handler of subscriptions) handler({ method, params });
  });
  peer.onClose((error) => {
    const message = error.message || void 0;
    for (const handler of closeHandlers) handler(message);
  });
  await peer.request("cocode/host/connect", { token: token ?? endpoint.token ?? null, protocolRevision: endpoint.protocolRevision });
  return {
    request: (method, params, timeoutMs) => peer.request(method, params ?? {}, timeoutMs),
    subscribe: (handler) => {
      subscriptions.add(handler);
      return () => subscriptions.delete(handler);
    },
    onClose: (handler) => {
      closeHandlers.add(handler);
      return () => closeHandlers.delete(handler);
    },
    close: () => peer.close()
  };
}
export {
  HOST_PROTOCOL_REVISION,
  LEASE_TTL_MS,
  LocalHostSupervisorClient,
  SUPERVISOR_BUILD_REVISION,
  SUPERVISOR_PROTOCOL_REVISION,
  addRuntimePluginDependencies,
  canReuseOlderSupervisor,
  canonicalizeScope,
  connectJsonRpc,
  createHostSupervisorClient,
  createRuntimePatch,
  fingerprint,
  hostKey,
  isHostDescriptorCompatible,
  isLeaseActive,
  leaseId,
  mergeHostRuntimeEnv,
  prepareRuntimeSlot,
  resolveNodeExecutable,
  stableJson
};
//# sourceMappingURL=index.js.map
