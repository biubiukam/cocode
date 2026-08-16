// packages/host-supervisor/src/host-jsonrpc-plugin/index.ts
import net from "node:net";
import { chmodSync, existsSync, unlinkSync } from "node:fs";

// packages/host-supervisor/src/host-jsonrpc-plugin/transport.ts
import { StringDecoder } from "node:string_decoder";
var CompanionTransport = class {
  constructor(input, output) {
    this.input = input;
    this.output = output;
  }
  input;
  output;
  buffer = "";
  decoder = new StringDecoder("utf8");
  handler;
  started = false;
  closed = false;
  onRequest(handler) {
    this.handler = handler;
  }
  start() {
    if (this.started || this.closed) return;
    this.started = true;
    this.input.on("data", this.onData);
    this.input.on("end", this.onEnd);
    this.input.on("error", this.onError);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.input.off("data", this.onData);
    this.input.off("end", this.onEnd);
    this.input.off("error", this.onError);
  }
  notify(method, params) {
    if (this.closed) return;
    this.write(
      params === void 0 ? { jsonrpc: "2.0", method } : { jsonrpc: "2.0", method, params }
    );
  }
  flush() {
    return new Promise((resolve2, reject) => {
      this.output.write("", (error) => error == null ? resolve2() : reject(error));
    });
  }
  onData = (chunk) => {
    this.buffer += typeof chunk === "string" ? chunk : this.decoder.write(chunk);
    for (; ; ) {
      const newline = this.buffer.indexOf("\n");
      if (newline < 0) return;
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line !== "") void this.handleLine(line);
    }
  };
  onEnd = () => {
    this.buffer += this.decoder.end();
    this.onData("");
    this.close();
  };
  onError = () => {
    this.close();
  };
  async handleLine(line) {
    let frame;
    try {
      frame = JSON.parse(line);
    } catch {
      return;
    }
    if (!isRecord(frame)) return;
    const id = frame.id;
    const method = frame.method;
    if (!isRpcId(id) || typeof method !== "string") return;
    const handler = this.handler;
    if (handler === void 0) {
      this.writeError(id, -32601, `method not found: ${method}`);
      return;
    }
    try {
      const result = await handler(method, objectParams(frame.params));
      this.write({ jsonrpc: "2.0", id, result });
    } catch (error) {
      this.writeError(id, -32603, error instanceof Error ? error.message : String(error));
    }
  }
  writeError(id, code, message) {
    this.write({ jsonrpc: "2.0", id, error: { code, message } });
  }
  write(frame) {
    if (!this.closed) this.output.write(`${JSON.stringify(frame)}
`);
  }
};
function isRpcId(value) {
  return typeof value === "string" || typeof value === "number";
}
function objectParams(value) {
  return isRecord(value) ? value : {};
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// packages/host-supervisor/src/host-jsonrpc-plugin/gateway.ts
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
var TuiCompanionGateway = class {
  constructor(ctx, transport, options = {}) {
    this.ctx = ctx;
    this.transport = transport;
    this.disposers.push(
      ctx.on("session/event", (session, event) => {
        if (event.type === "turn/start" || event.type === "turn/end") {
          this.turnAllowances.delete(String(session.id));
        }
        transport.notify("session.event", { sessionId: String(session.id), event });
      })
    );
    this.disposers.push(
      ctx.on("agent/status", ({ agent, status }) => {
        transport.notify("session.status", { sessionId: String(agent.session.id), status });
      })
    );
    this.disposers.push(
      ctx.on("session/created", (session) => {
        const parentSession = session.header.parentSession;
        if (parentSession === void 0) return;
        transport.notify("subagent.started", {
          parentSessionId: String(parentSession),
          childSessionId: String(session.id)
        });
      })
    );
    this.approvalDisposer = this.registerApprovalProvider();
    if (options.registerQuestionProvider !== false) this.tryRegisterQuestionProvider();
  }
  ctx;
  transport;
  cwd = process.cwd();
  provider = "deepseek-official";
  model = "deepseek-official";
  maxTokens;
  initialized = false;
  shuttingDown = false;
  shutdownTask;
  sessions = /* @__PURE__ */ new Map();
  sessionCreations = /* @__PURE__ */ new Map();
  sessionOpenings = /* @__PURE__ */ new Map();
  pendingPermissionModes = /* @__PURE__ */ new Map();
  pendingPlanModes = /* @__PURE__ */ new Map();
  turnAllowances = /* @__PURE__ */ new Map();
  pendingQuestions = /* @__PURE__ */ new Map();
  pendingApprovals = /* @__PURE__ */ new Map();
  disposers = [];
  questionDisposer;
  approvalDisposer;
  /** Register optional question provider when the service is already mounted. */
  tryRegisterQuestionProvider() {
    if (this.questionDisposer !== void 0) return;
    const service = this.ctx.get("userQuestions");
    if (service === void 0) return;
    try {
      this.questionDisposer = service.registerProvider({
        ask: (request) => this.askQuestion(request)
      });
    } catch (error) {
      if (error?.code !== "DUPLICATE_PROVIDER") throw error;
    }
  }
  /** Remove the question provider owned by this gateway. */
  unregisterQuestionProvider() {
    this.questionDisposer?.();
    this.questionDisposer = void 0;
  }
  registerApprovalProvider() {
    if (this.ctx.get("approval") === void 0) return void 0;
    return this.ctx.on(
      "approval/request",
      (request, next) => {
        const sessionId = String(request.agent.session.id);
        if (!this.sessions.has(sessionId)) return next();
        const turn = openTurnOf(request.agent.session.events);
        if (turn !== void 0 && this.hasTurnAllowance(sessionId, request.toolName, turn)) {
          return Promise.resolve("allowed-once");
        }
        return this.askApproval(request, turn);
      }
    );
  }
  /** Advertise only services that are actually present in this composition. */
  capabilities() {
    const llm = this.ctx.get("llm");
    return {
      protocolVersion: 1,
      promptModes: ["normal", "queue", "steer"],
      skills: this.ctx.get("skills") !== void 0,
      modelList: typeof llm?.listProviders === "function" && typeof llm.listModels === "function",
      imageAttachments: this.ctx.get("attachments") !== void 0,
      approval: this.ctx.get("approval") !== void 0,
      permissionMode: this.ctx.get("permissionPresets") !== void 0,
      planMode: this.ctx.get("planMode") !== void 0,
      sessionList: this.ctx.get("sessionPersistence") !== void 0,
      commands: this.ctx.get("commands") !== void 0,
      interactions: "notification-response",
      checkpoint: false
    };
  }
  async initialize(params) {
    if (params.maxTokens !== void 0 && (!Number.isSafeInteger(params.maxTokens) || params.maxTokens <= 0)) {
      throw new TypeError("initialize maxTokens must be a positive safe integer");
    }
    this.cwd = resolve(params.cwd);
    this.provider = params.provider;
    this.model = params.model;
    this.maxTokens = params.maxTokens;
    this.initialized = true;
    const llm = this.ctx.get("llm");
    if (llm?.listProviders !== void 0 && !llm.listProviders().some((entry) => entry.id === this.provider)) {
      throw new Error(`no adapter registered for provider "${this.provider}"`);
    }
    return {
      serverInfo: { name: "cocode-tui-companion", version: "0.1.0" },
      capabilities: this.capabilities()
    };
  }
  async prompt(params) {
    this.assertInitialized();
    const record = await this.getOrCreateSession(params.sessionId);
    this.assertLive(params.sessionId, record);
    const vision = this.ctx.get("cocodeVision");
    const contentBlocks = vision === void 0 ? params.contentBlocks : await vision.prepareBlocks(params.contentBlocks);
    const message = createUserMessage(contentBlocks);
    switch (params.mode ?? "normal") {
      case "normal":
      case "queue":
        record.handle.agent.followup(message);
        break;
      case "steer":
        record.handle.agent.steer(message);
        break;
      default:
        throw new Error(`session/prompt has unsupported mode: ${String(params.mode)}`);
    }
    return { messageId: message.id };
  }
  async saveImages(params) {
    this.assertInitialized();
    const store = this.ctx.get("attachments");
    if (store === void 0) {
      throw new Error("image attachment capability is unavailable: attachment storage is not configured");
    }
    if (!Array.isArray(params.images) || params.images.length === 0) {
      throw new TypeError("attachment/saveImages requires at least one image");
    }
    if (params.images.length > store.imageLimits.maxImagesPerMessage) {
      throw new Error(`image count exceeds ${store.imageLimits.maxImagesPerMessage}`);
    }
    const images = params.images.map(
      (image, index) => parseImageInput(image, index, store.imageLimits.maxImageBytes, store.imageLimits.mediaTypes)
    );
    const totalBytes = images.reduce((total, image) => total + image.data.byteLength, 0);
    if (totalBytes > store.imageLimits.maxMessageImageBytes) {
      throw new Error(`image bytes exceed ${store.imageLimits.maxMessageImageBytes}`);
    }
    await Promise.all(images.map((image) => store.validateImage(image)));
    return { attachments: await Promise.all(images.map((image) => store.saveImage(image))) };
  }
  async listSessions(params = {}) {
    const persistence = this.ctx.get("sessionPersistence");
    if (persistence === void 0)
      throw new Error(
        "session/list capability is unavailable: session persistence is not configured"
      );
    const cwd = resolve(params.cwd ?? this.cwd);
    const headers = (await persistence.list()).filter((header) => header.cwd === cwd);
    const sessions = await Promise.all(
      headers.map(async (header) => {
        const inspection = await persistence.inspect(header.id);
        const last = inspection.events.at(-1);
        const title = readSessionTitle(inspection.events);
        return {
          sessionId: String(header.id),
          createdAt: header.createdAt,
          ...last === void 0 ? {} : { updatedAt: last.time },
          ...header.cwd === void 0 ? {} : { cwd: header.cwd },
          ...header.parentSession === void 0 ? {} : { parentSessionId: String(header.parentSession) },
          ...header.seedLength === void 0 ? {} : { seedLength: header.seedLength },
          ...title === void 0 ? {} : { title },
          eventCount: inspection.events.length
        };
      })
    );
    return { sessions };
  }
  async permissionMode(params) {
    this.assertInitialized();
    const service = this.ctx.get("permissionPresets");
    if (service === void 0)
      throw new Error(
        "permission/mode capability is unavailable: permission presets are not configured"
      );
    const existing = this.sessions.get(params.sessionId);
    const pending = this.sessionCreations.get(params.sessionId);
    const opening = this.sessionOpenings.get(params.sessionId);
    if (existing === void 0 && pending === void 0 && opening === void 0 && params.mode === void 0) {
      return { mode: service.current([]), supportedModes: [...service.names] };
    }
    if (params.mode === void 0) {
      await this.pendingPermissionModes.get(params.sessionId);
      const record = existing === void 0 ? await this.getOrCreateSession(params.sessionId) : this.assertLive(params.sessionId, existing);
      return {
        mode: service.current(record.handle.agent.session.events),
        supportedModes: [...service.names]
      };
    }
    const change = (async () => {
      const record = existing === void 0 ? await this.getOrCreateSession(params.sessionId) : this.assertLive(params.sessionId, existing);
      service.set(record.handle.agent.session, params.mode);
      return record;
    })();
    {
      this.pendingPermissionModes.set(params.sessionId, change);
      try {
        const record = await change;
        return {
          mode: service.current(record.handle.agent.session.events),
          supportedModes: [...service.names]
        };
      } finally {
        if (this.pendingPermissionModes.get(params.sessionId) === change)
          this.pendingPermissionModes.delete(params.sessionId);
      }
    }
  }
  async planMode(params) {
    this.assertInitialized();
    const service = this.ctx.get("planMode");
    if (service === void 0)
      throw new Error("plan/mode capability is unavailable: plan mode is not configured");
    const existing = this.sessions.get(params.sessionId);
    const pending = this.sessionCreations.get(params.sessionId);
    const opening = this.sessionOpenings.get(params.sessionId);
    if (existing === void 0 && pending === void 0 && opening === void 0 && params.active !== true) {
      return { active: false };
    }
    if (params.active === void 0) {
      await this.pendingPlanModes.get(params.sessionId);
      const record = existing === void 0 ? await this.getOrCreateSession(params.sessionId) : this.assertLive(params.sessionId, existing);
      return service.get(record.handle.agent);
    }
    const change = (async () => {
      const record = existing === void 0 ? await this.getOrCreateSession(params.sessionId) : this.assertLive(params.sessionId, existing);
      service.set(record.handle.agent, params.active);
      return record;
    })();
    {
      this.pendingPlanModes.set(params.sessionId, change);
      try {
        const record = await change;
        return service.get(record.handle.agent);
      } finally {
        if (this.pendingPlanModes.get(params.sessionId) === change)
          this.pendingPlanModes.delete(params.sessionId);
      }
    }
  }
  cancel(params) {
    const record = this.requireSession(params.sessionId);
    const wasRunning = record.handle.agent.status === "running";
    record.handle.agent.cancel({ kind: "user" }, { keepInbox: params.keepInbox === true });
    return { cancelled: wasRunning };
  }
  async open(params) {
    this.assertInitialized();
    if (this.shuttingDown) throw new Error("companion is shutting down");
    const existing = this.sessions.get(params.sessionId);
    if (existing !== void 0) return { opened: false };
    const pending = this.sessionOpenings.get(params.sessionId);
    if (pending !== void 0) {
      await pending;
      return { opened: false };
    }
    const live = this.ctx.agents.get(params.sessionId);
    if (live !== void 0) {
      const record = this.borrowSession(live);
      this.sessions.set(params.sessionId, record);
      await this.replaceSession(params.replaceSessionId, params.sessionId);
      return { opened: true, seed: [...live.session.events], seedLength: live.session.events.length };
    }
    const opening = this.resumeSession(params.sessionId);
    this.sessionOpenings.set(params.sessionId, opening);
    try {
      const record = await opening;
      this.sessions.set(params.sessionId, record);
      await this.replaceSession(params.replaceSessionId, params.sessionId);
      return { opened: true, seed: record.seed ?? [], seedLength: record.seed?.length ?? 0 };
    } finally {
      if (this.sessionOpenings.get(params.sessionId) === opening)
        this.sessionOpenings.delete(params.sessionId);
    }
  }
  async fork(params) {
    this.assertInitialized();
    if (this.shuttingDown) throw new Error("companion is shutting down");
    const source = this.requireSession(params.sourceSessionId);
    if (source.handle.agent.status === "running") {
      source.handle.agent.cancel({ kind: "user" });
      await source.handle.agent.whenIdle();
    }
    const boundary = resolveForkBoundary(source.handle.agent.session.events, params);
    const seed = this.ctx.sessions.forkSeed(source.handle.agent.session, boundary);
    const sessionId = params.childSessionId ?? `session-${randomUUID().replaceAll("-", "")}`;
    if (this.ctx.agents.get(sessionId) !== void 0)
      throw new Error(`session "${sessionId}" already exists`);
    const handle = await this.ctx.agents.create({
      sessionId,
      seed,
      meta: {
        cwd: this.cwd,
        parentSession: source.handle.agent.session.id,
        seedLength: seed.length
      },
      agentOptions: {
        provider: this.provider,
        model: this.model,
        ...this.maxTokens === void 0 ? {} : { maxTokens: this.maxTokens }
      }
    });
    this.sessions.set(sessionId, { handle, owned: true });
    await this.replaceSession(params.replaceSessionId, sessionId);
    return { sessionId, seedLength: seed.length, seed: [...seed] };
  }
  async listSkills(params) {
    if (params.sessionId.trim() === "") throw new Error("skills/list requires a session id");
    const registry = this.ctx.get("skills");
    if (registry === void 0) throw new Error("skills registry is not configured");
    const skills = await registry.list({ cwd: this.cwd });
    return {
      skills: skills.filter((skill) => skill.invocation?.userInvocable !== false).map((skill) => ({
        name: skill.name,
        description: skill.description,
        ...skill.whenToUse === void 0 ? {} : { whenToUse: skill.whenToUse },
        ...skill.source === void 0 ? {} : { source: skill.source }
      }))
    };
  }
  async listCommands(params) {
    if (params.sessionId.trim() === "") throw new Error("commands/list requires a session id");
    const registry = this.ctx.get("commands");
    if (registry === void 0) throw new Error("commands registry is not configured");
    const record = await this.getOrCreateSession(params.sessionId);
    this.assertLive(params.sessionId, record);
    return { commands: [...registry.list(record.handle.agent)] };
  }
  async executeCommand(params) {
    if (params.sessionId.trim() === "") throw new Error("commands/execute requires a session id");
    if (typeof params.line !== "string") throw new TypeError("commands/execute requires a command line");
    const registry = this.ctx.get("commands");
    if (registry === void 0) throw new Error("commands registry is not configured");
    const record = await this.getOrCreateSession(params.sessionId);
    this.assertLive(params.sessionId, record);
    return registry.execute(record.handle.agent, params.line, new AbortController().signal);
  }
  async listModels() {
    const llm = this.ctx.get("llm");
    if (typeof llm?.listProviders !== "function" || typeof llm.listModels !== "function") {
      throw new Error("model/list capability is unavailable: llm is not configured");
    }
    const service = llm;
    const groups = [];
    const failures = [];
    for (const provider of service.listProviders()) {
      const name2 = provider.name ?? provider.id;
      try {
        const models = await service.listModels(provider.id);
        groups.push({
          id: provider.id,
          name: name2,
          models: models.map((model) => ({
            id: model.id,
            name: model.name ?? model.id,
            ...model.description === void 0 ? {} : { description: model.description }
          }))
        });
      } catch (error) {
        failures.push({
          id: provider.id,
          name: name2,
          message: safeModelCatalogError(error)
        });
      }
    }
    return { groups, failures };
  }
  async respondQuestion(params) {
    const requestId = stringValue(params.requestId);
    const pending = requestId === void 0 ? void 0 : this.pendingQuestions.get(requestId);
    if (requestId === void 0 || pending === void 0)
      throw new Error(`unknown question request: ${String(params.requestId)}`);
    this.pendingQuestions.delete(requestId);
    if (params.cancelled === true) {
      pending.reject(new Error("ask_user_question was interrupted before the user answered"));
      return {};
    }
    try {
      const answer = parseQuestionAnswer(params.answer);
      validateQuestionAnswer(pending.questions, answer);
      pending.resolve(answer);
    } catch (error) {
      pending.reject(error instanceof Error ? error : new Error(String(error)));
    }
    return {};
  }
  async respondApproval(params) {
    const requestId = stringValue(params.requestId);
    const pending = requestId === void 0 ? void 0 : this.pendingApprovals.get(requestId);
    if (requestId === void 0 || pending === void 0)
      throw new Error(`unknown approval request: ${String(params.requestId)}`);
    this.pendingApprovals.delete(requestId);
    try {
      pending.resolve(parseApprovalOutcome(params.outcome));
    } catch (error) {
      pending.reject(error instanceof Error ? error : new Error(String(error)));
    }
    return {};
  }
  async handleRequest(method, params = {}) {
    switch (method) {
      case "initialize":
        return this.initialize(params);
      case "session/prompt":
        return this.prompt(params);
      case "cocode/capabilities":
        return this.capabilities();
      case "cocode/session/list":
      case "session/list":
        return this.listSessions(params);
      case "cocode/session/cancel":
      case "session/cancel":
        return this.cancel(params);
      case "cocode/session/open":
      case "session/open":
        return this.open(params);
      case "cocode/session/fork":
      case "session/fork":
        return this.fork(
          params
        );
      case "cocode/skills/list":
      case "skills/list":
        return this.listSkills(params);
      case "cocode/commands/list":
      case "commands/list":
        return this.listCommands(params);
      case "cocode/commands/execute":
      case "commands/execute":
        return this.executeCommand(params);
      case "cocode/model/list":
      case "model/list":
        return this.listModels();
      case "cocode/attachment/saveImages":
        return this.saveImages(params);
      case "cocode/permission/mode":
      case "permission/mode":
        return this.permissionMode(params);
      case "cocode/plan/mode":
      case "plan/mode":
        return this.planMode(params);
      case "cocode/question/respond":
      case "question/respond":
        return this.respondQuestion(params);
      case "cocode/approval/respond":
      case "approval/respond":
        return this.respondApproval(params);
      case "shutdown":
        return this.shutdown();
      default:
        throw new Error(`unknown Cocode TUI companion method: ${method}`);
    }
  }
  shutdown() {
    this.shutdownTask ??= this.performShutdown();
    return this.shutdownTask;
  }
  /** Detach this socket without disposing agents owned by the shared Host. */
  disconnect() {
    this.shutdownTask ??= this.performShutdown();
    return this.shutdownTask;
  }
  async askQuestion(request) {
    const requestId = `question-${randomUUID()}`;
    const pending = createDeferred();
    this.pendingQuestions.set(requestId, {
      questions: request.questions,
      resolve: pending.resolve,
      reject: pending.reject
    });
    this.transport.notify("cocode/question/request", {
      requestId,
      sessionId: request.agent === void 0 ? "" : String(request.agent.session.id),
      questions: request.questions
    });
    return raceWithAbort(pending.promise, request.signal, () => {
      this.pendingQuestions.delete(requestId);
      pending.reject(new Error("question request cancelled"));
    });
  }
  async askApproval(request, turn) {
    const requestId = `approval-${randomUUID()}`;
    const pending = createDeferred();
    this.pendingApprovals.set(requestId, { resolve: pending.resolve, reject: pending.reject });
    this.transport.notify("cocode/approval/request", {
      requestId,
      sessionId: String(request.agent.session.id),
      toolName: request.toolName,
      ...typeof request.callId === "string" ? { callId: request.callId } : {},
      ...typeof request.reason === "string" ? { reason: request.reason } : {},
      ...typeof request.target === "string" ? { target: request.target } : {},
      ...typeof request.risk === "string" ? { risk: request.risk } : {},
      ...typeof request.source === "string" ? { source: request.source } : {}
    });
    const outcome = await raceWithAbort(pending.promise, request.signal, () => {
      this.pendingApprovals.delete(requestId);
      pending.resolve("cancelled");
    });
    if (outcome === "allowed-for-turn" && turn !== void 0)
      this.rememberTurnAllowance(String(request.agent.session.id), request.toolName, turn);
    return outcome === "allowed-for-turn" ? "allowed-once" : parseApprovalOutcome(outcome);
  }
  async getOrCreateSession(sessionId) {
    if (this.shuttingDown) throw new Error("companion is shutting down");
    const existing = this.sessions.get(sessionId);
    if (existing !== void 0) return existing;
    const live = this.ctx.agents.get(sessionId);
    if (live !== void 0) {
      const borrowed = this.borrowSession(live);
      this.sessions.set(sessionId, borrowed);
      return borrowed;
    }
    const opening = this.sessionOpenings.get(sessionId);
    if (opening !== void 0) return opening;
    const pending = this.sessionCreations.get(sessionId);
    if (pending !== void 0) return pending;
    const creation = this.createSession(sessionId);
    this.sessionCreations.set(sessionId, creation);
    void creation.then(
      () => this.sessionCreations.delete(sessionId),
      () => this.sessionCreations.delete(sessionId)
    );
    return creation;
  }
  async createSession(sessionId) {
    const handle = await this.ctx.agents.create({
      sessionId,
      meta: { cwd: this.cwd },
      agentOptions: {
        provider: this.provider,
        model: this.model,
        ...this.maxTokens === void 0 ? {} : { maxTokens: this.maxTokens }
      }
    });
    const record = { handle, owned: true };
    this.sessions.set(sessionId, record);
    return record;
  }
  async resumeSession(sessionId) {
    const persistence = this.ctx.get("sessionPersistence");
    if (persistence === void 0)
      throw new Error("cannot open session: session persistence is not configured");
    const inspection = await persistence.inspect(sessionId);
    if (inspection.meta.cwd !== this.cwd)
      throw new Error(`session belongs to a different workspace: ${sessionId}`);
    const handle = await this.ctx.agents.resume({
      resumeSessionId: sessionId,
      agentOptions: {
        provider: this.provider,
        model: this.model,
        ...this.maxTokens === void 0 ? {} : { maxTokens: this.maxTokens }
      }
    });
    return { handle, seed: [...inspection.events], owned: true };
  }
  borrowSession(agent) {
    return {
      owned: false,
      handle: {
        agent,
        dispose: async () => void 0
      },
      seed: [...agent.session.events]
    };
  }
  async replaceSession(replaceSessionId, currentSessionId) {
    if (replaceSessionId === void 0 || replaceSessionId === currentSessionId) return;
    const previous = this.sessions.get(replaceSessionId);
    if (previous === void 0) return;
    this.sessions.delete(replaceSessionId);
    await previous.handle.dispose();
  }
  requireSession(sessionId) {
    const record = this.sessions.get(sessionId);
    if (record === void 0) throw new Error(`unknown companion session: ${sessionId}`);
    return this.assertLive(sessionId, record);
  }
  assertLive(sessionId, record) {
    if (this.ctx.agents.get(record.handle.agent.id) !== record.handle.agent)
      throw new Error(`session agent was disposed outside the companion: ${sessionId}`);
    return record;
  }
  assertInitialized() {
    if (!this.initialized)
      throw new Error("initialize must be called before using the companion runtime");
  }
  hasTurnAllowance(sessionId, toolName, turn) {
    const allowance = this.turnAllowances.get(sessionId);
    return allowance?.turn === turn && allowance.tools.has(toolName);
  }
  rememberTurnAllowance(sessionId, toolName, turn) {
    const allowance = this.turnAllowances.get(sessionId);
    if (allowance?.turn === turn) allowance.tools.add(toolName);
    else this.turnAllowances.set(sessionId, { turn, tools: /* @__PURE__ */ new Set([toolName]) });
  }
  async performShutdown() {
    this.shuttingDown = true;
    await Promise.allSettled([...this.sessionCreations.values(), ...this.sessionOpenings.values()]);
    this.sessionCreations.clear();
    this.sessionOpenings.clear();
    this.unregisterQuestionProvider();
    this.approvalDisposer?.();
    this.approvalDisposer = void 0;
    const failures = [];
    for (const pending of this.pendingQuestions.values())
      pending.reject(new Error("companion is shutting down"));
    for (const pending of this.pendingApprovals.values())
      pending.reject(new Error("companion is shutting down"));
    this.pendingQuestions.clear();
    this.pendingApprovals.clear();
    this.sessions.clear();
    for (const dispose of this.disposers.splice(0)) {
      try {
        dispose();
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, "TUI companion teardown failed");
    return {};
  }
};
function safeModelCatalogError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const redacted = message.replace(/https?:\/\/[^\s]+/gi, "[redacted endpoint]").replace(
    /\b(?:api[-_ ]?key|access[-_ ]?token|authorization|auth|token|secret|password)\s*[:=]\s*(?:Bearer\s+)?[^\s,;]+/gi,
    "[redacted]"
  ).replace(/\b(?:sk-|sk_|ck_(?:live|test)_)[A-Za-z0-9_-]+/g, "[redacted]").replace(/[\r\n]+/g, " ").trim();
  return redacted.length > 240 ? `${redacted.slice(0, 237)}...` : redacted;
}
function createUserMessage(content) {
  const message = {
    id: randomUUID(),
    role: "user",
    content,
    source: { kind: "user" }
  };
  return deepFreeze(message);
}
function parseImageInput(value, index, maxBytes, mediaTypes) {
  if (!isRecord2(value) || typeof value.data !== "string" || !isImageMediaType(value.mediaType)) {
    throw new TypeError(`attachment/saveImages image ${index + 1} is invalid`);
  }
  if (!mediaTypes.includes(value.mediaType)) {
    throw new Error(`attachment/saveImages does not accept ${value.mediaType}`);
  }
  const data = decodeBase64(value.data, maxBytes);
  const name2 = typeof value.name === "string" && value.name.trim() !== "" ? value.name.trim() : void 0;
  return {
    data,
    mediaType: value.mediaType,
    ...name2 === void 0 ? {} : { name: name2 }
  };
}
function decodeBase64(value, maxBytes) {
  if (value === "" || value.length > Math.ceil(maxBytes / 3) * 4 + 4 || !BASE64_PATTERN.test(value)) {
    throw new Error("attachment/saveImages contains invalid base64 data");
  }
  const data = Buffer.from(value, "base64");
  if (data.byteLength > maxBytes || data.toString("base64") !== value) {
    throw new Error("attachment/saveImages contains invalid base64 data");
  }
  return data;
}
function isImageMediaType(value) {
  return value === "image/png" || value === "image/jpeg" || value === "image/webp" || value === "image/gif";
}
var BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
function deepFreeze(value) {
  if (value !== null && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
function resolveForkBoundary(events, params) {
  if (params.boundary !== void 0 && params.rewindToMessageSeq !== void 0)
    throw new Error("session/fork accepts boundary or rewindToMessageSeq, not both");
  if (params.rewindToMessageSeq === void 0) return params.boundary;
  const messageIndex = events.findIndex((event) => event.seq === params.rewindToMessageSeq);
  if (events[messageIndex]?.type !== "user/message")
    throw new Error(
      `rewind message seq does not identify a user message: ${params.rewindToMessageSeq}`
    );
  let turnStart;
  for (let index = messageIndex; index >= 0; index -= 1) {
    if (events[index].type === "turn/start") {
      turnStart = events[index];
      break;
    }
  }
  if (turnStart === void 0 || turnStart.seq === 0)
    throw new Error("cannot rewind to the first turn");
  return turnStart.seq - 1;
}
function openTurnOf(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type === "turn/end") return void 0;
    if (event.type === "turn/start" && isRecord2(event.data) && typeof event.data.turn === "number")
      return event.data.turn;
  }
  return void 0;
}
function readSessionTitle(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type === "session/title" && isRecord2(event.data) && typeof event.data.title === "string" && event.data.title.length > 0)
      return event.data.title;
  }
  return void 0;
}
function parseQuestionAnswer(value) {
  if (!isRecord2(value) || !Array.isArray(value.answers))
    throw new Error("question response returned no answer batch");
  return {
    answers: value.answers.map((entry) => {
      if (!isRecord2(entry) || typeof entry.id !== "string" || !Array.isArray(entry.selected) || !entry.selected.every((item) => typeof item === "string"))
        throw new Error("question response returned an invalid answer");
      return {
        id: entry.id,
        selected: entry.selected,
        ...typeof entry.custom === "string" ? { custom: entry.custom } : {}
      };
    })
  };
}
function validateQuestionAnswer(questions, answer) {
  if (questions.length !== answer.answers.length)
    throw new Error("question response count does not match the request");
  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index];
    const item = answer.answers[index];
    if (item.id !== question.id) throw new Error("question response id does not match the request");
    if (new Set(item.selected).size !== item.selected.length)
      throw new Error("question response repeats an option");
    if (item.custom !== void 0 && item.custom.trim() === "")
      throw new Error("question custom answer must not be empty");
    if (question.multiSelect !== true && item.selected.length > 1)
      throw new Error("question response selected multiple options for a single-select question");
    if (question.multiSelect !== true && item.custom !== void 0 && item.selected.length > 0)
      throw new Error("question response combined an option with custom text");
    const labels = new Set(question.options?.map((option) => option.label) ?? []);
    if (item.selected.some((label) => !labels.has(label)))
      throw new Error("question response selected an unknown option");
    if (item.selected.length === 0 && item.custom === void 0)
      throw new Error("question response is empty");
  }
}
function parseApprovalOutcome(value) {
  if (value !== "allowed-once" && value !== "allowed-for-turn" && value !== "rejected" && value !== "cancelled" && value !== "unavailable")
    throw new Error(`unsupported approval outcome: ${String(value)}`);
  return value;
}
function raceWithAbort(promise, signal, onAbort) {
  if (signal === void 0) return promise;
  if (signal.aborted) {
    onAbort();
    return Promise.reject(new Error("interaction request cancelled"));
  }
  return new Promise((resolve2, reject) => {
    const abort = () => {
      signal.removeEventListener("abort", abort);
      onAbort();
      reject(new Error("interaction request cancelled"));
    };
    signal.addEventListener("abort", abort, { once: true });
    void promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve2(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      }
    );
  });
}
function createDeferred() {
  let resolvePromise = () => void 0;
  let rejectPromise = () => void 0;
  const promise = new Promise((resolve2, reject) => {
    resolvePromise = resolve2;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}
function stringValue(value) {
  return typeof value === "string" && value.trim() !== "" ? value : void 0;
}
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// packages/host-supervisor/src/host-jsonrpc-plugin/index.ts
var name = "cocode-host-jsonrpc";
var inject = ["agents"];
function apply(ctx, config = { endpoint: "" }) {
  if (!config.endpoint) throw new Error("cocode-host-jsonrpc requires an endpoint");
  const clients = /* @__PURE__ */ new Set();
  let questionOwner;
  const server = net.createServer((socket) => {
    let authenticated = false;
    let buffer = "";
    const transport = new CompanionTransport(socket, socket);
    const gateway = new TuiCompanionGateway(ctx, transport, { registerQuestionProvider: false });
    clients.add(gateway);
    if (questionOwner === void 0) {
      questionOwner = gateway;
      gateway.tryRegisterQuestionProvider();
    }
    const onData = (chunk) => {
      buffer += chunk.toString();
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      const first = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      let frame;
      try {
        frame = JSON.parse(first);
      } catch {
        socket.destroy();
        return;
      }
      if (frame.method !== "cocode/host/connect" || typeof frame.id !== "number") {
        socket.destroy();
        return;
      }
      authenticated = true;
      socket.write(`${JSON.stringify({ jsonrpc: "2.0", id: frame.id, result: { protocolRevision: config.protocolRevision ?? "1.0", capabilities: ["session", "event", "workspace"] } })}
`);
      socket.off("data", onData);
      if (buffer) socket.emit("data", Buffer.from(buffer));
      transport.start();
    };
    socket.on("data", onData);
    socket.once("close", () => {
      clients.delete(gateway);
      void gateway.disconnect().catch(() => void 0);
      transport.close();
      if (questionOwner === gateway) {
        questionOwner = clients.values().next().value;
        questionOwner?.tryRegisterQuestionProvider();
      }
    });
    transport.onRequest(async (method, params) => gateway.handleRequest(method, params));
  });
  if (process.platform !== "win32" && existsSync(config.endpoint)) unlinkSync(config.endpoint);
  server.listen(config.endpoint);
  if (process.platform !== "win32") {
    try {
      chmodSync(config.endpoint, 384);
    } catch {
    }
  }
  ctx.effect?.(() => async () => {
    await new Promise((resolve2) => server.close(() => resolve2()));
  }, "cocode-host-jsonrpc.serve");
}
export {
  apply,
  inject,
  name
};
//# sourceMappingURL=host-jsonrpc-plugin.js.map
