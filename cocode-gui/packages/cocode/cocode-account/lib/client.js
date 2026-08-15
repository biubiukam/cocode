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
		const css = ".Jlr38G_menuRoot{border:1px solid var(--dsw-alias-border-inverted);background:var(--dsw-specific-menu);border-radius:16px;gap:2px;width:min(280px,100vw - 24px);min-width:260px;padding:8px;display:flex;overflow:hidden;box-shadow:0 18px 44px #00000057,0 2px 8px #0000002e}.Jlr38G_menuRoot [role=menuitem]{border-radius:10px;gap:10px;min-height:40px;padding:8px 10px;font-size:14px;line-height:20px}.Jlr38G_menuRoot [role=menuitem]:focus-visible{outline:2px solid var(--dsw-alias-state-focus,currentColor);outline-offset:-2px}.Jlr38G_menuRoot [role=separator]{background:var(--dsw-alias-border-l2);margin:7px 4px}.Jlr38G_menuGlyph{color:currentColor;flex:none;display:block}.Jlr38G_trigger{width:100%;min-width:0;height:48px;color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;text-align:left;transition-property:background-color,transform;transition-duration:.14s;transition-timing-function:var(--ds-ease-in-out);background:0 0;border:none;border-radius:14px;align-items:center;gap:10px;padding:6px 10px;display:flex}.Jlr38G_trigger:hover,.Jlr38G_trigger[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover)}.Jlr38G_trigger:active:not(:disabled){transform:scale(.96)}.Jlr38G_trigger:focus-visible{outline:2px solid var(--dsw-alias-state-focus,currentColor);outline-offset:1px}.Jlr38G_trigger:disabled{cursor:wait;opacity:.65}.Jlr38G_avatar{border-radius:10px;flex:none;justify-content:center;align-items:center;width:32px;height:32px;font-size:13px;font-weight:600;line-height:1;display:inline-flex}.Jlr38G_accountAvatar{background:var(--dsw-alias-accent-fill,#2f7cf6);color:var(--dsw-alias-label-on-color,white)}.Jlr38G_providerAvatar{background:var(--dsw-alias-bg-layer-2);box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}.Jlr38G_guestAvatar{box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0}.Jlr38G_copy{flex-direction:column;flex:1;gap:1px;min-width:0;display:flex}.Jlr38G_primary,.Jlr38G_secondary{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.Jlr38G_primary{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:500;line-height:20px}.Jlr38G_secondary{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:15px}.Jlr38G_chevron{color:var(--dsw-alias-label-tertiary);transition:transform .14s var(--ds-ease-in-out);flex:none}.Jlr38G_trigger[aria-expanded=true] .Jlr38G_chevron{transform:rotate(180deg)}.Jlr38G_trigger.Jlr38G_rail{border-radius:50%;width:36px;height:36px;padding:2px}.Jlr38G_rail .Jlr38G_avatar{border-radius:50%;width:32px;height:32px}.Jlr38G_panelOverlay{z-index:1200;background:#0000006b;place-items:center;padding:24px;display:grid;position:fixed;inset:0}.Jlr38G_panel{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-l1,#18181c);width:min(440px,100%);color:var(--dsw-alias-label-primary);border-radius:18px;padding:22px;box-shadow:0 24px 70px #00000057}.Jlr38G_panelHeader{justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:22px;display:flex}.Jlr38G_panelTitle{margin:0;font-size:18px;font-weight:600;line-height:24px}.Jlr38G_panelSubtitle,.Jlr38G_panelSecondary,.Jlr38G_panelHint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;display:block}.Jlr38G_panelClose{width:32px;height:32px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:0;border-radius:50%;padding:0;font-size:24px;line-height:1}.Jlr38G_panelClose:hover{background:var(--dsw-alias-interactive-bg-hover)}.Jlr38G_panelStack{flex-direction:column;gap:14px;display:flex}.Jlr38G_profileCard,.Jlr38G_planCard,.Jlr38G_usageCard{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);border-radius:14px;flex-direction:column;gap:4px;padding:16px;display:flex}.Jlr38G_profileCard{flex-direction:row;align-items:center;gap:12px}.Jlr38G_profileCopy{flex-direction:column;gap:2px;min-width:0;display:flex}.Jlr38G_panelPrimary,.Jlr38G_planName{font-size:15px;line-height:21px}.Jlr38G_factList{border-top:1px solid var(--dsw-alias-border-l2);flex-direction:column;display:flex}.Jlr38G_panelSectionTitle{color:var(--dsw-alias-label-secondary);margin-top:2px;font-size:12px;font-weight:600;line-height:18px}.Jlr38G_factRow{border-bottom:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);justify-content:space-between;align-items:center;gap:16px;padding:12px 0;font-size:13px;display:flex}.Jlr38G_factRow strong{color:var(--dsw-alias-label-primary);font-weight:500}.Jlr38G_panelEyebrow{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}.Jlr38G_usageGrid{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;display:grid}.Jlr38G_usageMetric{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);border-radius:12px;flex-direction:column;gap:9px;min-width:0;padding:13px 12px 12px;display:flex}.Jlr38G_usageMetricHeader{justify-content:space-between;align-items:baseline;gap:6px;display:flex}.Jlr38G_usageMetricLabel{min-width:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}.Jlr38G_usageMetricPercent{color:var(--dsw-alias-label-primary);flex:none;font-size:17px;line-height:22px}.Jlr38G_usageTrack{background:var(--dsw-alias-border-l2);border-radius:999px;height:5px;overflow:hidden}.Jlr38G_usageFill{border-radius:inherit;background:var(--dsw-alias-accent-fill,#2f7cf6);height:100%;transition:width .18s var(--ds-ease-in-out);display:block}@media (width<=460px){.Jlr38G_usageGrid{grid-template-columns:1fr}}.Jlr38G_panelIntro,.Jlr38G_panelHint{margin:0}.Jlr38G_panelAction{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);min-height:42px;color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;text-align:left;border-radius:10px;padding:0 13px}.Jlr38G_panelAction:hover{background:var(--dsw-alias-interactive-bg-hover)}@media (prefers-reduced-motion:reduce){.Jlr38G_trigger,.Jlr38G_chevron{transition:none}}";
		const tagId = "cocode-account/account.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "cocode-account";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var account_module_css_default = {
			"panelSectionTitle": "Jlr38G_panelSectionTitle",
			"panel": "Jlr38G_panel",
			"panelTitle": "Jlr38G_panelTitle",
			"planCard": "Jlr38G_planCard",
			"usageFill": "Jlr38G_usageFill",
			"profileCard": "Jlr38G_profileCard",
			"guestAvatar": "Jlr38G_guestAvatar",
			"panelSecondary": "Jlr38G_panelSecondary",
			"usageGrid": "Jlr38G_usageGrid",
			"avatar": "Jlr38G_avatar",
			"usageCard": "Jlr38G_usageCard",
			"copy": "Jlr38G_copy",
			"primary": "Jlr38G_primary",
			"trigger": "Jlr38G_trigger",
			"usageMetricPercent": "Jlr38G_usageMetricPercent",
			"usageMetricHeader": "Jlr38G_usageMetricHeader",
			"menuGlyph": "Jlr38G_menuGlyph",
			"panelHint": "Jlr38G_panelHint",
			"accountAvatar": "Jlr38G_accountAvatar",
			"secondary": "Jlr38G_secondary",
			"providerAvatar": "Jlr38G_providerAvatar",
			"panelPrimary": "Jlr38G_panelPrimary",
			"usageMetric": "Jlr38G_usageMetric",
			"rail": "Jlr38G_rail",
			"planName": "Jlr38G_planName",
			"factList": "Jlr38G_factList",
			"usageTrack": "Jlr38G_usageTrack",
			"menuRoot": "Jlr38G_menuRoot",
			"panelClose": "Jlr38G_panelClose",
			"panelEyebrow": "Jlr38G_panelEyebrow",
			"panelHeader": "Jlr38G_panelHeader",
			"panelSubtitle": "Jlr38G_panelSubtitle",
			"usageMetricLabel": "Jlr38G_usageMetricLabel",
			"panelOverlay": "Jlr38G_panelOverlay",
			"panelStack": "Jlr38G_panelStack",
			"factRow": "Jlr38G_factRow",
			"panelIntro": "Jlr38G_panelIntro",
			"panelAction": "Jlr38G_panelAction",
			"profileCopy": "Jlr38G_profileCopy",
			"chevron": "Jlr38G_chevron"
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
				const local = providers.filter((provider) => provider.provider !== "cocode-cloud" && provider.active);
				const preferred = this.connection.hostDescription.getSnapshot()?.provider;
				const provider = local.find((candidate) => candidate.provider === preferred) ?? local[0];
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
		function MenuGlyph({ kind }) {
			const paths = {
				account: (0, react.createElement)("path", { d: "M3 13.5c.7-1.9 2.5-3 5-3s4.3 1.1 5 3M8 8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" }),
				usage: (0, react.createElement)("path", { d: "M3 13V9.5M6.5 13V6.5M10 13V3M13.5 13V8M2 13.5h12" }),
				settings: (0, react.createElement)("path", { d: "M8 1.75v2M8 12.25v2M1.75 8h2M12.25 8h2M3.58 3.58 5 5M11 11l1.42 1.42M12.42 3.58 11 5M5 11l-1.42 1.42" }),
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
			const usageMetric = (label, value) => {
				const percentage = typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : void 0;
				return (0, react.createElement)("div", { className: account_module_css_default.usageMetric }, (0, react.createElement)("div", { className: account_module_css_default.usageMetricHeader }, (0, react.createElement)("span", { className: account_module_css_default.usageMetricLabel }, label), (0, react.createElement)("strong", { className: account_module_css_default.usageMetricPercent }, percentage === void 0 ? "—" : `${percentage}%`)), (0, react.createElement)("div", { className: account_module_css_default.usageTrack }, (0, react.createElement)("span", {
					className: account_module_css_default.usageFill,
					style: { width: `${percentage ?? 0}%` }
				})), (0, react.createElement)("span", { className: account_module_css_default.panelSecondary }, percentage === void 0 ? "暂未同步" : "已使用"));
			};
			const body = kind === "usage" ? (0, react.createElement)("div", { className: account_module_css_default.panelStack }, (0, react.createElement)("div", { className: account_module_css_default.planCard }, (0, react.createElement)("span", { className: account_module_css_default.panelEyebrow }, "当前套餐"), (0, react.createElement)("strong", { className: account_module_css_default.planName }, "尚未同步"), (0, react.createElement)("span", { className: account_module_css_default.panelSecondary }, "套餐与用量将在账号服务同步后显示")), (0, react.createElement)("div", { className: account_module_css_default.usageGrid }, usageMetric("5 小时限额", snapshotUsage(snapshot, "fiveHour")), usageMetric("周限额", snapshotUsage(snapshot, "week")), usageMetric("月限额", snapshotUsage(snapshot, "month"))), (0, react.createElement)("p", { className: account_module_css_default.panelHint }, "百分比代表当前周期已使用额度。本地 Provider 的请求不会计入 Cocode Cloud 用量。")) : (0, react.createElement)("div", { className: account_module_css_default.panelStack }, (0, react.createElement)("p", { className: account_module_css_default.panelIntro }, "遇到问题时，可以先查看模型与 Provider 配置，再提交反馈。"), (0, react.createElement)("button", {
				type: "button",
				className: account_module_css_default.panelAction,
				onClick: () => {
					onClose();
					requestSettings("models");
				}
			}, "打开模型与 Provider"), (0, react.createElement)("button", {
				type: "button",
				className: account_module_css_default.panelAction,
				onClick: () => {
					window.open("https://cocode.agency", "_blank", "noopener,noreferrer");
				}
			}, "访问 Cocode 文档"), (0, react.createElement)("button", {
				type: "button",
				className: account_module_css_default.panelAction,
				onClick: () => {
					window.open("mailto:support@cocode.agency?subject=Cocode%20反馈", "_blank");
				}
			}, "发送反馈邮件"), (0, react.createElement)("p", { className: account_module_css_default.panelHint }, provider === null ? "当前未配置 Provider。" : `当前 Provider：${provider.name}`));
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
			}, (0, react.createElement)("header", { className: account_module_css_default.panelHeader }, (0, react.createElement)("div", null, (0, react.createElement)("h2", { className: account_module_css_default.panelTitle }, title), (0, react.createElement)("span", { className: account_module_css_default.panelSubtitle }, "Cocode")), (0, react.createElement)("button", {
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
				else if (id === "usage" || id === "help") setPanel(id);
			};
			return (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
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
				className: account_module_css_default.menuRoot,
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
			}, panel === null ? null : (0, react.createElement)(AccountPanel, {
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