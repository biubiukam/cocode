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

// packages/host-supervisor/src/ipc.ts
import net from "node:net";
function openLineConnection(endpoint) {
  return new Promise((resolve3, reject) => {
    const socket = net.createConnection(endpoint);
    const peer = new LinePeer(socket, socket);
    const onError = (error) => {
      socket.destroy();
      reject(error);
    };
    socket.once("error", onError);
    socket.once("connect", () => {
      socket.off("error", onError);
      resolve3(peer);
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
    return new Promise((resolve3, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve: (value) => {
        clearTimeout(timer);
        resolve3(value);
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
        await new Promise((resolve3) => setTimeout(resolve3, 100));
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
  while (Date.now() < deadline && isProcessAlive(pid)) await new Promise((resolve3) => setTimeout(resolve3, 100));
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

// packages/host-supervisor/src/runtime.ts
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
  canonicalizeScope,
  connectJsonRpc,
  createHostSupervisorClient,
  createRuntimePatch,
  fingerprint,
  hostKey,
  isHostDescriptorCompatible,
  leaseId,
  resolveNodeExecutable,
  stableJson
};
//# sourceMappingURL=index.js.map
