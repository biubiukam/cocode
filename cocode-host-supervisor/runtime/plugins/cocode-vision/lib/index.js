// src/config.ts
import { lstatSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { parse } from "yaml";
var CONFIG_FILE_NAME = "vision.yaml";
function loadVisionConfig(env = process.env) {
  const path = configPath(env);
  let metadata;
  try {
    metadata = lstatSync(path);
  } catch (error) {
    if (isMissing(error)) return void 0;
    throw error;
  }
  if (metadata.isSymbolicLink()) throw new Error(`cocode vision config must not be a symbolic link: ${path}`);
  if (!metadata.isFile()) throw new Error(`cocode vision config must be a file: ${path}`);
  let value;
  try {
    value = parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`could not parse cocode vision config: ${path}`);
  }
  return parseVisionConfig(value, path);
}
function mergeVisionConfig(stored, override) {
  const user = mergeEndpointConfig(stored?.user, override.user);
  const cocode = mergeEndpointConfig(stored?.cocode, override.cocode);
  return {
    ...definedFields(stored),
    ...definedFields(override),
    ...user === void 0 ? {} : { user },
    ...cocode === void 0 ? {} : { cocode }
  };
}
function configPath(env) {
  const configured = nonempty(env.COCODE_VISION_CONFIG);
  if (configured !== void 0) return isAbsolute(configured) ? configured : resolve(configured);
  const home = nonempty(env.COCODE_HOME);
  return join(home === void 0 ? join(homedir(), ".cocode") : resolve(home), CONFIG_FILE_NAME);
}
function parseVisionConfig(value, path) {
  const root = asRecord(value);
  if (root === void 0) throw new Error(`cocode vision config must be a mapping: ${path}`);
  const provider = root.provider;
  if (provider !== void 0 && provider !== "user" && provider !== "cocode") {
    throw new Error(`cocode vision config has an invalid provider: ${path}`);
  }
  const timeoutMs = root.timeoutMs;
  if (timeoutMs !== void 0 && (typeof timeoutMs !== "number" || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0)) {
    throw new Error(`cocode vision config has an invalid timeoutMs: ${path}`);
  }
  return {
    ...provider === void 0 ? {} : { provider },
    ...typeof timeoutMs === "number" ? { timeoutMs } : {},
    ...typeof root.autoRead === "boolean" ? { autoRead: root.autoRead } : {},
    ...typeof root.fallbackToNative === "boolean" ? { fallbackToNative: root.fallbackToNative } : {},
    ...root.user === void 0 ? {} : { user: parseEndpointConfig(root.user, path, "user") },
    ...root.cocode === void 0 ? {} : { cocode: parseEndpointConfig(root.cocode, path, "cocode") }
  };
}
function parseEndpointConfig(value, path, name2) {
  const root = asRecord(value);
  if (root === void 0) throw new Error(`cocode vision config ${name2} must be a mapping: ${path}`);
  return {
    ...stringField(root.endpoint) ? { endpoint: root.endpoint } : {},
    ...stringField(root.model) ? { model: root.model } : {},
    ...stringField(root.credentialRef) ? { credentialRef: root.credentialRef } : {}
  };
}
function mergeEndpointConfig(stored, override) {
  if (stored === void 0 && override === void 0) return void 0;
  return {
    ...stored ?? {},
    ...definedFields(override)
  };
}
function definedFields(value) {
  if (value === void 0) return {};
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== void 0));
}
function asRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function stringField(value) {
  return typeof value === "string" && value.trim() !== "";
}
function nonempty(value) {
  const trimmed = value?.trim();
  return trimmed === void 0 || trimmed === "" ? void 0 : trimmed;
}
function isMissing(error) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

// src/index.ts
var DEFAULT_TIMEOUT_MS = 45e3;
var DEFAULT_COCODE_MODEL = "gpt-luna";
var DEFAULT_USER_CREDENTIAL = "OPENAI_API_KEY";
var DEFAULT_COCODE_CREDENTIAL = "COCODE_CLOUD_API_KEY";
var IMAGE_BLOCK_TYPE = "image";
var name = "cocode-vision";
var inject = ["attachments"];
function apply(ctx, rawConfig = {}) {
  const service = createVisionService(ctx, mergeVisionConfig(loadVisionConfig(), rawConfig));
  ctx.provide?.("cocodeVision", service);
}
function createVisionService(ctx, rawConfig = {}) {
  const config = resolveConfig(rawConfig);
  return {
    status: async () => {
      const target = targetOf(config);
      if (!config.autoRead) {
        return {
          enabled: false,
          provider: config.provider,
          configured: false,
          model: target.model,
          endpoint: target.endpoint,
          reason: "automatic image reading is disabled"
        };
      }
      if (target.endpoint === void 0 || target.model === "") {
        return {
          enabled: true,
          provider: config.provider,
          configured: false,
          model: target.model,
          endpoint: void 0,
          reason: target.endpoint === void 0 ? "vision endpoint is not configured" : "vision model is not configured"
        };
      }
      const credential = await resolveCredential(ctx, target.credentialRef);
      return {
        enabled: true,
        provider: config.provider,
        configured: credential !== void 0,
        model: target.model,
        endpoint: redactEndpoint(target.endpoint),
        ...credential === void 0 ? { reason: `credential ${target.credentialRef} is not configured` } : {}
      };
    },
    prepareBlocks: async (blocks, options = {}) => {
      if (!config.autoRead || !blocks.some((block) => block.type === IMAGE_BLOCK_TYPE)) {
        return [...blocks];
      }
      const target = targetOf(config);
      if (config.fallbackToNative && !await isConfigured(ctx, target)) return [...blocks];
      const prompt = blocks.filter((block) => block.type === "text" && typeof block.text === "string").map((block) => block.text).join("\n").trim();
      const output = [];
      for (const block of blocks) {
        if (block.type !== IMAGE_BLOCK_TYPE) {
          output.push(block);
          continue;
        }
        const attachment = asRecord2(block.attachment);
        if (attachment === void 0) throw new Error("vision image block is missing its attachment reference");
        const evidence = await describeImage(ctx, config, attachment, prompt);
        output.push({
          type: "text",
          text: `[Image evidence]
${evidence}`
        });
        if (options.preserveImages !== false) output.push(block);
      }
      return output;
    }
  };
}
async function describeImage(ctx, config, attachment, prompt) {
  const store = ctx.get("attachments");
  if (store === void 0) throw new Error("vision capability requires the attachment store");
  const target = targetOf(config);
  if (target.endpoint === void 0) throw new Error("vision endpoint is not configured");
  const credential = await resolveCredential(ctx, target.credentialRef);
  if (credential === void 0) throw new Error(`vision credential ${target.credentialRef} is not configured`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const image = await store.readImage(attachment, controller.signal);
    const response = await fetch(normalizeEndpoint(target.endpoint), {
      method: "POST",
      headers: {
        authorization: `Bearer ${credential.value}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: target.model,
        messages: [{
          role: "user",
          content: [
            {
              type: "text",
              text: prompt || "Describe this image precisely. Include visible text, layout, objects, and uncertainty."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${image.ref.mediaType};base64,${Buffer.from(image.data).toString("base64")}`
              }
            }
          ]
        }]
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`vision provider returned HTTP ${response.status}`);
    }
    const payload = await response.json();
    const text = readResponseText(payload);
    if (text === void 0) throw new Error("vision provider returned no text evidence");
    return text;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("vision provider request timed out");
    throw error instanceof Error ? new Error(safeVisionError(error.message)) : new Error("vision provider request failed");
  } finally {
    clearTimeout(timer);
  }
}
function resolveConfig(raw) {
  const provider = envProvider() ?? raw.provider ?? "cocode";
  if (provider !== "user" && provider !== "cocode") {
    throw new Error('cocode-vision provider must be "user" or "cocode"');
  }
  const user = {
    endpoint: process.env.COCODE_VISION_USER_ENDPOINT ?? raw.user?.endpoint,
    model: process.env.COCODE_VISION_USER_MODEL ?? raw.user?.model ?? "",
    credentialRef: process.env.COCODE_VISION_USER_CREDENTIAL_REF ?? raw.user?.credentialRef ?? DEFAULT_USER_CREDENTIAL
  };
  const cocodeRoute = readCocodeRoute();
  const cocode = {
    endpoint: process.env.COCODE_VISION_ENDPOINT ?? raw.cocode?.endpoint ?? (cocodeRoute?.baseURL === void 0 ? void 0 : appendChatCompletions(cocodeRoute.baseURL)),
    model: process.env.COCODE_VISION_MODEL ?? raw.cocode?.model ?? DEFAULT_COCODE_MODEL,
    credentialRef: process.env.COCODE_VISION_CREDENTIAL_REF ?? raw.cocode?.credentialRef ?? cocodeRoute?.credentialRef ?? DEFAULT_COCODE_CREDENTIAL
  };
  const timeoutMs = Number(process.env.COCODE_VISION_TIMEOUT_MS ?? raw.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error("vision timeoutMs must be a positive safe integer");
  return {
    provider,
    user,
    cocode,
    timeoutMs,
    autoRead: raw.autoRead ?? true,
    fallbackToNative: raw.fallbackToNative ?? true
  };
}
function readCocodeRoute() {
  const raw = process.env.COCODE_LLM_PROVIDERS;
  if (raw === void 0 || raw.trim() === "") return void 0;
  try {
    const root = JSON.parse(raw);
    const route = asRecord2(asRecord2(root)?.["cocode-cloud"]);
    if (route === void 0) return void 0;
    const baseURL = typeof route.baseURL === "string" && route.baseURL.trim() !== "" ? route.baseURL.trim() : void 0;
    const credentialRef = typeof route.apiKeyEnv === "string" && route.apiKeyEnv.trim() !== "" ? route.apiKeyEnv.trim() : void 0;
    return {
      ...baseURL === void 0 ? {} : { baseURL },
      ...credentialRef === void 0 ? {} : { credentialRef }
    };
  } catch {
    return void 0;
  }
}
function appendChatCompletions(baseURL) {
  const normalized = normalizeEndpoint(baseURL);
  return normalized.endsWith("/chat/completions") ? normalized : `${normalized}/chat/completions`;
}
async function isConfigured(ctx, target) {
  if (target.endpoint === void 0 || target.model === "") return false;
  return await resolveCredential(ctx, target.credentialRef) !== void 0;
}
function targetOf(config) {
  return config.provider === "user" ? config.user : config.cocode;
}
async function resolveCredential(ctx, ref) {
  const credentials = ctx.get("credentials");
  if (credentials === void 0) return void 0;
  return credentials.resolve(ref);
}
function readResponseText(value) {
  const root = asRecord2(value);
  const choices = root?.choices;
  if (!Array.isArray(choices)) return void 0;
  const message = asRecord2(choices[0])?.message;
  const content = asRecord2(message)?.content;
  if (typeof content === "string" && content.trim() !== "") return content.trim();
  if (!Array.isArray(content)) return void 0;
  const text = content.map((part) => asRecord2(part)?.text).filter((part) => typeof part === "string").join("").trim();
  return text === "" ? void 0 : text;
}
function normalizeEndpoint(endpoint) {
  return endpoint.endsWith("/") ? endpoint.slice(0, -1) : endpoint;
}
function redactEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "[configured endpoint]";
  }
}
function safeVisionError(message) {
  return message.replace(/https?:\/\/[^\s]+/gi, "[redacted endpoint]").replace(/\b(?:api[-_ ]?key|authorization|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, "[redacted]").replace(/\b(?:sk-|ck_(?:live|test)_)[A-Za-z0-9_-]+/g, "[redacted]").replace(/[\r\n]+/g, " ").slice(0, 240);
}
function envProvider() {
  const value = process.env.COCODE_VISION_PROVIDER;
  return value === "user" || value === "cocode" ? value : void 0;
}
function asRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
export {
  apply,
  createVisionService,
  inject,
  name
};
//# sourceMappingURL=index.js.map
