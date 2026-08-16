# Local dev shortcuts — run from the cocode repository root.

DSH_DIR ?= cocode-host-supervisor

.PHONY: help dev gui gui-web tui tui-preflight dsh install-gui install-tui install-dsh

.DEFAULT_GOAL := help

help:
	@echo "GUI (Electron):  make dev gui      → desktop client + Vite on :5273"
	@echo "GUI (browser):   make dev gui-web  → http://localhost:5273"
	@echo "GUI cache:       make dev gui reuses the OS cache directory"
	@echo "                 DSH_FORCE_RESTAGE=1 make dev gui  → refresh runtime cache"
	@echo "                 DSH_DISABLE_RUNTIME_CACHE=1 make dev gui  → isolated runtime"
	@echo "TUI:             make dev tui       → terminal client (requires TTY)"
	@echo "TUI checks:      make tui-preflight → install deps and refresh Host runtime when needed"
	@echo "DSH:             make dev dsh        → @deepseek-ai/dsh web"
	@echo "Install GUI:     make install-gui"
	@echo "Install TUI:     make install-tui"
	@echo "Install DSH:     make install-dsh    → install @deepseek-ai/dsh dependencies"

# Anchor target so `make dev gui` runs the gui dev server.
dev:
	@:

gui:
	cd cocode-gui && pnpm run dev

gui-web:
	cd cocode-gui && pnpm run dev:web

tui:
	@$(MAKE) --no-print-directory tui-preflight
	cd cocode-tui && pnpm run dev

tui-preflight:
	@node cocode-tui/scripts/dev-preflight.mjs

dsh:
	cd $(DSH_DIR) && pnpm exec dsh web

install-gui:
	cd cocode-gui && pnpm install

install-tui:
	cd cocode-tui && pnpm install

install-dsh:
	cd $(DSH_DIR) && pnpm install
