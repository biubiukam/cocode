window.__ModuleLoader__.load({
	id: "cocode-shortcuts",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0rolldown/runtime.js
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		//#endregion
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/combo.ts
		const MODIFIER_KEYS = new Set([
			"Alt",
			"AltGraph",
			"Control",
			"Meta",
			"Shift"
		]);
		const SPECIAL_KEYS = {
			" ": "Space",
			Backspace: "Backspace",
			Delete: "Delete",
			End: "End",
			Enter: "Enter",
			Escape: "Escape",
			Home: "Home",
			Insert: "Insert",
			PageDown: "PageDown",
			PageUp: "PageUp",
			Tab: "Tab",
			ArrowDown: "ArrowDown",
			ArrowLeft: "ArrowLeft",
			ArrowRight: "ArrowRight",
			ArrowUp: "ArrowUp"
		};
		function currentPlatform() {
			return typeof navigator === "undefined" ? "" : navigator.platform;
		}
		function isMacPlatform(platform) {
			return platform.toLowerCase().includes("mac");
		}
		/** Normalize a browser key into the platform-neutral shortcut vocabulary. */
		function normalizeKey(key) {
			if (MODIFIER_KEYS.has(key)) return void 0;
			if (/^F(?:[1-9]|1[0-2])$/i.test(key)) return key.toUpperCase();
			if (key in SPECIAL_KEYS) return SPECIAL_KEYS[key];
			if (key.length === 1) return key.toLowerCase();
			return key.length > 0 ? key : void 0;
		}
		/** Convert a keyboard event into a persistable Combo, or reject modifiers alone. */
		function comboFromKeyboardEvent(event, platform = currentPlatform()) {
			const key = normalizeKey(event.key);
			if (key === void 0) return void 0;
			const mac = isMacPlatform(platform);
			return {
				key,
				primary: mac ? event.metaKey : event.ctrlKey,
				alt: event.altKey,
				shift: event.shiftKey,
				control: mac ? event.ctrlKey : false
			};
		}
		/** Stable equality key used for conflict detection and browser matching. */
		function comboId(combo, platform = currentPlatform()) {
			const mac = isMacPlatform(platform);
			return [
				combo.primary || !mac && combo.control ? "primary" : "",
				mac && combo.control ? "control" : "",
				combo.alt ? "alt" : "",
				combo.shift ? "shift" : "",
				combo.key.toLowerCase()
			].filter(Boolean).join("+");
		}
		/** Match one normalized Combo against a browser keyboard event. */
		function matchesCombo(combo, event, platform = currentPlatform()) {
			const key = normalizeKey(event.key);
			if (key === void 0 || key.toLowerCase() !== combo.key.toLowerCase()) return false;
			if (isMacPlatform(platform)) {
				if (Boolean(combo.primary) !== event.metaKey) return false;
				if (Boolean(combo.control) !== event.ctrlKey) return false;
			} else {
				if (event.metaKey) return false;
				if (Boolean(combo.primary || combo.control) !== event.ctrlKey) return false;
			}
			if (Boolean(combo.alt) !== event.altKey) return false;
			if (Boolean(combo.shift) !== event.shiftKey) return false;
			return true;
		}
		/** Format a Combo for the current platform and the settings UI. */
		function formatCombo(combo, platform = currentPlatform()) {
			if (combo === void 0) return "未设置";
			const mac = isMacPlatform(platform);
			const parts = [];
			if (combo.primary) parts.push(mac ? "Cmd" : "Ctrl");
			if (combo.control && !combo.primary) parts.push("Ctrl");
			if (combo.alt) parts.push(mac ? "Option" : "Alt");
			if (combo.shift) parts.push("Shift");
			parts.push(combo.key.length === 1 ? combo.key.toUpperCase() : combo.key);
			return parts.join("+");
		}
		/** Convert a Combo to Electron's platform-neutral accelerator syntax. */
		function toElectronAccelerator(combo) {
			const parts = [];
			if (combo.primary) parts.push("CommandOrControl");
			if (combo.control && !combo.primary) parts.push("Control");
			if (combo.alt) parts.push("Alt");
			if (combo.shift) parts.push("Shift");
			parts.push(combo.key.length === 1 ? combo.key.toUpperCase() : combo.key);
			return parts.join("+");
		}
		/** Reject dangerous or ambiguous bindings before they reach the settings file. */
		function isUsableCombo(combo) {
			if (combo.key.length === 1 && !combo.primary && !combo.control && !combo.alt && !combo.shift) return false;
			if (combo.primary && ["q", "w"].includes(combo.key.toLowerCase()) && !combo.shift && !combo.alt) return false;
			if (combo.alt && combo.key.toLowerCase() === "f4" && !combo.primary && !combo.control && !combo.shift) return false;
			return combo.key.length > 0;
		}
		function isTextEntryTarget(target) {
			if (!(target instanceof HTMLElement)) return false;
			if (target.isContentEditable || target.closest("[contenteditable]") !== null) return true;
			if ([
				"INPUT",
				"TEXTAREA",
				"SELECT"
			].includes(target.tagName)) return true;
			return target.closest(".xterm") !== null;
		}
		//#endregion
		//#region src/client/registry.ts
		const SIDEBAR_TOGGLE_COMMAND = "cocode.sidebar.toggle";
		const NEW_SESSION_COMMAND = "cocode.newSession";
		/** Client-side command and keymap registry shared by Cocode feature plugins. */
		var ShortcutRegistry = class {
			commandsById = /* @__PURE__ */ new Map();
			order = [];
			listeners = /* @__PURE__ */ new Set();
			userBindings;
			recording = false;
			snapshot;
			globalSyncGeneration = 0;
			globalError;
			constructor(ctx, settings) {
				this.ctx = ctx;
				this.settings = settings;
				this.userBindings = structuredClone(settings.getSnapshot().value.bindings);
				this.snapshot = this.buildSnapshot();
			}
			getSnapshot = () => this.snapshot;
			subscribe = (listener) => {
				this.listeners.add(listener);
				return () => this.listeners.delete(listener);
			};
			mount() {
				const onKeyDown = (event) => {
					if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
					if (!this.handle(event)) return;
					event.preventDefault();
					event.stopPropagation();
				};
				window.addEventListener("keydown", onKeyDown, true);
				const offSettings = this.settings.subscribe(() => {
					this.userBindings = structuredClone(this.settings.getSnapshot().value.bindings);
					this.publish();
				});
				const offTriggered = window.desktopApi?.shortcuts?.onTriggered((commandId) => {
					this.execute(commandId);
				});
				this.publish();
				return () => {
					window.removeEventListener("keydown", onKeyDown, true);
					offSettings();
					offTriggered?.();
				};
			}
			register(command) {
				if (this.commandsById.get(command.id) === void 0) this.order.push(command.id);
				this.commandsById.set(command.id, command);
				this.publish();
				return () => {
					if (this.commandsById.get(command.id) !== command) return;
					this.commandsById.delete(command.id);
					const index = this.order.indexOf(command.id);
					if (index >= 0) this.order.splice(index, 1);
					this.publish();
				};
			}
			setRecording(active) {
				this.recording = active;
			}
			getUserBinding(commandId) {
				return this.userBindings[commandId];
			}
			setBinding(commandId, binding) {
				const nextBinding = {
					...this.userBindings[commandId] ?? {},
					...binding,
					...binding.combo === void 0 ? {} : { disabled: false }
				};
				this.settings.setBindings({
					...this.userBindings,
					[commandId]: nextBinding
				});
			}
			resetBinding(commandId) {
				this.settings.resetBinding(commandId);
			}
			reloadSettings() {
				this.settings.reload();
			}
			execute(commandId, event) {
				const command = this.commandsById.get(commandId);
				if (command === void 0) return false;
				if (this.userBindings[commandId]?.disabled === true) return false;
				if (command.when !== void 0 && !command.when()) return false;
				try {
					return command.run(event) !== false;
				} catch (error) {
					console.error(`[cocode-shortcuts] command ${commandId} failed`, error);
					return false;
				}
			}
			handle(event) {
				if (this.recording || event.isComposing || event.keyCode === 229) return false;
				const candidates = this.snapshot.bindings.filter((binding) => binding.scope === "app");
				for (const binding of candidates) {
					const command = this.commandsById.get(binding.commandId);
					if (command === void 0) continue;
					if (!command.allowInTextEntry && isTextEntryTarget(event.target)) continue;
					if (!matchesCombo(binding.combo, event)) continue;
					return this.execute(binding.commandId, event);
				}
				return false;
			}
			buildSnapshot() {
				const commands = this.order.map((id) => this.commandsById.get(id)).filter((command) => command !== void 0);
				const bindings = [];
				const byCombo = /* @__PURE__ */ new Map();
				for (const command of commands) {
					const user = this.userBindings[command.id];
					if (user?.disabled === true) continue;
					const combo = user?.combo ?? command.defaultCombo;
					if (combo === void 0) continue;
					const scope = user?.scope === "global" && command.globalCapable === true ? "global" : user?.scope ?? command.defaultScope ?? "app";
					const binding = {
						commandId: command.id,
						combo,
						scope,
						title: command.title,
						globalCapable: command.globalCapable === true
					};
					bindings.push(binding);
					const key = comboId(combo);
					const peers = byCombo.get(key) ?? [];
					peers.push(binding);
					byCombo.set(key, peers);
				}
				const conflicts = [...byCombo.values()].filter((peers) => peers.length > 1).map((peers) => ({
					combo: peers[0].combo,
					commandIds: peers.sort((left, right) => (left.scope === "global" ? -1 : 0) - (right.scope === "global" ? -1 : 0)).map((peer) => peer.commandId)
				}));
				const known = new Set(commands.map((command) => command.id));
				const settingsSnapshot = this.settings.getSnapshot();
				return {
					commands,
					bindings,
					conflicts,
					orphaned: Object.keys(this.userBindings).filter((id) => !known.has(id)),
					settingsStatus: settingsSnapshot.status,
					writable: settingsSnapshot.writable,
					...settingsSnapshot.error === void 0 ? {} : { settingsError: settingsSnapshot.error },
					...this.globalError === void 0 ? {} : { globalError: this.globalError }
				};
			}
			publish() {
				this.snapshot = this.buildSnapshot();
				for (const listener of [...this.listeners]) listener();
				this.syncGlobalShortcuts(this.snapshot);
			}
			async syncGlobalShortcuts(snapshot) {
				const desktop = window.desktopApi?.shortcuts;
				if (desktop === void 0) return;
				const generation = ++this.globalSyncGeneration;
				const bindings = snapshot.bindings.filter((binding) => binding.scope === "global" && binding.globalCapable).map((binding) => ({
					commandId: binding.commandId,
					accelerator: toElectronAccelerator(binding.combo)
				}));
				try {
					const result = await desktop.sync({ bindings });
					if (generation !== this.globalSyncGeneration) return;
					this.globalError = result.ok ? void 0 : (result.conflicts ?? []).map((conflict) => `${conflict.accelerator}: ${conflict.reason}`).join(", ") || "全局快捷键注册失败";
					this.snapshot = this.buildSnapshot();
					for (const listener of [...this.listeners]) listener();
				} catch (error) {
					if (generation !== this.globalSyncGeneration) return;
					this.globalError = error instanceof Error ? error.message : String(error);
					this.snapshot = this.buildSnapshot();
					for (const listener of [...this.listeners]) listener();
				}
			}
		};
		function comboFromEvent(event) {
			return comboFromKeyboardEvent(event);
		}
		//#endregion
		//#region src/client/ShortcutsGeneralItem.tsx
		function isChinese() {
			return document.documentElement.lang.toLowerCase().startsWith("zh") || navigator.language.toLowerCase().startsWith("zh");
		}
		function ShortcutsSection({ registry }) {
			const state = (0, react.useSyncExternalStore)(registry.subscribe, registry.getSnapshot, registry.getSnapshot);
			const [recording, setRecording] = (0, react.useState)();
			const zh = isChinese();
			(0, react.useEffect)(() => {
				registry.reloadSettings();
			}, [registry]);
			(0, react.useEffect)(() => {
				if (recording === void 0) return;
				const onKeyDown = (event) => {
					event.preventDefault();
					event.stopPropagation();
					if (event.key === "Escape") {
						registry.setRecording(false);
						setRecording(void 0);
						return;
					}
					if (event.key === "Backspace") {
						const commandId = recording;
						registry.setRecording(false);
						setRecording(void 0);
						registry.setBinding(commandId, { disabled: true });
						return;
					}
					const combo = comboFromEvent(event);
					if (combo === void 0 || !isUsableCombo(combo)) return;
					const commandId = recording;
					registry.setRecording(false);
					setRecording(void 0);
					registry.setBinding(commandId, { combo });
				};
				window.addEventListener("keydown", onKeyDown, true);
				return () => {
					window.removeEventListener("keydown", onKeyDown, true);
				};
			}, [recording, registry]);
			const startRecording = (commandId) => {
				registry.setRecording(true);
				setRecording(commandId);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					color: "var(--dsw-alias-label-primary)",
					maxWidth: 720
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						style: {
							fontSize: 16,
							fontWeight: 500,
							lineHeight: "24px",
							margin: 0
						},
						children: zh ? "快捷键" : "Keyboard Shortcuts"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: {
							color: "var(--dsw-alias-label-tertiary)",
							fontSize: 14,
							lineHeight: "22px",
							margin: "8px 0 20px"
						},
						children: zh ? "配置应用内和桌面全局快捷键。" : "Configure application and desktop global shortcuts."
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "grid",
							gap: 10
						},
						children: [
							state.commands.map((command) => {
								const binding = state.bindings.find((item) => item.commandId === command.id);
								const disabled = registry.getUserBinding(command.id)?.disabled === true;
								const currentScope = binding?.scope ?? command.defaultScope ?? "app";
								return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										alignItems: "center",
										display: "flex",
										gap: 8,
										justifyContent: "space-between"
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: { minWidth: 0 },
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: command.title }), command.description !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											style: {
												color: "var(--dsw-alias-label-secondary, #6b7280)",
												fontSize: 12
											},
											children: command.description
										})]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: {
											alignItems: "center",
											display: "flex",
											gap: 6,
											flexShrink: 0
										},
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: disabled ? zh ? "已禁用" : "Disabled" : formatCombo(binding?.combo ?? command.defaultCombo) }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												disabled: !state.writable,
												onClick: () => {
													startRecording(command.id);
												},
												children: recording === command.id ? zh ? "按键…" : "Press…" : zh ? "录制" : "Record"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												disabled: !state.writable,
												onClick: () => {
													registry.resetBinding(command.id);
												},
												children: zh ? "重置" : "Reset"
											}),
											command.globalCapable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												disabled: !state.writable,
												"aria-pressed": currentScope === "global",
												onClick: () => {
													registry.setBinding(command.id, {
														...binding === void 0 ? {} : { combo: binding.combo },
														scope: currentScope === "global" ? "app" : "global"
													});
												},
												children: currentScope === "global" ? zh ? "全局" : "Global" : zh ? "应用" : "App"
											})
										]
									})]
								}, command.id);
							}),
							state.conflicts.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								role: "alert",
								style: {
									color: "#b42318",
									fontSize: 12
								},
								children: [zh ? "快捷键冲突：" : "Shortcut conflicts: ", state.conflicts.map((conflict) => conflict.commandIds.join(" / ")).join(", ")]
							}),
							state.orphaned.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									color: "var(--dsw-alias-label-secondary, #6b7280)",
									fontSize: 12
								},
								children: zh ? `存在 ${state.orphaned.length} 个无效快捷键配置。` : `${state.orphaned.length} orphaned shortcut setting(s).`
							}),
							state.settingsStatus === "loading" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									color: "var(--dsw-alias-label-secondary, #6b7280)",
									fontSize: 12
								},
								children: zh ? "正在加载快捷键设置…" : "Loading shortcut settings…"
							}),
							state.settingsStatus === "memory" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									color: "var(--dsw-alias-label-secondary, #6b7280)",
									fontSize: 12
								},
								children: zh ? "设置服务不可用，当前使用临时内存配置。" : "Settings route unavailable; using temporary in-memory bindings."
							}),
							state.settingsError !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								role: "alert",
								style: {
									color: "#b42318",
									fontSize: 12
								},
								children: state.settingsError
							}),
							state.globalError !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								role: "alert",
								style: {
									color: "#b42318",
									fontSize: 12
								},
								children: state.globalError
							}),
							recording !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									color: "var(--dsw-alias-label-secondary, #6b7280)",
									fontSize: 12
								},
								children: zh ? "按 Escape 取消，按 Backspace 禁用。" : "Press Escape to cancel or Backspace to disable."
							})
						]
					})
				]
			});
		}
		//#endregion
		//#region ../../../node_modules/cosmokit/lib/index.cjs
		var require_lib$1 = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			var __defProp = Object.defineProperty;
			var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
			var __getOwnPropNames = Object.getOwnPropertyNames;
			var __hasOwnProp = Object.prototype.hasOwnProperty;
			var __export = (target, all) => {
				for (var name in all) __defProp(target, name, {
					get: all[name],
					enumerable: true
				});
			};
			var __copyProps = (to, from, except, desc) => {
				if (from && typeof from === "object" || typeof from === "function") {
					for (let key of __getOwnPropNames(from)) if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
						get: () => from[key],
						enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
					});
				}
				return to;
			};
			var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
			var index_exports = {};
			__export(index_exports, {
				Binary: () => Binary,
				Time: () => Time,
				arrayBufferToBase64: () => arrayBufferToBase64,
				arrayBufferToHex: () => arrayBufferToHex,
				base64ToArrayBuffer: () => base64ToArrayBuffer,
				camelCase: () => camelCase,
				camelize: () => camelize,
				capitalize: () => capitalize,
				clone: () => clone,
				contain: () => contain,
				deduplicate: () => deduplicate,
				deepEqual: () => deepEqual,
				defineProperty: () => defineProperty,
				difference: () => difference,
				filterKeys: () => filterKeys,
				formatProperty: () => formatProperty,
				hexToArrayBuffer: () => hexToArrayBuffer,
				hyphenate: () => hyphenate,
				intersection: () => intersection,
				is: () => is,
				isNonNullable: () => isNonNullable,
				isNullable: () => isNullable,
				isPlainObject: () => isPlainObject,
				makeArray: () => makeArray,
				mapValues: () => mapValues,
				noop: () => noop,
				omit: () => omit,
				paramCase: () => paramCase,
				pick: () => pick,
				remove: () => remove,
				sanitize: () => sanitize,
				snakeCase: () => snakeCase,
				trimSlash: () => trimSlash,
				uncapitalize: () => uncapitalize,
				union: () => union,
				valueMap: () => mapValues
			});
			module.exports = __toCommonJS(index_exports);
			function noop() {}
			function isNullable(value) {
				return value === null || value === void 0;
			}
			function isNonNullable(value) {
				return !isNullable(value);
			}
			function isPlainObject(data) {
				return data && typeof data === "object" && !Array.isArray(data);
			}
			function filterKeys(object, filter) {
				return Object.fromEntries(Object.entries(object).filter(([key, value]) => filter(key, value)));
			}
			function mapValues(object, transform) {
				return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, transform(value, key)]));
			}
			function pick(source, keys, forced) {
				if (!keys) return { ...source };
				const result = {};
				for (const key of keys) if (forced || source[key] !== void 0) result[key] = source[key];
				return result;
			}
			function omit(source, keys) {
				if (!keys) return { ...source };
				const result = { ...source };
				for (const key of keys) Reflect.deleteProperty(result, key);
				return result;
			}
			function defineProperty(object, key, value) {
				return Object.defineProperty(object, key, {
					writable: true,
					value,
					enumerable: false
				});
			}
			function contain(array1, array2) {
				return array2.every((item) => array1.includes(item));
			}
			function intersection(array1, array2) {
				return array1.filter((item) => array2.includes(item));
			}
			function difference(array1, array2) {
				return array1.filter((item) => !array2.includes(item));
			}
			function union(array1, array2) {
				return Array.from(/* @__PURE__ */ new Set([...array1, ...array2]));
			}
			function deduplicate(array) {
				return [...new Set(array)];
			}
			function remove(list, item) {
				const index = list?.indexOf(item);
				if (index >= 0) {
					list.splice(index, 1);
					return true;
				} else return false;
			}
			function makeArray(source) {
				return Array.isArray(source) ? source : isNullable(source) ? [] : [source];
			}
			function is(type, value) {
				if (arguments.length === 1) return (value2) => is(type, value2);
				return type in globalThis && value instanceof globalThis[type] || Object.prototype.toString.call(value).slice(8, -1) === type;
			}
			function isArrayBufferLike(value) {
				return is("ArrayBuffer", value) || is("SharedArrayBuffer", value);
			}
			function isArrayBufferSource(value) {
				return isArrayBufferLike(value) || ArrayBuffer.isView(value);
			}
			var Binary;
			((Binary2) => {
				Binary2.is = isArrayBufferLike;
				Binary2.isSource = isArrayBufferSource;
				function fromSource(source) {
					if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
					else return source;
				}
				Binary2.fromSource = fromSource;
				function toBase64(source) {
					source = fromSource(source);
					if (typeof Buffer !== "undefined") return Buffer.from(source).toString("base64");
					let binary = "";
					const bytes = new Uint8Array(source);
					for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
					return btoa(binary);
				}
				Binary2.toBase64 = toBase64;
				function fromBase64(source) {
					if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "base64"));
					return Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
				}
				Binary2.fromBase64 = fromBase64;
				function toHex(source) {
					source = fromSource(source);
					if (typeof Buffer !== "undefined") return Buffer.from(source).toString("hex");
					return Array.from(new Uint8Array(source), (byte) => byte.toString(16).padStart(2, "0")).join("");
				}
				Binary2.toHex = toHex;
				function fromHex(source) {
					if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "hex"));
					const hex = source.length % 2 === 0 ? source : source.slice(0, source.length - 1);
					const buffer = [];
					for (let i = 0; i < hex.length; i += 2) buffer.push(parseInt(`${hex[i]}${hex[i + 1]}`, 16));
					return Uint8Array.from(buffer).buffer;
				}
				Binary2.fromHex = fromHex;
			})(Binary || (Binary = {}));
			var base64ToArrayBuffer = Binary.fromBase64;
			var arrayBufferToBase64 = Binary.toBase64;
			var hexToArrayBuffer = Binary.fromHex;
			var arrayBufferToHex = Binary.toHex;
			function clone(source, refs = /* @__PURE__ */ new Map()) {
				if (!source || typeof source !== "object") return source;
				if (is("Date", source)) return new Date(source.valueOf());
				if (is("RegExp", source)) return new RegExp(source.source, source.flags);
				if (isArrayBufferLike(source)) return source.slice(0);
				if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
				const cached = refs.get(source);
				if (cached) return cached;
				if (Array.isArray(source)) {
					const result2 = [];
					refs.set(source, result2);
					source.forEach((value, index) => {
						result2[index] = Reflect.apply(clone, null, [value, refs]);
					});
					return result2;
				}
				const result = Object.create(Object.getPrototypeOf(source));
				refs.set(source, result);
				for (const key of Reflect.ownKeys(source)) {
					const descriptor = { ...Reflect.getOwnPropertyDescriptor(source, key) };
					if ("value" in descriptor) descriptor.value = Reflect.apply(clone, null, [descriptor.value, refs]);
					Reflect.defineProperty(result, key, descriptor);
				}
				return result;
			}
			function deepEqual(a, b, strict) {
				if (a === b) return true;
				if (!strict && isNullable(a) && isNullable(b)) return true;
				if (typeof a !== typeof b) return false;
				if (typeof a !== "object") return false;
				if (!a || !b) return false;
				function check(test, then) {
					return test(a) ? test(b) ? then(a, b) : false : test(b) ? false : void 0;
				}
				return check(Array.isArray, (a2, b2) => a2.length === b2.length && a2.every((item, index) => deepEqual(item, b2[index]))) ?? check(is("Date"), (a2, b2) => a2.valueOf() === b2.valueOf()) ?? check(is("RegExp"), (a2, b2) => a2.source === b2.source && a2.flags === b2.flags) ?? check(isArrayBufferLike, (a2, b2) => {
					if (a2.byteLength !== b2.byteLength) return false;
					const viewA = new Uint8Array(a2);
					const viewB = new Uint8Array(b2);
					for (let i = 0; i < viewA.length; i++) if (viewA[i] !== viewB[i]) return false;
					return true;
				}) ?? Object.keys({
					...a,
					...b
				}).every((key) => deepEqual(a[key], b[key], strict));
			}
			function capitalize(source) {
				return source.charAt(0).toUpperCase() + source.slice(1);
			}
			function uncapitalize(source) {
				return source.charAt(0).toLowerCase() + source.slice(1);
			}
			function camelCase(source) {
				return source.replace(/[_-][a-z]/g, (str) => str.slice(1).toUpperCase());
			}
			function tokenize(source, delimiters, delimiter) {
				const output = [];
				let state = 0;
				for (let i = 0; i < source.length; i++) {
					const code = source.charCodeAt(i);
					if (code >= 65 && code <= 90) {
						if (state === 1) {
							const next = source.charCodeAt(i + 1);
							if (next >= 97 && next <= 122) output.push(delimiter);
							output.push(code + 32);
						} else {
							if (state !== 0) output.push(delimiter);
							output.push(code + 32);
						}
						state = 1;
					} else if (code >= 97 && code <= 122) {
						output.push(code);
						state = 2;
					} else if (delimiters.includes(code)) {
						if (state !== 0) output.push(delimiter);
						state = 0;
					} else output.push(code);
				}
				return String.fromCharCode(...output);
			}
			function paramCase(source) {
				return tokenize(source, [45, 95], 45);
			}
			function snakeCase(source) {
				return tokenize(source, [45, 95], 95);
			}
			var camelize = camelCase;
			var hyphenate = paramCase;
			function formatProperty(key) {
				if (typeof key !== "string") return `[${key.toString()}]`;
				return /^[a-z_$][\w$]*$/i.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`;
			}
			function trimSlash(source) {
				return source.replace(/\/$/, "");
			}
			function sanitize(source) {
				if (!source.startsWith("/")) source = "/" + source;
				return trimSlash(source);
			}
			var Time;
			((Time2) => {
				Time2.millisecond = 1;
				Time2.second = 1e3;
				Time2.minute = Time2.second * 60;
				Time2.hour = Time2.minute * 60;
				Time2.day = Time2.hour * 24;
				Time2.week = Time2.day * 7;
				let timezoneOffset = (/* @__PURE__ */ new Date()).getTimezoneOffset();
				function setTimezoneOffset(offset) {
					timezoneOffset = offset;
				}
				Time2.setTimezoneOffset = setTimezoneOffset;
				function getTimezoneOffset() {
					return timezoneOffset;
				}
				Time2.getTimezoneOffset = getTimezoneOffset;
				function getDateNumber(date = /* @__PURE__ */ new Date(), offset) {
					if (typeof date === "number") date = new Date(date);
					if (offset === void 0) offset = timezoneOffset;
					return Math.floor((date.valueOf() / Time2.minute - offset) / 1440);
				}
				Time2.getDateNumber = getDateNumber;
				function fromDateNumber(value, offset) {
					const date = new Date(value * Time2.day);
					if (offset === void 0) offset = timezoneOffset;
					return new Date(+date + offset * Time2.minute);
				}
				Time2.fromDateNumber = fromDateNumber;
				const numeric = /\d+(?:\.\d+)?/.source;
				const timeRegExp = new RegExp(`^${[
					"w(?:eek(?:s)?)?",
					"d(?:ay(?:s)?)?",
					"h(?:our(?:s)?)?",
					"m(?:in(?:ute)?(?:s)?)?",
					"s(?:ec(?:ond)?(?:s)?)?"
				].map((unit) => `(${numeric}${unit})?`).join("")}$`);
				function parseTime(source) {
					const capture = timeRegExp.exec(source);
					if (!capture) return 0;
					return (parseFloat(capture[1]) * Time2.week || 0) + (parseFloat(capture[2]) * Time2.day || 0) + (parseFloat(capture[3]) * Time2.hour || 0) + (parseFloat(capture[4]) * Time2.minute || 0) + (parseFloat(capture[5]) * Time2.second || 0);
				}
				Time2.parseTime = parseTime;
				function parseDate(date) {
					const parsed = parseTime(date);
					if (parsed) date = Date.now() + parsed;
					else if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${(/* @__PURE__ */ new Date()).toLocaleDateString()}-${date}`;
					else if (/^\d{1,2}-\d{1,2}-\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${(/* @__PURE__ */ new Date()).getFullYear()}-${date}`;
					return date ? new Date(date) : /* @__PURE__ */ new Date();
				}
				Time2.parseDate = parseDate;
				function format(ms) {
					const abs = Math.abs(ms);
					if (abs >= Time2.day - Time2.hour / 2) return Math.round(ms / Time2.day) + "d";
					else if (abs >= Time2.hour - Time2.minute / 2) return Math.round(ms / Time2.hour) + "h";
					else if (abs >= Time2.minute - Time2.second / 2) return Math.round(ms / Time2.minute) + "m";
					else if (abs >= Time2.second) return Math.round(ms / Time2.second) + "s";
					return ms + "ms";
				}
				Time2.format = format;
				function toDigits(source, length = 2) {
					return source.toString().padStart(length, "0");
				}
				Time2.toDigits = toDigits;
				function template(template2, time = /* @__PURE__ */ new Date()) {
					return template2.replace("yyyy", time.getFullYear().toString()).replace("yy", time.getFullYear().toString().slice(2)).replace("MM", toDigits(time.getMonth() + 1)).replace("dd", toDigits(time.getDate())).replace("hh", toDigits(time.getHours())).replace("mm", toDigits(time.getMinutes())).replace("ss", toDigits(time.getSeconds())).replace("SSS", toDigits(time.getMilliseconds(), 3));
				}
				Time2.template = template;
			})(Time || (Time = {}));
		}));
		//#endregion
		//#region src/settings.ts
		var import_lib = /* @__PURE__ */ __toESM((/* @__PURE__ */ __commonJSMin(((exports, module) => {
			var __defProp = Object.defineProperty;
			var __name = (target, value) => __defProp(target, "name", {
				value,
				configurable: true
			});
			var import_cosmokit = require_lib$1();
			var kSchema = Symbol.for("schemastery");
			var kValidationError = Symbol.for("ValidationError");
			globalThis.__schemastery_index__ ??= 0;
			globalThis.__schemastery_refs__ = void 0;
			var ValidationError = class extends TypeError {
				constructor(message, options) {
					let prefix = "$";
					for (const segment of options.path || []) if (typeof segment === "string") prefix += "." + segment;
					else if (typeof segment === "number") prefix += "[" + segment + "]";
					else if (typeof segment === "symbol") prefix += `[Symbol(${segment.toString()})]`;
					if (prefix.startsWith(".")) prefix = prefix.slice(1);
					super((prefix === "$" ? "" : `${prefix} `) + message);
					this.options = options;
				}
				static {
					__name(this, "ValidationError");
				}
				name = "ValidationError";
				static is(error) {
					return !!error?.[kValidationError];
				}
			};
			Object.defineProperty(ValidationError.prototype, kValidationError, { value: true });
			var Schema = /* @__PURE__ */ __name(function(options) {
				const schema = /* @__PURE__ */ __name(function(data, options2 = {}) {
					return Schema.resolve(data, schema, options2)[0];
				}, "schema");
				if (options.refs) {
					const refs = (0, import_cosmokit.valueMap)(options.refs, (options2) => new Schema(options2));
					const getRef = /* @__PURE__ */ __name((uid) => refs[uid], "getRef");
					for (const key in refs) {
						const options2 = refs[key];
						options2.sKey = getRef(options2.sKey);
						options2.inner = getRef(options2.inner);
						options2.list = options2.list && options2.list.map(getRef);
						options2.dict = options2.dict && (0, import_cosmokit.valueMap)(options2.dict, getRef);
					}
					return refs[options.uid];
				}
				Object.assign(schema, options);
				if (typeof schema.callback === "string") try {
					schema.callback = new Function("return " + schema.callback)();
				} catch {}
				Object.defineProperty(schema, "uid", { value: globalThis.__schemastery_index__++ });
				Object.setPrototypeOf(schema, Schema.prototype);
				schema.meta ||= {};
				schema.toString = schema.toString.bind(schema);
				return schema;
			}, "Schema");
			Schema.prototype = Object.create(Function.prototype);
			Schema.prototype[kSchema] = true;
			Object.defineProperty(Schema.prototype, "~standard", { get() {
				return {
					version: 1,
					vendor: "schemastery",
					validate: /* @__PURE__ */ __name((value) => {
						try {
							return { value: Schema.resolve(value, this, {})[0] };
						} catch (error) {
							if (ValidationError.is(error)) return { issues: [{
								message: error.message,
								path: error.options.path
							}] };
							throw error;
						}
					}, "validate")
				};
			} });
			Schema.ValidationError = ValidationError;
			Schema.prototype.toJSON = /* @__PURE__ */ __name(function toJSON() {
				if (globalThis.__schemastery_refs__) {
					globalThis.__schemastery_refs__[this.uid] ??= JSON.parse(JSON.stringify({ ...this }));
					return this.uid;
				}
				globalThis.__schemastery_refs__ = { [this.uid]: { ...this } };
				globalThis.__schemastery_refs__[this.uid] = JSON.parse(JSON.stringify({ ...this }));
				const result = {
					uid: this.uid,
					refs: globalThis.__schemastery_refs__
				};
				globalThis.__schemastery_refs__ = void 0;
				return result;
			}, "toJSON");
			Schema.prototype.set = /* @__PURE__ */ __name(function set(key, value) {
				this.dict[key] = value;
				return this;
			}, "set");
			Schema.prototype.push = /* @__PURE__ */ __name(function push(value) {
				this.list.push(value);
				return this;
			}, "push");
			function mergeDesc(original, messages) {
				const result = typeof original === "string" ? { "": original } : { ...original };
				for (const locale in messages) {
					const value = messages[locale];
					if (value?.$description || value?.$desc) result[locale] = value.$description || value.$desc;
					else if (typeof value === "string") result[locale] = value;
				}
				return result;
			}
			__name(mergeDesc, "mergeDesc");
			function getInner(value) {
				return value?.$value ?? value?.$inner;
			}
			__name(getInner, "getInner");
			function extractKeys(data) {
				return (0, import_cosmokit.filterKeys)(data ?? {}, (key) => !key.startsWith("$"));
			}
			__name(extractKeys, "extractKeys");
			Schema.prototype.i18n = /* @__PURE__ */ __name(function i18n(messages) {
				const schema = Schema(this);
				const desc = mergeDesc(schema.meta.description, messages);
				if (Object.keys(desc).length) schema.meta.description = desc;
				if (schema.dict) schema.dict = (0, import_cosmokit.valueMap)(schema.dict, (inner, key) => {
					return inner.i18n((0, import_cosmokit.valueMap)(messages, (data) => getInner(data)?.[key] ?? data?.[key]));
				});
				if (schema.list) schema.list = schema.list.map((inner, index) => {
					return inner.i18n((0, import_cosmokit.valueMap)(messages, (data = {}) => {
						if (Array.isArray(getInner(data))) return getInner(data)[index];
						if (Array.isArray(data)) return data[index];
						return extractKeys(data);
					}));
				});
				if (schema.inner) schema.inner = schema.inner.i18n((0, import_cosmokit.valueMap)(messages, (data) => {
					if (getInner(data)) return getInner(data);
					return extractKeys(data);
				}));
				if (schema.sKey) schema.sKey = schema.sKey.i18n((0, import_cosmokit.valueMap)(messages, (data) => data?.$key));
				return schema;
			}, "i18n");
			Schema.prototype.extra = /* @__PURE__ */ __name(function extra(key, value) {
				const schema = Schema(this);
				schema.meta = {
					...schema.meta,
					[key]: value
				};
				return schema;
			}, "extra");
			for (const key of [
				"required",
				"disabled",
				"collapse",
				"hidden",
				"loose"
			]) Object.assign(Schema.prototype, { [key](value = true) {
				const schema = Schema(this);
				schema.meta = {
					...schema.meta,
					[key]: value
				};
				return schema;
			} });
			Schema.prototype.deprecated = /* @__PURE__ */ __name(function deprecated() {
				const schema = Schema(this);
				schema.meta.badges ||= [];
				schema.meta.badges.push({
					text: "deprecated",
					type: "danger"
				});
				return schema;
			}, "deprecated");
			Schema.prototype.experimental = /* @__PURE__ */ __name(function experimental() {
				const schema = Schema(this);
				schema.meta.badges ||= [];
				schema.meta.badges.push({
					text: "experimental",
					type: "warning"
				});
				return schema;
			}, "experimental");
			Schema.prototype.pattern = /* @__PURE__ */ __name(function pattern(regexp) {
				const schema = Schema(this);
				const pattern2 = (0, import_cosmokit.pick)(regexp, ["source", "flags"]);
				schema.meta = {
					...schema.meta,
					pattern: pattern2
				};
				return schema;
			}, "pattern");
			Schema.prototype.simplify = /* @__PURE__ */ __name(function simplify(value) {
				if ((0, import_cosmokit.deepEqual)(value, this.meta.default, this.type === "dict")) return null;
				if ((0, import_cosmokit.isNullable)(value)) return value;
				if (this.type === "object" || this.type === "dict") {
					const result = {};
					for (const key in value) {
						const item = (this.type === "object" ? this.dict[key] : this.inner)?.simplify(value[key]);
						if (this.type === "dict" || !(0, import_cosmokit.isNullable)(item)) result[key] = item;
					}
					if ((0, import_cosmokit.deepEqual)(result, this.meta.default, this.type === "dict")) return null;
					return result;
				} else if (this.type === "array" || this.type === "tuple") {
					const result = [];
					value.forEach((value2, index) => {
						const schema = this.type === "array" ? this.inner : this.list[index];
						const item = schema ? schema.simplify(value2) : value2;
						result.push(item);
					});
					return result;
				} else if (this.type === "intersect") {
					const result = {};
					for (const item of this.list) Object.assign(result, item.simplify(value));
					return result;
				} else if (this.type === "union") for (const schema of this.list) try {
					Schema.resolve(value, schema, {});
					return schema.simplify(value);
				} catch {}
				return value;
			}, "simplify");
			Schema.prototype.toString = /* @__PURE__ */ __name(function toString(inline) {
				return formatters[this.type]?.(this, inline) ?? `Schema<${this.type}>`;
			}, "toString");
			Schema.prototype.role = /* @__PURE__ */ __name(function role(role, extra2) {
				const schema = Schema(this);
				schema.meta = {
					...schema.meta,
					role,
					extra: extra2
				};
				return schema;
			}, "role");
			for (const key of [
				"default",
				"link",
				"comment",
				"description",
				"max",
				"min",
				"step"
			]) Object.assign(Schema.prototype, { [key](value) {
				const schema = Schema(this);
				schema.meta = {
					...schema.meta,
					[key]: value
				};
				return schema;
			} });
			var resolvers = {};
			Schema.extend = /* @__PURE__ */ __name(function extend(type, resolve2) {
				resolvers[type] = resolve2;
			}, "extend");
			Schema.resolve = /* @__PURE__ */ __name(function resolve(data, schema, options = {}, strict = false) {
				if (!schema) return [data];
				if (options.ignore?.(data, schema)) return [data];
				if ((0, import_cosmokit.isNullable)(data) && schema.type !== "lazy") {
					if (schema.meta.required) throw new ValidationError(`missing required value`, options);
					let current = schema;
					let fallback = schema.meta.default;
					while (current?.type === "intersect" && (0, import_cosmokit.isNullable)(fallback)) {
						current = current.list[0];
						fallback = current?.meta.default;
					}
					if ((0, import_cosmokit.isNullable)(fallback)) return [data];
					data = (0, import_cosmokit.clone)(fallback);
				}
				const callback = resolvers[schema.type];
				if (!callback) throw new ValidationError(`unsupported type "${schema.type}"`, options);
				try {
					return callback(data, schema, options, strict);
				} catch (error) {
					if (!schema.meta.loose) throw error;
					return [schema.meta.default];
				}
			}, "resolve");
			Schema.from = /* @__PURE__ */ __name(function from(source) {
				if ((0, import_cosmokit.isNullable)(source)) return Schema.any();
				else if ([
					"string",
					"number",
					"boolean"
				].includes(typeof source)) return Schema.const(source).required();
				else if (source[kSchema]) return source;
				else if (typeof source === "function") switch (source) {
					case String: return Schema.string().required();
					case Number: return Schema.number().required();
					case Boolean: return Schema.boolean().required();
					case Function: return Schema.function().required();
					default: return Schema.is(source).required();
				}
				else throw new TypeError(`cannot infer schema from ${source}`);
			}, "from");
			Schema.lazy = /* @__PURE__ */ __name(function lazy(builder) {
				const schema = new Schema({
					type: "lazy",
					builder,
					inner: { toJSON: /* @__PURE__ */ __name(() => {
						if (!schema.inner[kSchema]) {
							schema.inner = schema.builder();
							schema.inner.meta = {
								...schema.meta,
								...schema.inner.meta
							};
						}
						return schema.inner.toJSON();
					}, "toJSON") }
				});
				return schema;
			}, "lazy");
			Schema.natural = /* @__PURE__ */ __name(function natural() {
				return Schema.number().step(1).min(0);
			}, "natural");
			Schema.percent = /* @__PURE__ */ __name(function percent() {
				return Schema.number().step(.01).min(0).max(1).role("slider");
			}, "percent");
			Schema.date = /* @__PURE__ */ __name(function date() {
				return Schema.union([Schema.is(Date), Schema.transform(Schema.string().role("datetime"), (value, options) => {
					const date2 = new Date(value);
					if (isNaN(+date2)) throw new ValidationError(`invalid date "${value}"`, options);
					return date2;
				}, true)]);
			}, "date");
			Schema.regExp = /* @__PURE__ */ __name(function regExp(flag = "") {
				return Schema.union([Schema.is(RegExp), Schema.transform(Schema.string().role("regexp", { flag }), (value, options) => {
					try {
						return new RegExp(value, flag);
					} catch (e) {
						throw new ValidationError(e.message, options);
					}
				}, true)]);
			}, "regExp");
			Schema.arrayBuffer = /* @__PURE__ */ __name(function arrayBuffer(encoding) {
				return Schema.union([
					Schema.is(ArrayBuffer),
					Schema.is(SharedArrayBuffer),
					Schema.transform(Schema.any(), (value, options) => {
						if (import_cosmokit.Binary.isSource(value)) return import_cosmokit.Binary.fromSource(value);
						throw new ValidationError(`expected ArrayBufferSource but got ${value}`, options);
					}, true),
					...encoding ? [Schema.transform(Schema.string(), (value, options) => {
						try {
							return encoding === "base64" ? import_cosmokit.Binary.fromBase64(value) : import_cosmokit.Binary.fromHex(value);
						} catch (e) {
							throw new ValidationError(e.message, options);
						}
					}, true)] : []
				]);
			}, "arrayBuffer");
			Schema.extend("lazy", (data, schema, options, strict) => {
				if (!schema.inner[kSchema]) {
					schema.inner = schema.builder();
					schema.inner.meta = {
						...schema.meta,
						...schema.inner.meta
					};
				}
				return Schema.resolve(data, schema.inner, options, strict);
			});
			Schema.extend("any", (data) => {
				return [data];
			});
			Schema.extend("never", (data, _, options) => {
				throw new ValidationError(`expected nullable but got ${data}`, options);
			});
			Schema.extend("const", (data, { value }, options) => {
				if ((0, import_cosmokit.deepEqual)(data, value)) return [value];
				throw new ValidationError(`expected ${value} but got ${data}`, options);
			});
			function checkWithinRange(data, meta, description, options, skipMin = false) {
				const { max = Infinity, min = -Infinity } = meta;
				if (data > max) throw new ValidationError(`expected ${description} <= ${max} but got ${data}`, options);
				if (data < min && !skipMin) throw new ValidationError(`expected ${description} >= ${min} but got ${data}`, options);
			}
			__name(checkWithinRange, "checkWithinRange");
			Schema.extend("string", (data, { meta }, options) => {
				if (typeof data !== "string") throw new ValidationError(`expected string but got ${data}`, options);
				if (meta.pattern) {
					const regexp = new RegExp(meta.pattern.source, meta.pattern.flags);
					if (!regexp.test(data)) throw new ValidationError(`expect string to match regexp ${regexp}`, options);
				}
				checkWithinRange(data.length, meta, "string length", options);
				return [data];
			});
			function decimalShift(data, digits) {
				const str = data.toString();
				if (str.includes("e")) return data * Math.pow(10, digits);
				const index = str.indexOf(".");
				if (index === -1) return data * Math.pow(10, digits);
				const frac = str.slice(index + 1);
				const integer = str.slice(0, index);
				if (frac.length <= digits) return +(integer + frac.padEnd(digits, "0"));
				return +(integer + frac.slice(0, digits) + "." + frac.slice(digits));
			}
			__name(decimalShift, "decimalShift");
			function isMultipleOf(data, min, step) {
				step = Math.abs(step);
				if (!/^\d+\.\d+$/.test(step.toString())) return (data - min) % step === 0;
				const index = step.toString().indexOf(".");
				const digits = step.toString().slice(index + 1).length;
				return Math.abs(decimalShift(data, digits) - decimalShift(min, digits)) % decimalShift(step, digits) === 0;
			}
			__name(isMultipleOf, "isMultipleOf");
			Schema.extend("number", (data, { meta }, options) => {
				if (typeof data !== "number") throw new ValidationError(`expected number but got ${data}`, options);
				checkWithinRange(data, meta, "number", options);
				const { step } = meta;
				if (step && !isMultipleOf(data, meta.min ?? 0, step)) throw new ValidationError(`expected number multiple of ${step} but got ${data}`, options);
				return [data];
			});
			Schema.extend("boolean", (data, _, options) => {
				if (typeof data === "boolean") return [data];
				throw new ValidationError(`expected boolean but got ${data}`, options);
			});
			Schema.extend("bitset", (data, { bits, meta }, options) => {
				let value = 0, keys = [];
				if (typeof data === "number") {
					value = data;
					for (const key in bits) if (data & bits[key]) keys.push(key);
				} else if (Array.isArray(data)) {
					keys = data;
					for (const key of keys) {
						if (typeof key !== "string") throw new ValidationError(`expected string but got ${key}`, options);
						if (key in bits) value |= bits[key];
					}
				} else throw new ValidationError(`expected number or array but got ${data}`, options);
				if (value === meta.default) return [value];
				return [value, keys];
			});
			Schema.extend("function", (data, _, options) => {
				if (typeof data === "function") return [data];
				throw new ValidationError(`expected function but got ${data}`, options);
			});
			Schema.extend("is", (data, { constructor }, options) => {
				if (typeof constructor === "function") {
					if (data instanceof constructor) return [data];
					throw new ValidationError(`expected ${constructor.name} but got ${data}`, options);
				} else {
					if ((0, import_cosmokit.isNullable)(data)) throw new ValidationError(`expected ${constructor} but got ${data}`, options);
					let prototype = Object.getPrototypeOf(data);
					while (prototype) {
						if (prototype.constructor?.name === constructor) return [data];
						prototype = Object.getPrototypeOf(prototype);
					}
					throw new ValidationError(`expected ${constructor} but got ${data}`, options);
				}
			});
			function property(data, key, schema, options) {
				try {
					const [value, adapted] = Schema.resolve(data[key], schema, {
						...options,
						path: [...options.path || [], key]
					});
					if (adapted !== void 0) data[key] = adapted;
					return value;
				} catch (e) {
					if (!options?.autofix) throw e;
					delete data[key];
					return schema.meta.default;
				}
			}
			__name(property, "property");
			Schema.extend("array", (data, { inner, meta }, options) => {
				if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
				checkWithinRange(data.length, meta, "array length", options, !(0, import_cosmokit.isNullable)(inner.meta.default));
				return [data.map((_, index) => property(data, index, inner, options))];
			});
			Schema.extend("dict", (data, { inner, sKey }, options, strict) => {
				if (!(0, import_cosmokit.isPlainObject)(data)) throw new ValidationError(`expected object but got ${data}`, options);
				const result = {};
				for (const key in data) {
					let rKey;
					try {
						rKey = Schema.resolve(key, sKey, options)[0];
					} catch (error) {
						if (strict) continue;
						throw error;
					}
					result[rKey] = property(data, key, inner, options);
					data[rKey] = data[key];
					if (key !== rKey) delete data[key];
				}
				return [result];
			});
			Schema.extend("tuple", (data, { list }, options, strict) => {
				if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
				const result = list.map((inner, index) => property(data, index, inner, options));
				if (strict) return [result];
				result.push(...data.slice(list.length));
				return [result];
			});
			function merge(result, data) {
				for (const key in data) {
					if (key in result) continue;
					result[key] = data[key];
				}
			}
			__name(merge, "merge");
			Schema.extend("object", (data, { dict }, options, strict) => {
				if (!(0, import_cosmokit.isPlainObject)(data)) throw new ValidationError(`expected object but got ${data}`, options);
				const result = {};
				for (const key in dict) {
					const value = property(data, key, dict[key], options);
					if (!(0, import_cosmokit.isNullable)(value) || key in data) result[key] = value;
				}
				if (!strict) merge(result, data);
				return [result];
			});
			Schema.extend("union", (data, { list, toString: toString2 }, options, strict) => {
				const messages = [];
				for (const inner of list) try {
					return Schema.resolve(data, inner, options, strict);
				} catch (error) {
					messages.push(error);
				}
				throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
			});
			Schema.extend("intersect", (data, { list, toString: toString2 }, options, strict) => {
				if (!list.length) return [data];
				let result;
				for (const inner of list) {
					const value = Schema.resolve(data, inner, options, true)[0];
					if ((0, import_cosmokit.isNullable)(value)) continue;
					if ((0, import_cosmokit.isNullable)(result)) result = value;
					else if (typeof result !== typeof value) throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
					else if (typeof value === "object") merge(result ??= {}, value);
					else if (result !== value) throw new ValidationError(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
				}
				if (!strict && (0, import_cosmokit.isPlainObject)(data)) merge(result, data);
				return [result];
			});
			Schema.extend("transform", (data, { inner, callback, preserve }, options) => {
				const [result, adapted = data] = Schema.resolve(data, inner, options, true);
				if (preserve) return [callback(result)];
				else return [callback(result), callback(adapted)];
			});
			var formatters = {};
			function defineMethod(name, keys, format) {
				formatters[name] = format;
				Object.assign(Schema, { [name](...args) {
					const schema = new Schema({ type: name });
					keys.forEach((key, index) => {
						switch (key) {
							case "sKey":
								schema.sKey = args[index] ?? Schema.string();
								break;
							case "inner":
								schema.inner = Schema.from(args[index]);
								break;
							case "list":
								schema.list = args[index].map(Schema.from);
								break;
							case "dict":
								schema.dict = (0, import_cosmokit.valueMap)(args[index], Schema.from);
								break;
							case "bits":
								schema.bits = {};
								for (const key2 in args[index]) {
									if (typeof args[index][key2] !== "number") continue;
									schema.bits[key2] = args[index][key2];
								}
								break;
							case "callback": {
								const callback = schema.callback = args[index];
								callback["toJSON"] ||= () => callback.toString();
								break;
							}
							case "constructor": {
								const constructor = schema.constructor = args[index];
								if (typeof constructor === "function") constructor["toJSON"] ||= () => constructor["name"];
								break;
							}
							default: schema[key] = args[index];
						}
					});
					if (name === "object" || name === "dict") schema.meta.default = {};
					else if (name === "array" || name === "tuple") schema.meta.default = [];
					else if (name === "bitset") schema.meta.default = 0;
					return schema;
				} });
			}
			__name(defineMethod, "defineMethod");
			defineMethod("is", ["constructor"], ({ constructor }) => {
				if (typeof constructor === "function") return constructor.name;
				else return constructor;
			});
			defineMethod("any", [], () => "any");
			defineMethod("never", [], () => "never");
			defineMethod("const", ["value"], ({ value }) => typeof value === "string" ? JSON.stringify(value) : value);
			defineMethod("string", [], () => "string");
			defineMethod("number", [], () => "number");
			defineMethod("boolean", [], () => "boolean");
			defineMethod("bitset", ["bits"], () => "bitset");
			defineMethod("function", [], () => "function");
			defineMethod("array", ["inner"], ({ inner }) => `${inner.toString(true)}[]`);
			defineMethod("dict", ["inner", "sKey"], ({ inner, sKey }) => `{ [key: ${sKey.toString()}]: ${inner.toString()} }`);
			defineMethod("tuple", ["list"], ({ list }) => `[${list.map((inner) => inner.toString()).join(", ")}]`);
			defineMethod("object", ["dict"], ({ dict }) => {
				if (Object.keys(dict).length === 0) return "{}";
				return `{ ${Object.entries(dict).map(([key, inner]) => {
					return `${key}${inner.meta.required ? "" : "?"}: ${inner.toString()}`;
				}).join(", ")} }`;
			});
			defineMethod("union", ["list"], ({ list }, inline) => {
				const result = list.map(({ toString: format }) => format()).join(" | ");
				return inline ? `(${result})` : result;
			});
			defineMethod("intersect", ["list"], ({ list }) => {
				return `${list.map((inner) => inner.toString(true)).join(" & ")}`;
			});
			defineMethod("transform", [
				"inner",
				"callback",
				"preserve"
			], ({ inner }, isInner) => inner.toString(isInner));
			module.exports = Schema;
		})))(), 1);
		import_lib.default.object({
			version: import_lib.default.number().default(1),
			bindings: import_lib.default.dict(import_lib.default.object({
				combo: import_lib.default.object({
					key: import_lib.default.string(),
					primary: import_lib.default.boolean().default(false),
					alt: import_lib.default.boolean().default(false),
					shift: import_lib.default.boolean().default(false),
					control: import_lib.default.boolean().default(false)
				}).required(false),
				scope: import_lib.default.union(["app", "global"]).required(false),
				disabled: import_lib.default.boolean().required(false)
			})).default({})
		});
		const DEFAULT_SHORTCUT_SETTINGS = {
			version: 1,
			bindings: {}
		};
		//#endregion
		//#region src/client/desktop-runtime.ts
		function desktopRuntimeUrl(pathname) {
			const origin = globalThis.__DSH_DESKTOP_RUNTIME_ORIGIN__;
			return origin === void 0 ? pathname : new URL(pathname, origin).href;
		}
		//#endregion
		//#region src/client/settings-api.ts
		var ShortcutSettingsApiError = class extends Error {
			constructor(code, message) {
				super(message);
				this.code = code;
			}
		};
		async function call(method, payload) {
			let response;
			try {
				response = await fetch(desktopRuntimeUrl("/cocode/shortcuts/api/" + method), {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(payload)
				});
			} catch (error) {
				throw new ShortcutSettingsApiError("network", error instanceof Error ? error.message : String(error));
			}
			const parsed = await response.json().catch(() => null);
			if (!response.ok || parsed?.ok !== true || parsed.value === void 0) throw new ShortcutSettingsApiError(parsed?.error?.code ?? "http", parsed?.error?.message ?? "HTTP " + String(response.status));
			return parsed.value;
		}
		const shortcutSettingsTransport = {
			get: () => call("settings.get", {}),
			update: (patch, expectedRevision) => call("settings.update", {
				patch,
				...expectedRevision === void 0 ? {} : { expectedRevision }
			})
		};
		//#endregion
		//#region src/client/settings-controller.ts
		function isRecord(value) {
			return value !== null && typeof value === "object" && !Array.isArray(value);
		}
		function normalizeBinding(value) {
			if (!isRecord(value)) return void 0;
			const binding = {};
			if (value.combo !== void 0) {
				if (!isRecord(value.combo) || typeof value.combo.key !== "string" || value.combo.key === "") return;
				const combo = { key: value.combo.key };
				for (const key of [
					"primary",
					"alt",
					"shift",
					"control"
				]) {
					const candidate = value.combo[key];
					if (candidate === void 0) continue;
					if (typeof candidate !== "boolean") return void 0;
					combo[key] = candidate;
				}
				binding.combo = combo;
			}
			if (value.scope !== void 0) {
				if (value.scope !== "app" && value.scope !== "global") return void 0;
				binding.scope = value.scope;
			}
			if (value.disabled !== void 0) {
				if (typeof value.disabled !== "boolean") return void 0;
				binding.disabled = value.disabled;
			}
			return binding;
		}
		function normalizeSettingsView(value) {
			if (!isRecord(value) || !isRecord(value.value) || value.value.version !== 1) throw new ShortcutSettingsApiError("invalid-response", "invalid shortcut settings response");
			if (!isRecord(value.value.bindings)) throw new ShortcutSettingsApiError("invalid-response", "invalid shortcut bindings response");
			const bindings = {};
			for (const [commandId, binding] of Object.entries(value.value.bindings)) {
				const normalized = normalizeBinding(binding);
				if (normalized === void 0) throw new ShortcutSettingsApiError("invalid-response", "invalid shortcut binding for " + commandId);
				bindings[commandId] = normalized;
			}
			if (!Number.isInteger(value.revision) || value.revision < 0 || typeof value.writable !== "boolean") throw new ShortcutSettingsApiError("invalid-response", "invalid shortcut settings metadata");
			return {
				value: {
					version: 1,
					bindings
				},
				...value.user === void 0 ? {} : { user: value.user },
				...value.base === void 0 ? {} : { base: value.base },
				revision: value.revision,
				writable: value.writable
			};
		}
		/** Owns shortcut settings loading, revision-fenced writes, and memory fallback. */
		var ShortcutSettingsController = class {
			listeners = /* @__PURE__ */ new Set();
			snapshot = {
				value: structuredClone(DEFAULT_SHORTCUT_SETTINGS),
				status: "loading",
				writable: false
			};
			focusTarget;
			generation = 0;
			disposed = false;
			hasRemoteState = false;
			constructor(transport = shortcutSettingsTransport) {
				this.transport = transport;
			}
			getSnapshot = () => this.snapshot;
			subscribe = (listener) => {
				this.listeners.add(listener);
				return () => this.listeners.delete(listener);
			};
			mount(target = window) {
				if (this.disposed || this.focusTarget !== void 0) return;
				this.focusTarget = target;
				target.addEventListener("focus", this.onFocus);
				this.reload();
			}
			async reload() {
				if (this.disposed) return;
				const generation = ++this.generation;
				try {
					const view = normalizeSettingsView(await this.transport.get());
					if (this.disposed || generation !== this.generation) return;
					this.hasRemoteState = true;
					this.publish({
						value: view.value,
						status: "ready",
						writable: view.writable,
						revision: view.revision
					});
				} catch (error) {
					if (this.disposed || generation !== this.generation) return;
					const message = error instanceof Error ? error.message : String(error);
					if (!this.hasRemoteState) {
						this.publish({
							value: this.snapshot.value,
							status: "memory",
							writable: true,
							error: message
						});
						return;
					}
					this.publish({
						...this.snapshot,
						error: message
					});
				}
			}
			async setBindings(bindings) {
				if (this.disposed) return;
				const nextValue = {
					version: 1,
					bindings: structuredClone(bindings)
				};
				if (this.snapshot.status === "memory") {
					this.publish({
						value: nextValue,
						status: "memory",
						writable: true,
						...this.snapshot.error === void 0 ? {} : { error: this.snapshot.error }
					});
					return;
				}
				if (!this.snapshot.writable || this.snapshot.revision === void 0) return;
				const generation = ++this.generation;
				try {
					const view = normalizeSettingsView(await this.transport.update(nextValue, this.snapshot.revision));
					if (this.disposed || generation !== this.generation) return;
					this.hasRemoteState = true;
					this.publish({
						value: view.value,
						status: "ready",
						writable: view.writable,
						revision: view.revision
					});
				} catch (error) {
					if (this.disposed || generation !== this.generation) return;
					const message = error instanceof Error ? error.message : String(error);
					this.publish({
						...this.snapshot,
						error: message
					});
					if (error instanceof ShortcutSettingsApiError && error.code === "settings-conflict") await this.reload();
				}
			}
			async resetBinding(commandId) {
				const bindings = { ...this.snapshot.value.bindings };
				delete bindings[commandId];
				await this.setBindings(bindings);
			}
			dispose() {
				if (this.disposed) return;
				this.disposed = true;
				this.generation += 1;
				this.focusTarget?.removeEventListener("focus", this.onFocus);
				this.focusTarget = void 0;
				this.listeners.clear();
			}
			onFocus = () => {
				this.reload();
			};
			publish(snapshot) {
				this.snapshot = snapshot;
				for (const listener of [...this.listeners]) listener();
			}
		};
		//#endregion
		//#region src/client/locales.ts
		const en = { nav: "Keyboard Shortcuts" };
		const zh = { nav: "快捷键" };
		//#endregion
		//#region src/client/index.tsx
		const inject = [
			"slots",
			"layout",
			"workspaces",
			"locale"
		];
		const SHORTCUTS_LOCALE_NAMESPACE = "settings.shortcuts";
		function commandCatalog(ctx) {
			return [{
				id: SIDEBAR_TOGGLE_COMMAND,
				title: "切换侧栏",
				description: "显示或隐藏左侧工作区栏",
				defaultCombo: {
					key: "b",
					primary: true
				},
				run: () => {
					ctx.layout.toggleSidebar();
				}
			}, {
				id: NEW_SESSION_COMMAND,
				title: "新建会话",
				description: "在当前或最近的工作区创建新会话",
				defaultCombo: {
					key: "n",
					primary: true
				},
				globalCapable: true,
				run: () => {
					ctx.workspaces.startSession();
				}
			}];
		}
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(SHORTCUTS_LOCALE_NAMESPACE, {
				zh,
				en
			}), "cocode-shortcuts: dictionaries");
			const t = ctx.locale.bind(SHORTCUTS_LOCALE_NAMESPACE);
			const settings = new ShortcutSettingsController();
			const registry = new ShortcutRegistry(ctx, settings);
			ctx.reflect.provide("shortcuts", registry);
			ctx.effect(() => {
				settings.mount();
				return () => {
					settings.dispose();
				};
			}, "cocode-shortcuts: settings controller");
			ctx.effect(() => registry.mount(), "cocode-shortcuts: keyboard dispatcher");
			for (const command of commandCatalog(ctx)) ctx.effect(() => registry.register(command), `cocode-shortcuts: ${command.id}`);
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "cocode-shortcuts",
				order: 12,
				label: () => t("nav"),
				locale: SHORTCUTS_LOCALE_NAMESPACE,
				inject: () => ({ registry })
			}, ShortcutsSection));
		}
		//#endregion
		exports.NEW_SESSION_COMMAND = NEW_SESSION_COMMAND;
		exports.SIDEBAR_TOGGLE_COMMAND = SIDEBAR_TOGGLE_COMMAND;
		exports.ShortcutRegistry = ShortcutRegistry;
		exports.ShortcutSettingsController = ShortcutSettingsController;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map