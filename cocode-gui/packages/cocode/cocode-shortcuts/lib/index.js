import { SettingsConflictError, settingsNamespace } from "@deepseek-ai/dsh-settings";
import z from "schemastery";
//#region src/trust-fence.ts
function header(headers, name) {
	const value = headers[name];
	return typeof value === "string" ? value : void 0;
}
function parseAuthority(authority) {
	try {
		return new URL("http://" + authority);
	} catch {
		return;
	}
}
function isLoopbackHostname(hostname) {
	if (hostname === "localhost" || hostname === "[::1]") return true;
	const parts = hostname.split(".");
	return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
function canonicalAuthority(entry, entryUrl) {
	const port = entryUrl.port !== "" ? entryUrl.port : new URL("https://" + entry).port;
	return port === "" ? entryUrl.hostname : entryUrl.hostname + ":" + port;
}
function isTrustedAuthority(hostUrl, trustedHosts) {
	return trustedHosts.some((entry) => {
		const entryUrl = parseAuthority(entry);
		if (entryUrl === void 0) return false;
		return canonicalAuthority(entry, entryUrl) === entryUrl.hostname ? entryUrl.hostname === hostUrl.hostname : entryUrl.host === hostUrl.host;
	});
}
/**
* Mirror the DSH gateway fence: loopback or an explicit trusted authority,
* with cross-site browser requests rejected.
*/
function isTrustedApiRequest(request, trustedHosts) {
	const host = header(request.headers, "host");
	if (host === void 0) return false;
	const hostUrl = parseAuthority(host);
	if (hostUrl === void 0) return false;
	if (!isLoopbackHostname(hostUrl.hostname) && !isTrustedAuthority(hostUrl, trustedHosts)) return false;
	if (header(request.headers, "sec-fetch-site") === "cross-site") return false;
	const origin = header(request.headers, "origin");
	if (origin === void 0) return true;
	try {
		return new URL(origin).host === hostUrl.host;
	} catch {
		return false;
	}
}
//#endregion
//#region src/wire.ts
var ShortcutsRouteError = class extends Error {
	constructor(code, message, status = 400) {
		super(message);
		this.code = code;
		this.status = status;
	}
};
const MAX_BODY_BYTES = 64 * 1024;
async function readJsonBody(request) {
	const chunks = [];
	let total = 0;
	for await (const chunk of request) {
		const buffer = Buffer.from(chunk);
		total += buffer.length;
		if (total > MAX_BODY_BYTES) throw new ShortcutsRouteError("bad-request", "request body too large");
		chunks.push(buffer);
	}
	const text = Buffer.concat(chunks).toString("utf8");
	if (text.trim() === "") return {};
	try {
		return JSON.parse(text);
	} catch {
		throw new ShortcutsRouteError("bad-request", "request body is not valid JSON");
	}
}
function writeJson(response, status, body) {
	response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
	response.end(JSON.stringify(body));
}
function writeOk(response, value) {
	writeJson(response, 200, {
		ok: true,
		value
	});
}
function writeError(response, error) {
	if (error instanceof ShortcutsRouteError) {
		writeJson(response, error.status, {
			ok: false,
			error: {
				code: error.code,
				message: error.message
			}
		});
		return;
	}
	writeJson(response, 500, {
		ok: false,
		error: {
			code: "internal",
			message: error instanceof Error ? error.message : String(error)
		}
	});
}
//#endregion
//#region src/route.ts
const SHORTCUTS_API_PREFIX = "/cocode/shortcuts/api";
const COMMAND_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const RESERVED_COMMAND_IDS = new Set([
	"__proto__",
	"constructor",
	"prototype"
]);
const BINDING_KEYS = new Set([
	"combo",
	"scope",
	"disabled"
]);
const COMBO_KEYS = new Set([
	"key",
	"primary",
	"alt",
	"shift",
	"control"
]);
function isRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
function invalid(message) {
	throw new ShortcutsRouteError("bad-request", message);
}
function parseCombo(value) {
	if (!isRecord(value)) invalid("combo must be a plain object");
	for (const key of Object.keys(value)) if (!COMBO_KEYS.has(key)) invalid("unknown combo field \"" + key + "\"");
	if (typeof value.key !== "string" || value.key.length === 0 || value.key.length > 64) invalid("combo.key must be a non-empty string with at most 64 characters");
	const combo = { key: value.key };
	for (const key of [
		"primary",
		"alt",
		"shift",
		"control"
	]) {
		const candidate = value[key];
		if (candidate === void 0) continue;
		if (typeof candidate !== "boolean") invalid("combo." + key + " must be a boolean");
		combo[key] = candidate;
	}
	return combo;
}
function parseBinding(commandId, value) {
	if (!COMMAND_ID.test(commandId) || RESERVED_COMMAND_IDS.has(commandId)) invalid("invalid commandId \"" + commandId + "\"");
	if (!isRecord(value)) invalid("binding \"" + commandId + "\" must be a plain object");
	for (const key of Object.keys(value)) if (!BINDING_KEYS.has(key)) invalid("unknown binding field \"" + key + "\"");
	const binding = {};
	if (value.combo !== void 0) binding.combo = parseCombo(value.combo);
	if (value.scope !== void 0) {
		if (value.scope !== "app" && value.scope !== "global") invalid("binding \"" + commandId + "\".scope must be app or global");
		binding.scope = value.scope;
	}
	if (value.disabled !== void 0) {
		if (typeof value.disabled !== "boolean") invalid("binding \"" + commandId + "\".disabled must be a boolean");
		binding.disabled = value.disabled;
	}
	return binding;
}
function parseBindings(value) {
	if (!isRecord(value)) invalid("bindings must be a plain object");
	const entries = Object.entries(value);
	if (entries.length > 512) invalid("bindings cannot contain more than 512 commands");
	return Object.fromEntries(entries.map(([commandId, binding]) => [commandId, parseBinding(commandId, binding)]));
}
function parseUpdatePayload(payload) {
	if (!isRecord(payload)) invalid("request payload must be a plain object");
	for (const key of Object.keys(payload)) if (key !== "patch" && key !== "expectedRevision") invalid("unknown request field \"" + key + "\"");
	if (!isRecord(payload.patch)) invalid("patch must be a plain object");
	const patch = {};
	for (const key of Object.keys(payload.patch)) if (key !== "version" && key !== "bindings") invalid("unknown settings field \"" + key + "\"");
	if (payload.patch.version !== void 0) {
		if (payload.patch.version !== 1) invalid("version must be 1");
		patch.version = 1;
	}
	if (payload.patch.bindings !== void 0) patch.bindings = parseBindings(payload.patch.bindings);
	let expectedRevision;
	if (payload.expectedRevision !== void 0) {
		if (typeof payload.expectedRevision !== "number" || !Number.isInteger(payload.expectedRevision) || payload.expectedRevision < 0) invalid("expectedRevision must be a non-negative integer");
		expectedRevision = payload.expectedRevision;
	}
	return {
		patch,
		...expectedRevision === void 0 ? {} : { expectedRevision }
	};
}
function buildApi(getSettings) {
	return {
		"settings.get": () => {
			const settings = getSettings();
			if (settings === void 0) throw new ShortcutsRouteError("settings-rejected", "the settings service is not mounted in this deployment", 503);
			return settings.get();
		},
		"settings.update": async (payload) => {
			const settings = getSettings();
			if (settings === void 0) throw new ShortcutsRouteError("settings-rejected", "the settings service is not mounted in this deployment", 503);
			const { patch, expectedRevision } = parseUpdatePayload(payload);
			try {
				return await settings.update(patch, expectedRevision);
			} catch (error) {
				if (error instanceof SettingsConflictError) throw new ShortcutsRouteError("settings-conflict", error.message, 409);
				throw new ShortcutsRouteError("settings-rejected", error instanceof Error ? error.message : String(error), 400);
			}
		}
	};
}
function registerShortcutsRoute(ctx, getSettings) {
	const api = buildApi(getSettings);
	const fence = (request) => isTrustedApiRequest(request, ctx.webRuntime.trustedHosts);
	return ctx.webServer.register({
		kind: "prefix",
		path: SHORTCUTS_API_PREFIX,
		handler: async (request, response) => {
			if (!fence(request)) {
				writeJson(response, 403, {
					ok: false,
					error: {
						code: "forbidden",
						message: "forbidden"
					}
				});
				return;
			}
			if (request.method !== "POST") {
				writeJson(response, 405, {
					ok: false,
					error: {
						code: "method-not-allowed",
						message: "method not allowed"
					}
				});
				return;
			}
			const pathname = new URL(request.url ?? "/", "http://dsh.internal").pathname;
			const prefix = SHORTCUTS_API_PREFIX + "/";
			const method = pathname.startsWith(prefix) ? pathname.slice(22) : void 0;
			if (method === void 0 || method.includes("/")) {
				writeError(response, new ShortcutsRouteError("not-found", "unknown shortcuts API method", 404));
				return;
			}
			try {
				const handler = api[method];
				if (handler === void 0) throw new ShortcutsRouteError("not-found", "unknown shortcuts API method \"" + method + "\"", 404);
				writeOk(response, await handler(await readJsonBody(request)));
			} catch (error) {
				writeError(response, error);
			}
		}
	});
}
//#endregion
//#region src/settings.ts
const SHORTCUTS_SETTINGS_NAMESPACE = "cocode-shortcuts";
const ShortcutSettingsSchema = z.object({
	version: z.number().default(1),
	bindings: z.dict(z.object({
		combo: z.object({
			key: z.string(),
			primary: z.boolean().default(false),
			alt: z.boolean().default(false),
			shift: z.boolean().default(false),
			control: z.boolean().default(false)
		}).required(false),
		scope: z.union(["app", "global"]).required(false),
		disabled: z.boolean().required(false)
	})).default({})
});
//#endregion
//#region src/index.ts
const name = "cocode-shortcuts";
const inject = ["webServer", "webRuntime"];
/** Register the settings namespace and its plugin-owned trusted Web route. */
function apply(ctx) {
	let settingsFace;
	ctx.inject(["settings"], (settingsCtx) => {
		const namespace = settingsNamespace(SHORTCUTS_SETTINGS_NAMESPACE);
		settingsCtx.settings.register(namespace, ShortcutSettingsSchema);
		const read = () => {
			const descriptor = settingsCtx.settings.describe({ redactSecrets: true }).find((candidate) => candidate.ns === namespace);
			if (descriptor === void 0) throw new Error("the cocode-shortcuts settings namespace is not registered");
			return {
				value: descriptor.value,
				...descriptor.user === void 0 ? {} : { user: descriptor.user },
				...descriptor.base === void 0 ? {} : { base: descriptor.base },
				revision: descriptor.revision,
				writable: settingsCtx.settings.writable
			};
		};
		const face = {
			get: read,
			update: async (patch, expectedRevision) => {
				await settingsCtx.settings.update(namespace, patch, expectedRevision);
				return read();
			}
		};
		settingsFace = face;
		return () => {
			if (settingsFace === face) settingsFace = void 0;
		};
	});
	ctx.effect(() => registerShortcutsRoute(ctx, () => settingsFace), "cocode-shortcuts: settings route");
}
//#endregion
export { SHORTCUTS_API_PREFIX, SHORTCUTS_SETTINGS_NAMESPACE, ShortcutSettingsSchema, apply, inject, name };
