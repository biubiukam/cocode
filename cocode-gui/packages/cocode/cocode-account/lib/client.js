window.__ModuleLoader__.load({
	id: "cocode-account",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_dom_client = require("react-dom/client");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region \0dsh-css:packages/cocode/cocode-account/src/client/account.module.css.mjs
		const css = ".fbjzpq_menuRoot{border:1px solid var(--dsw-alias-border-inverted);background:var(--dsw-specific-menu);border-radius:16px;gap:2px;width:min(280px,100vw - 24px);min-width:260px;padding:8px;display:flex;overflow:hidden;box-shadow:0 18px 44px #00000057,0 2px 8px #0000002e}.fbjzpq_menuRoot [role=menuitem]{border-radius:10px;gap:10px;min-height:40px;padding:8px 10px;font-size:14px;line-height:20px}.fbjzpq_menuRoot [role=menuitem]:focus-visible{outline:2px solid var(--dsw-alias-state-focus,currentColor);outline-offset:-2px}.fbjzpq_menuRoot [role=separator]{background:var(--dsw-alias-border-l2);margin:7px 4px}.fbjzpq_actionRoot{width:100%;min-width:0;display:flex}.fbjzpq_actionRootRail{width:36px;min-width:36px;height:36px}.fbjzpq_menuGlyph{color:currentColor;flex:none;display:block}.fbjzpq_trigger{width:100%;min-width:0;height:40px;color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;text-align:left;transition-property:background-color,transform;transition-duration:.14s;transition-timing-function:var(--ds-ease-in-out);background:0 0;border:none;border-radius:14px;align-items:center;gap:8px;padding:4px 8px;display:flex}.fbjzpq_trigger:hover,.fbjzpq_trigger[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover)}.fbjzpq_trigger:active:not(:disabled){transform:scale(.96)}.fbjzpq_trigger:focus-visible{outline:2px solid var(--dsw-alias-state-focus,currentColor);outline-offset:1px}.fbjzpq_trigger:disabled{cursor:wait;opacity:.65}.fbjzpq_avatar{border-radius:9px;flex:none;justify-content:center;align-items:center;width:28px;height:28px;font-size:13px;font-weight:600;line-height:1;display:inline-flex}.fbjzpq_accountAvatar{background:var(--dsw-alias-accent-fill,#2f7cf6);color:var(--dsw-alias-label-on-color,white)}.fbjzpq_providerAvatar{background:var(--dsw-alias-bg-layer-2);box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}.fbjzpq_guestAvatar{box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0}.fbjzpq_copy{flex-direction:column;flex:1;gap:1px;min-width:0;display:flex}.fbjzpq_primary,.fbjzpq_secondary{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.fbjzpq_primary{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:500;line-height:20px}.fbjzpq_secondary{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:15px}.fbjzpq_chevron{color:var(--dsw-alias-label-tertiary);transition:transform .14s var(--ds-ease-in-out);flex:none;transform:translateY(1px)}.fbjzpq_trigger[aria-expanded=true] .fbjzpq_chevron{transform:translateY(1px)rotate(180deg)}.fbjzpq_trigger.fbjzpq_rail{border-radius:50%;width:36px;height:36px;padding:2px}.fbjzpq_rail .fbjzpq_avatar{border-radius:50%;width:32px;height:32px}.fbjzpq_panelOverlay{z-index:1200;background:#0000006b;place-items:center;padding:24px;display:grid;position:fixed;inset:0}.fbjzpq_panel{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-l1,#18181c);width:min(448px,100%);color:var(--dsw-alias-label-primary);border-radius:18px;padding:20px;box-shadow:0 24px 70px #00000057}.fbjzpq_panelHeader{justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:18px;display:flex}.fbjzpq_panelTitle{margin:0;font-size:18px;font-weight:600;line-height:24px}.fbjzpq_panelSubtitle,.fbjzpq_panelSecondary,.fbjzpq_panelHint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;display:block}.fbjzpq_panelClose{width:32px;height:32px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:0;border-radius:50%;padding:0;font-size:24px;line-height:1}.fbjzpq_panelClose:hover{background:var(--dsw-alias-interactive-bg-hover)}.fbjzpq_panelStack{flex-direction:column;gap:12px;display:flex}.fbjzpq_profileCard,.fbjzpq_planCard,.fbjzpq_usageCard{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);border-radius:14px;flex-direction:column;gap:5px;padding:14px 16px;display:flex}.fbjzpq_profileCard{flex-direction:row;align-items:center;gap:12px}.fbjzpq_profileCopy{flex-direction:column;gap:2px;min-width:0;display:flex}.fbjzpq_panelPrimary,.fbjzpq_planName{font-size:15px;line-height:21px}.fbjzpq_planCard{background:linear-gradient(135deg, var(--dsw-alias-bg-layer-2), var(--dsw-alias-bg-l1,#18181c));box-shadow:inset 0 1px #ffffff09}.fbjzpq_planName{letter-spacing:.02em;font-size:17px;line-height:22px}.fbjzpq_planCard .fbjzpq_panelSecondary{font-size:11px;line-height:16px}.fbjzpq_factList{border-top:1px solid var(--dsw-alias-border-l2);flex-direction:column;display:flex}.fbjzpq_panelSectionTitle{color:var(--dsw-alias-label-secondary);margin-top:2px;font-size:12px;font-weight:600;line-height:18px}.fbjzpq_factRow{border-bottom:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);justify-content:space-between;align-items:center;gap:16px;padding:12px 0;font-size:13px;display:flex}.fbjzpq_factRow strong{color:var(--dsw-alias-label-primary);font-weight:500}.fbjzpq_panelEyebrow{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}.fbjzpq_usageGrid{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;display:grid}.fbjzpq_usageMetric{border:1px solid var(--dsw-alias-border-l2);background:color-mix(in srgb, var(--dsw-alias-bg-layer-2) 88%, white 12%);border-radius:12px;flex-direction:column;gap:8px;min-width:0;min-height:92px;padding:12px 11px 11px;display:flex}.fbjzpq_usageMetricHeader{justify-content:space-between;align-items:center;gap:4px;display:flex}.fbjzpq_usageMetricLabel{min-width:0;color:var(--dsw-alias-label-secondary);white-space:nowrap;font-size:11px;line-height:16px}.fbjzpq_usageMetricPercent{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;flex:none;font-size:16px;line-height:20px}.fbjzpq_usageTrack{background:var(--dsw-alias-border-l2);border-radius:999px;height:6px;overflow:hidden}.fbjzpq_usageFill{border-radius:inherit;background:var(--dsw-alias-accent-fill,#2f7cf6);height:100%;transition:width .18s var(--ds-ease-in-out);display:block}@media (width<=460px){.fbjzpq_usageGrid{grid-template-columns:1fr}}.fbjzpq_panelIntro,.fbjzpq_panelHint{margin:0}.fbjzpq_panelHint{padding:0 2px;font-size:11px;line-height:16px}.fbjzpq_panelAction{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);min-height:42px;color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;text-align:left;border-radius:10px;align-items:center;padding:0 13px;text-decoration:none;display:flex}.fbjzpq_panelAction:hover{background:var(--dsw-alias-interactive-bg-hover)}.fbjzpq_panelAction:focus-visible{outline:2px solid var(--dsw-alias-state-focus,currentColor);outline-offset:1px}.fbjzpq_panelAction:active{transform:scale(.98)}.fbjzpq_providerHelpCard{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);border-radius:14px;flex-direction:column;gap:4px;padding:14px 16px;display:flex}@media (prefers-reduced-motion:reduce){.fbjzpq_trigger,.fbjzpq_chevron{transition:none}}";
		const tagId = "cocode-account/account.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "cocode-account";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var account_module_css_default = {
			"actionRootRail": "fbjzpq_actionRootRail",
			"planCard": "fbjzpq_planCard",
			"panelSecondary": "fbjzpq_panelSecondary",
			"factList": "fbjzpq_factList",
			"panelSectionTitle": "fbjzpq_panelSectionTitle",
			"panelOverlay": "fbjzpq_panelOverlay",
			"chevron": "fbjzpq_chevron",
			"accountAvatar": "fbjzpq_accountAvatar",
			"providerAvatar": "fbjzpq_providerAvatar",
			"avatar": "fbjzpq_avatar",
			"providerHelpCard": "fbjzpq_providerHelpCard",
			"usageGrid": "fbjzpq_usageGrid",
			"panelHint": "fbjzpq_panelHint",
			"menuGlyph": "fbjzpq_menuGlyph",
			"panelStack": "fbjzpq_panelStack",
			"profileCard": "fbjzpq_profileCard",
			"usageMetricLabel": "fbjzpq_usageMetricLabel",
			"panelClose": "fbjzpq_panelClose",
			"panelSubtitle": "fbjzpq_panelSubtitle",
			"panel": "fbjzpq_panel",
			"planName": "fbjzpq_planName",
			"factRow": "fbjzpq_factRow",
			"rail": "fbjzpq_rail",
			"panelHeader": "fbjzpq_panelHeader",
			"trigger": "fbjzpq_trigger",
			"secondary": "fbjzpq_secondary",
			"primary": "fbjzpq_primary",
			"usageMetric": "fbjzpq_usageMetric",
			"copy": "fbjzpq_copy",
			"panelEyebrow": "fbjzpq_panelEyebrow",
			"profileCopy": "fbjzpq_profileCopy",
			"guestAvatar": "fbjzpq_guestAvatar",
			"panelIntro": "fbjzpq_panelIntro",
			"menuRoot": "fbjzpq_menuRoot",
			"panelPrimary": "fbjzpq_panelPrimary",
			"usageMetricPercent": "fbjzpq_usageMetricPercent",
			"usageMetricHeader": "fbjzpq_usageMetricHeader",
			"panelAction": "fbjzpq_panelAction",
			"actionRoot": "fbjzpq_actionRoot",
			"usageTrack": "fbjzpq_usageTrack",
			"usageFill": "fbjzpq_usageFill",
			"panelTitle": "fbjzpq_panelTitle",
			"usageCard": "fbjzpq_usageCard"
		};
		//#endregion
		//#region src/client/index.tsx
		const EMPTY = {
			phase: "signed-out",
			profile: null,
			cloud: {
				status: "absent",
				providerId: "cocode-cloud"
			}
		};
		const COPY = {
			zh: {
				signIn: "登录 Cocode",
				signInTitle: "登录 Cocode 账号",
				signOutTitle: "退出 Cocode 账号",
				waiting: "等待浏览器登录…",
				provisioning: "配置 Cocode Cloud…",
				retry: "重试 Cocode",
				browserHint: "请在系统浏览器中完成 Cocode 授权。",
				provisioningHint: "正在为当前账号配置 Cocode Cloud 模型。",
				intro: "登录 Cocode 后即可使用账号可用的云模型，也不会改变已有默认模型。",
				later: "稍后配置",
				conflict: "本机已有同名 Provider 或凭证，请先在模型设置中处理冲突。",
				cleanupPending: "本地账号已退出，Cocode Cloud 配置将在运行时恢复后继续清理。",
				reauthentication: "请在浏览器中重新认证 Cocode 账号（十分钟内完成），然后点击重试。",
				account: "Cocode 账号",
				accountPlan: "账户与计划",
				planUsage: "套餐用量",
				customProvider: "自定义 Provider",
				noProvider: "登录或配置 Provider",
				models: "模型与 Provider",
				settings: "设置",
				help: "帮助与反馈",
				signOut: "退出登录",
				providerId: "Provider ID："
			},
			en: {
				signIn: "Sign in to Cocode",
				signInTitle: "Sign in to your Cocode account",
				signOutTitle: "Sign out of your Cocode account",
				waiting: "Waiting for browser sign-in…",
				provisioning: "Configuring Cocode Cloud…",
				retry: "Retry Cocode",
				browserHint: "Complete Cocode authorization in your system browser.",
				provisioningHint: "Configuring Cocode Cloud models for this account.",
				intro: "Sign in to use the cloud models available to your account without changing the existing default model.",
				later: "Configure later",
				conflict: "A provider or credential with the reserved Cocode name already exists. Resolve it in Models settings first.",
				cleanupPending: "The local account is signed out. Cloud configuration cleanup will resume when the runtime is available.",
				reauthentication: "Reauthenticate your Cocode account in the browser within ten minutes, then retry.",
				account: "Cocode account",
				accountPlan: "Account & plan",
				planUsage: "Plan usage",
				customProvider: "Custom provider",
				noProvider: "Sign in or configure a provider",
				models: "Models & providers",
				settings: "Settings",
				help: "Help & feedback",
				signOut: "Sign out",
				providerId: "Provider ID: "
			}
		};
		/** Stable DOM hook owned by the settings shell's trigger. */
		const SETTINGS_TRIGGER = "[data-dsh-settings-trigger]";
		function copy() {
			return document.documentElement.lang.toLowerCase().startsWith("zh") || navigator.language.toLowerCase().startsWith("zh") ? COPY.zh : COPY.en;
		}
		var AccountStore = class {
			snapshot = EMPTY;
			listeners = /* @__PURE__ */ new Set();
			off;
			busy = false;
			getSnapshot = () => this.snapshot;
			subscribe = (listener) => {
				this.listeners.add(listener);
				this.start();
				return () => this.listeners.delete(listener);
			};
			async activate() {
				if (this.busy) return;
				const account = window.desktopApi?.account;
				if (account === void 0) return;
				this.busy = true;
				try {
					this.set(await account.signIn());
				} catch (error) {
					this.set({
						...this.snapshot,
						phase: "error",
						error: {
							code: "sign-in-failed",
							message: safeMessage(error)
						}
					});
				} finally {
					this.busy = false;
				}
			}
			async retry() {
				if (this.snapshot.error?.code !== "cleanup-pending") {
					await this.activate();
					return;
				}
				if (this.busy) return;
				const account = window.desktopApi?.account;
				if (account === void 0) return;
				this.busy = true;
				try {
					await account.signOut();
					this.set(await account.snapshot());
				} catch (error) {
					this.set({
						...this.snapshot,
						phase: "error",
						error: {
							code: "cleanup-pending",
							message: safeMessage(error)
						}
					});
				} finally {
					this.busy = false;
				}
			}
			async deactivate() {
				if (this.busy) return;
				const account = window.desktopApi?.account;
				if (account === void 0) return;
				this.busy = true;
				try {
					await account.signOut();
					this.set(await account.snapshot());
				} catch (error) {
					this.set({
						...this.snapshot,
						phase: "error",
						error: {
							code: "sign-out-failed",
							message: safeMessage(error)
						}
					});
				} finally {
					this.busy = false;
				}
			}
			async refresh() {
				const account = window.desktopApi?.account;
				if (account === void 0) return;
				try {
					this.set(await account.snapshot());
				} catch (error) {
					this.set({
						...this.snapshot,
						usage: {
							...this.snapshot.usage,
							error: safeMessage(error)
						}
					});
				}
			}
			dispose() {
				this.off?.();
				this.off = void 0;
				this.listeners.clear();
			}
			start() {
				if (this.off !== void 0) return;
				const account = window.desktopApi?.account;
				if (account === void 0) return;
				this.off = account.onChanged((snapshot) => this.set(snapshot));
				account.snapshot().then((snapshot) => this.set(snapshot), (error) => {
					this.set({
						...EMPTY,
						phase: "error",
						error: {
							code: "account-unavailable",
							message: safeMessage(error)
						}
					});
				});
			}
			set(snapshot) {
				this.snapshot = snapshot;
				for (const listener of [...this.listeners]) listener();
			}
		};
		var ProviderStore = class {
			connection;
			snapshot = null;
			providers = [];
			listeners = /* @__PURE__ */ new Set();
			generation = 0;
			constructor(connection) {
				this.connection = connection;
			}
			getSnapshot = () => this.snapshot;
			subscribe = (listener) => {
				this.listeners.add(listener);
				return () => this.listeners.delete(listener);
			};
			refreshSelection() {
				this.publish(this.select(this.providers));
			}
			async load() {
				const generation = ++this.generation;
				try {
					const response = await this.connection.api.llm.providers({});
					if (!response.result.ok || generation !== this.generation) return;
					this.providers = response.result.value.providers;
					this.publish(this.select(this.providers));
				} catch {}
			}
			select(providers) {
				const active = providers.filter((provider) => provider.active);
				const preferred = this.connection.hostDescription.getSnapshot()?.provider;
				const provider = active.find((candidate) => candidate.provider === preferred) ?? active.find((candidate) => candidate.provider !== "cocode-cloud") ?? active[0];
				return provider === void 0 ? null : {
					id: provider.provider,
					name: provider.displayName
				};
			}
			publish(next) {
				if (this.snapshot?.id === next?.id && this.snapshot?.name === next?.name) return;
				this.snapshot = next;
				for (const listener of [...this.listeners]) listener();
			}
		};
		function safeMessage(error) {
			return (error instanceof Error ? error.message : String(error)).replace(/ck_[A-Za-z0-9_-]+/g, "[redacted]");
		}
		function labelOf(snapshot, wide) {
			const t = copy();
			if (!wide) return snapshot.phase === "signed-in" ? "C" : t.signIn;
			if (snapshot.phase === "signed-in") return snapshot.profile?.displayName ?? "Cocode";
			if (snapshot.phase === "signing-in") return t.waiting;
			if (snapshot.phase === "provisioning") return t.provisioning;
			if (snapshot.phase === "error") return t.retry;
			return t.signIn;
		}
		function accountError(snapshot) {
			const t = copy();
			if (snapshot.error?.code === "cloud-provider-conflict") return t.conflict;
			if (snapshot.error?.code === "cleanup-pending") return t.cleanupPending;
			if (snapshot.error?.code === "reauthentication-required") return t.reauthentication;
			return snapshot.error?.message;
		}
		function AccountOnboarding({ complete, openSection, store }) {
			const snapshot = (0, react.useSyncExternalStore)(store.subscribe, store.getSnapshot, store.getSnapshot);
			const t = copy();
			const completed = (0, react.useRef)(false);
			(0, react.useEffect)(() => {
				if (snapshot.phase === "signed-in" && !completed.current) {
					completed.current = true;
					complete();
				}
			}, [complete, snapshot.phase]);
			if (snapshot.phase === "signed-in") return null;
			const busy = snapshot.phase === "signing-in" || snapshot.phase === "provisioning";
			const message = snapshot.phase === "signing-in" ? t.browserHint : snapshot.phase === "provisioning" ? t.provisioningHint : t.intro;
			return (0, react.createElement)("div", {
				role: "dialog",
				"aria-modal": "true",
				style: {
					position: "fixed",
					inset: 0,
					zIndex: 1e3,
					display: "grid",
					placeItems: "center",
					padding: "24px",
					background: "rgba(0, 0, 0, .35)"
				}
			}, (0, react.createElement)("div", { style: {
				width: "min(420px, 100%)",
				padding: "24px",
				borderRadius: "14px",
				background: "var(--dsw-alias-bg-l1, Canvas)",
				color: "var(--dsw-alias-label-primary, CanvasText)",
				boxShadow: "0 20px 60px rgba(0, 0, 0, .22)"
			} }, (0, react.createElement)("h2", { style: {
				margin: "0 0 10px",
				fontSize: "18px"
			} }, t.signIn), (0, react.createElement)("p", { style: {
				margin: "0 0 18px",
				lineHeight: 1.5
			} }, message), snapshot.error === void 0 ? null : (0, react.createElement)("p", {
				role: "alert",
				style: {
					color: "#c33",
					margin: "0 0 12px"
				}
			}, accountError(snapshot)), (0, react.createElement)("div", { style: {
				display: "flex",
				gap: "8px",
				justifyContent: "flex-end"
			} }, (0, react.createElement)("button", {
				type: "button",
				onClick: () => {
					openSection("models");
					complete();
				},
				disabled: busy
			}, t.later), (0, react.createElement)("button", {
				type: "button",
				onClick: () => {
					store.retry();
				},
				disabled: busy
			}, busy ? t.waiting : t.signIn))));
		}
		function requestSettings(sectionId) {
			const trigger = document.querySelector(SETTINGS_TRIGGER);
			if (trigger === null) return;
			if (sectionId === void 0) delete trigger.dataset.dshSettingsSectionRequest;
			else trigger.dataset.dshSettingsSectionRequest = sectionId;
			trigger.click();
		}
		function initialOf(value) {
			return [...value.trim()][0]?.toUpperCase() ?? "C";
		}
		const ACCOUNT_CENTER_URL = "https://cocode.agency/account";
		function openAccountCenter() {
			window.open(ACCOUNT_CENTER_URL, "_blank", "noopener,noreferrer");
		}
		function snapshotUsage(snapshot, key) {
			return snapshot.usage?.[key];
		}
		function usageSyncLabel(snapshot) {
			if (snapshot.usage?.error !== void 0) return `同步失败：${snapshot.usage.error}`;
			if (snapshot.usage?.syncedAt === void 0) return "正在同步账号用量…";
			const date = new Date(snapshot.usage.syncedAt);
			return Number.isNaN(date.getTime()) ? "账号用量已同步" : `更新于 ${date.toLocaleString()}`;
		}
		function MenuGlyph({ kind }) {
			const paths = {
				account: (0, react.createElement)("path", { d: "M3 13.5c.7-1.9 2.5-3 5-3s4.3 1.1 5 3M8 8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" }),
				usage: (0, react.createElement)("path", { d: "M3 13V9.5M6.5 13V6.5M10 13V3M13.5 13V8M2 13.5h12" }),
				settings: (0, react.createElement)("g", null, (0, react.createElement)("path", { d: "m6.55 2.05.35 1.42a4.9 4.9 0 0 0-1.26.73l-1.36-.56-1.28 2.22 1.01.99a4.8 4.8 0 0 0 0 1.46L3 9.3l1.28 2.22 1.36-.56a4.9 4.9 0 0 0 1.26.73l-.35 1.42h2.56l-.35-1.42a4.9 4.9 0 0 0 1.26-.73l1.36.56 1.28-2.22-1.01-.99a4.8 4.8 0 0 0 0-1.46l1.01-.99-1.28-2.22-1.36.56a4.9 4.9 0 0 0-1.26-.73l.35-1.42Z" }), (0, react.createElement)("circle", {
					cx: 8,
					cy: 7.58,
					r: 1.65
				})),
				help: (0, react.createElement)("path", { d: "M5.9 5.8a2.15 2.15 0 1 1 3.65 1.54c-.9.78-1.55 1.15-1.55 2.16M8 12.25v.1" }),
				logout: (0, react.createElement)("path", { d: "M8.5 3H4.25A1.25 1.25 0 0 0 3 4.25v7.5A1.25 1.25 0 0 0 4.25 13H8.5M9 8h5M11.5 5.5 14 8l-2.5 2.5" })
			};
			return (0, react.createElement)("svg", {
				className: account_module_css_default.menuGlyph,
				viewBox: "0 0 16 16",
				width: 16,
				height: 16,
				fill: "none",
				stroke: "currentColor",
				"stroke-width": 1.6,
				"stroke-linecap": "round",
				"stroke-linejoin": "round",
				"aria-hidden": true
			}, paths[kind]);
		}
		function AccountPanel({ kind, snapshot, provider, onClose }) {
			const t = copy();
			const title = kind === "usage" ? t.planUsage : t.help;
			const isCloud = provider?.id === "cocode-cloud" || provider === null && (snapshot.cloud.status === "ready" || snapshot.cloud.status === "conflict");
			const providerLabel = isCloud ? "Cocode Cloud" : provider?.name ?? "当前 Provider";
			const usageMetric = (label, value) => {
				const percentage = typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : void 0;
				return (0, react.createElement)("div", { className: account_module_css_default.usageMetric }, (0, react.createElement)("div", { className: account_module_css_default.usageMetricHeader }, (0, react.createElement)("span", { className: account_module_css_default.usageMetricLabel }, label), (0, react.createElement)("strong", { className: account_module_css_default.usageMetricPercent }, percentage === void 0 ? "—" : `${percentage}%`)), (0, react.createElement)("div", { className: account_module_css_default.usageTrack }, (0, react.createElement)("span", {
					className: account_module_css_default.usageFill,
					style: { width: `${percentage ?? 0}%` }
				})), (0, react.createElement)("span", { className: account_module_css_default.panelSecondary }, percentage === void 0 ? snapshot.usage?.error === void 0 ? "正在同步" : "同步失败" : "已使用"));
			};
			const body = kind === "usage" ? (0, react.createElement)("div", { className: account_module_css_default.panelStack }, (0, react.createElement)("div", { className: account_module_css_default.planCard }, (0, react.createElement)("span", { className: account_module_css_default.panelEyebrow }, "当前套餐"), (0, react.createElement)("strong", { className: account_module_css_default.planName }, snapshot.usage?.plan?.toUpperCase() ?? (snapshot.usage?.error === void 0 ? "正在同步…" : "同步失败")), (0, react.createElement)("span", { className: account_module_css_default.panelSecondary }, usageSyncLabel(snapshot))), (0, react.createElement)("div", { className: account_module_css_default.usageGrid }, usageMetric("5 小时限额", snapshotUsage(snapshot, "fiveHour")), usageMetric("周限额", snapshotUsage(snapshot, "week")), usageMetric("月限额", snapshotUsage(snapshot, "month"))), (0, react.createElement)("p", { className: account_module_css_default.panelHint }, "百分比代表当前周期已使用额度。本地 Provider 的请求不会计入 Cocode Cloud 用量。")) : (0, react.createElement)("div", { className: account_module_css_default.panelStack }, (0, react.createElement)("div", { className: account_module_css_default.providerHelpCard }, (0, react.createElement)("span", { className: account_module_css_default.panelEyebrow }, "当前 Provider"), (0, react.createElement)("strong", { className: account_module_css_default.planName }, providerLabel), (0, react.createElement)("span", { className: account_module_css_default.panelSecondary }, isCloud ? "账号云模型与 Cocode Cloud 服务" : "本地 Provider 与凭证配置")), (0, react.createElement)("p", { className: account_module_css_default.panelIntro }, isCloud ? "Cocode Cloud 的账号、套餐和云模型问题，可以先打开个人中心；模型选择和本地配置仍在模型设置中管理。" : "当前使用的是本地 Provider。连接、模型不可用或凭证问题，可以从 Provider 设置开始排查。"), isCloud ? (0, react.createElement)("a", {
				className: account_module_css_default.panelAction,
				href: ACCOUNT_CENTER_URL,
				target: "_blank",
				rel: "noreferrer"
			}, "打开 Cocode 个人中心") : null, (0, react.createElement)("a", {
				className: account_module_css_default.panelAction,
				href: "https://cocode.agency",
				target: "_blank",
				rel: "noreferrer"
			}, "访问 Cocode 文档"), (0, react.createElement)("a", {
				className: account_module_css_default.panelAction,
				href: "mailto:support@cocode.agency?subject=Cocode%20反馈"
			}, "发送反馈邮件"));
			return (0, react.createElement)("div", {
				className: account_module_css_default.panelOverlay,
				role: "presentation",
				onMouseDown: (event) => {
					if (event.target === event.currentTarget) onClose();
				}
			}, (0, react.createElement)("section", {
				className: account_module_css_default.panel,
				role: "dialog",
				"aria-modal": "true",
				"aria-label": title
			}, (0, react.createElement)("header", { className: account_module_css_default.panelHeader }, (0, react.createElement)("h2", { className: account_module_css_default.panelTitle }, title), (0, react.createElement)("button", {
				type: "button",
				className: account_module_css_default.panelClose,
				onClick: onClose,
				"aria-label": "关闭"
			}, "×")), body));
		}
		function AccountAction({ wide, store, providers }) {
			const snapshot = (0, react.useSyncExternalStore)(store.subscribe, store.getSnapshot, store.getSnapshot);
			const provider = (0, react.useSyncExternalStore)(providers.subscribe, providers.getSnapshot, providers.getSnapshot);
			const [open, setOpen] = (0, react.useState)(false);
			const [panel, setPanel] = (0, react.useState)(null);
			const signedIn = snapshot.phase === "signed-in" || snapshot.phase === "provisioning";
			const t = copy();
			const busy = snapshot.phase === "signing-in" || snapshot.phase === "provisioning";
			const primary = signedIn ? snapshot.profile?.displayName ?? "Cocode" : provider?.name ?? labelOf(snapshot, true);
			const secondary = signedIn ? null : provider === null ? t.noProvider : t.customProvider;
			const title = accountError(snapshot) ?? primary;
			const entries = signedIn ? [
				{
					id: "account",
					label: t.accountPlan,
					icon: (0, react.createElement)(MenuGlyph, { kind: "account" })
				},
				{
					id: "usage",
					label: t.planUsage,
					icon: (0, react.createElement)(MenuGlyph, { kind: "usage" })
				},
				{
					type: "separator",
					id: "account-separator"
				},
				{
					id: "settings",
					label: t.settings,
					icon: (0, react.createElement)(MenuGlyph, { kind: "settings" })
				},
				{
					id: "help",
					label: t.help,
					icon: (0, react.createElement)(MenuGlyph, { kind: "help" })
				},
				{
					id: "sign-out",
					label: t.signOut,
					danger: true,
					icon: (0, react.createElement)(MenuGlyph, { kind: "logout" })
				}
			] : provider === null ? [
				{
					type: "label",
					id: "identity",
					text: "Cocode"
				},
				{
					id: "sign-in",
					label: t.signIn,
					icon: (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconUserOutline16, { size: 16 })
				},
				{
					id: "models",
					label: t.models,
					icon: (0, react.createElement)(MenuGlyph, { kind: "usage" })
				},
				{
					type: "separator",
					id: "settings-separator"
				},
				{
					id: "settings",
					label: t.settings,
					icon: (0, react.createElement)(MenuGlyph, { kind: "settings" })
				}
			] : [
				{
					type: "label",
					id: "provider",
					text: provider.name
				},
				...provider.id === provider.name ? [] : [{
					type: "label",
					id: "provider-id",
					text: `${t.providerId}${provider.id}`
				}],
				{
					type: "separator",
					id: "provider-separator"
				},
				{
					id: "models",
					label: t.models,
					icon: (0, react.createElement)(MenuGlyph, { kind: "usage" })
				},
				{
					id: "help",
					label: t.help,
					icon: (0, react.createElement)(MenuGlyph, { kind: "help" })
				},
				{
					id: "sign-in",
					label: t.signIn,
					icon: (0, react.createElement)(MenuGlyph, { kind: "account" })
				},
				{
					id: "settings",
					label: t.settings,
					icon: (0, react.createElement)(MenuGlyph, { kind: "settings" })
				}
			];
			const select = (id) => {
				setOpen(false);
				if (id === "sign-in") store.activate();
				else if (id === "sign-out") store.deactivate();
				else if (id === "models") requestSettings("models");
				else if (id === "settings") requestSettings();
				else if (id === "account") openAccountCenter();
				else if (id === "usage") {
					setPanel(id);
					store.refresh();
				} else if (id === "help") setPanel(id);
			};
			return (0, react.createElement)(react.Fragment, null, (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
				open,
				side: "top",
				align: "start",
				portal: true,
				dense: true,
				items: entries,
				onClose: () => {
					setOpen(false);
				},
				onSelect: select,
				className: `${account_module_css_default.menuRoot} ${account_module_css_default.actionRoot} ${wide ? "" : account_module_css_default.actionRootRail}`,
				anchor: (0, react.createElement)("button", {
					type: "button",
					title,
					className: wide ? account_module_css_default.trigger : `${account_module_css_default.trigger} ${account_module_css_default.rail}`,
					"aria-haspopup": "menu",
					"aria-expanded": open,
					disabled: busy,
					onClick: () => {
						setOpen((value) => !value);
					}
				}, (0, react.createElement)("span", { className: `${account_module_css_default.avatar} ${signedIn ? account_module_css_default.accountAvatar : provider === null ? account_module_css_default.guestAvatar : account_module_css_default.providerAvatar}` }, signedIn ? initialOf(primary) : provider === null ? (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconUserOutline16, { size: 18 }) : (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconApiOutline14, { size: 18 })), wide && (0, react.createElement)("span", { className: account_module_css_default.copy }, (0, react.createElement)("span", { className: account_module_css_default.primary }, primary), secondary === null ? null : (0, react.createElement)("span", { className: account_module_css_default.secondary }, secondary)), wide && (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconChevronUpOutline14, {
					className: account_module_css_default.chevron,
					size: 14
				}))
			}), panel === null ? null : (0, react.createElement)(AccountPanel, {
				kind: panel,
				snapshot,
				provider,
				onClose: () => setPanel(null)
			}));
		}
		const inject = [
			"slots",
			"connection",
			"remote"
		];
		function apply(ctx) {
			const store = new AccountStore();
			const connection = ctx.get("connection");
			const providers = new ProviderStore(connection);
			ctx.effect(() => () => store.dispose(), "cocode-account: dispose store");
			ctx.effect(() => {
				const refresh = () => {
					providers.load();
				};
				const disposers = [
					connection.hostDescription.subscribe(() => {
						providers.refreshSelection();
					}),
					ctx.remote.$on("llm/adapters-updated", refresh),
					ctx.remote.$on("settings/document-updated", refresh),
					ctx.remote.$on("credentials/updated", refresh),
					ctx.on("connection/reset", refresh)
				];
				refresh();
				return () => {
					for (const dispose of disposers) dispose();
				};
			}, "cocode-account: provider summary");
			const slots = ctx.slots;
			slots.inject("sidebar.footer.action", () => slots.register({
				name: "sidebar.footer.action",
				id: "cocode-account",
				order: -100,
				inject: () => ({
					store,
					providers
				})
			}, AccountAction));
			slots.inject("settings.onboarding", () => slots.register({
				name: "settings.onboarding",
				id: "cocode-account",
				order: -50,
				inject: () => ({ store })
			}, AccountOnboarding));
		}
		function mountStandalone(target) {
			const store = new AccountStore();
			const providers = new ProviderStore({
				api: { llm: { models: async () => ({ result: {
					ok: true,
					value: {
						groups: [],
						failures: []
					}
				} }) } },
				hostDescription: {
					getSnapshot: () => void 0,
					subscribe: () => () => {}
				}
			});
			let root;
			root = (0, react_dom_client.createRoot)(target);
			root.render((0, react.createElement)(AccountAction, {
				wide: true,
				store,
				providers
			}));
			return () => root?.unmount();
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.mountStandalone = mountStandalone;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map