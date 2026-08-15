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
		const css = ".Jlr38G_menuRoot{width:100%;display:flex}.Jlr38G_trigger{width:100%;min-width:0;height:48px;color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;text-align:left;transition-property:background-color,transform;transition-duration:.14s;transition-timing-function:var(--ds-ease-in-out);background:0 0;border:none;border-radius:14px;align-items:center;gap:10px;padding:6px 10px;display:flex}.Jlr38G_trigger:hover,.Jlr38G_trigger[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover)}.Jlr38G_trigger:active:not(:disabled){transform:scale(.96)}.Jlr38G_trigger:focus-visible{outline:2px solid var(--dsw-alias-state-focus,currentColor);outline-offset:1px}.Jlr38G_trigger:disabled{cursor:wait;opacity:.65}.Jlr38G_avatar{border-radius:10px;flex:none;justify-content:center;align-items:center;width:32px;height:32px;font-size:13px;font-weight:600;line-height:1;display:inline-flex}.Jlr38G_accountAvatar{background:var(--dsw-alias-accent-fill,#2f7cf6);color:var(--dsw-alias-label-on-color,white)}.Jlr38G_providerAvatar{background:var(--dsw-alias-bg-layer-2);box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}.Jlr38G_guestAvatar{box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0}.Jlr38G_copy{flex-direction:column;flex:1;gap:1px;min-width:0;display:flex}.Jlr38G_primary,.Jlr38G_secondary{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.Jlr38G_primary{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:500;line-height:20px}.Jlr38G_secondary{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:15px}.Jlr38G_chevron{color:var(--dsw-alias-label-tertiary);transition:transform .14s var(--ds-ease-in-out);flex:none}.Jlr38G_trigger[aria-expanded=true] .Jlr38G_chevron{transform:rotate(180deg)}.Jlr38G_trigger.Jlr38G_rail{border-radius:50%;width:36px;height:36px;padding:2px}.Jlr38G_rail .Jlr38G_avatar{border-radius:50%;width:32px;height:32px}@media (prefers-reduced-motion:reduce){.Jlr38G_trigger,.Jlr38G_chevron{transition:none}}";
		const tagId = "cocode-account/account.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "cocode-account";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var account_module_css_default = {
			"guestAvatar": "Jlr38G_guestAvatar",
			"trigger": "Jlr38G_trigger",
			"avatar": "Jlr38G_avatar",
			"chevron": "Jlr38G_chevron",
			"accountAvatar": "Jlr38G_accountAvatar",
			"rail": "Jlr38G_rail",
			"copy": "Jlr38G_copy",
			"menuRoot": "Jlr38G_menuRoot",
			"secondary": "Jlr38G_secondary",
			"primary": "Jlr38G_primary",
			"providerAvatar": "Jlr38G_providerAvatar"
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
				customProvider: "自定义 Provider",
				noProvider: "登录或配置 Provider",
				models: "模型与 Provider",
				settings: "设置",
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
				customProvider: "Custom provider",
				noProvider: "Sign in or configure a provider",
				models: "Models & providers",
				settings: "Settings",
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
		function AccountAction({ wide, store, providers }) {
			const snapshot = (0, react.useSyncExternalStore)(store.subscribe, store.getSnapshot, store.getSnapshot);
			const provider = (0, react.useSyncExternalStore)(providers.subscribe, providers.getSnapshot, providers.getSnapshot);
			const [open, setOpen] = (0, react.useState)(false);
			const signedIn = snapshot.phase === "signed-in" || snapshot.phase === "provisioning";
			const t = copy();
			const busy = snapshot.phase === "signing-in" || snapshot.phase === "provisioning";
			const primary = signedIn ? snapshot.profile?.displayName ?? "Cocode" : provider?.name ?? labelOf(snapshot, true);
			const secondary = signedIn ? t.account : provider === null ? t.noProvider : t.customProvider;
			const title = accountError(snapshot) ?? primary;
			const entries = signedIn ? [
				{
					type: "label",
					id: "identity",
					text: primary
				},
				...snapshot.profile?.email === void 0 ? [] : [{
					type: "label",
					id: "email",
					text: snapshot.profile.email
				}],
				{
					type: "separator",
					id: "identity-separator"
				},
				{
					id: "settings",
					label: t.settings,
					icon: (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconSettingsOutline16, { size: 16 })
				},
				{
					id: "sign-out",
					label: t.signOut,
					danger: true,
					icon: (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconUserOutline16, { size: 16 })
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
					icon: (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconDataOutline16, { size: 16 })
				},
				{
					type: "separator",
					id: "settings-separator"
				},
				{
					id: "settings",
					label: t.settings,
					icon: (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconSettingsOutline16, { size: 16 })
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
					icon: (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconDataOutline16, { size: 16 })
				},
				{
					id: "sign-in",
					label: t.signIn,
					icon: (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconUserOutline16, { size: 16 })
				},
				{
					id: "settings",
					label: t.settings,
					icon: (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconSettingsOutline16, { size: 16 })
				}
			];
			const select = (id) => {
				setOpen(false);
				if (id === "sign-in") store.activate();
				else if (id === "sign-out") store.deactivate();
				else if (id === "models") requestSettings("models");
				else if (id === "settings") requestSettings();
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
				}, (0, react.createElement)("span", { className: `${account_module_css_default.avatar} ${signedIn ? account_module_css_default.accountAvatar : provider === null ? account_module_css_default.guestAvatar : account_module_css_default.providerAvatar}` }, signedIn ? initialOf(primary) : provider === null ? (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconUserOutline16, { size: 18 }) : (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconApiOutline14, { size: 18 })), wide && (0, react.createElement)("span", { className: account_module_css_default.copy }, (0, react.createElement)("span", { className: account_module_css_default.primary }, primary), (0, react.createElement)("span", { className: account_module_css_default.secondary }, secondary)), wide && (0, react.createElement)(_deepseek_ai_dsh_client_ui_primitives.IconChevronUpOutline14, {
					className: account_module_css_default.chevron,
					size: 14
				}))
			});
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