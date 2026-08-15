# Local dev shortcuts — run from the cocode repository root.

HARNESS_DIR ?= $(firstword $(wildcard ../cocode-harness cocode-harness))

.PHONY: help dev gui gui-web tui dsh install-gui install-tui ensure-harness

.DEFAULT_GOAL := help

help:
	@echo "GUI (Electron):  make dev gui      → desktop client + Vite on :5273"
	@echo "GUI (browser):   make dev gui-web  → http://localhost:5273"
	@echo "TUI:             make dev tui       → terminal client (requires TTY)"
	@echo "Harness:         make dev dsh        → http://127.0.0.1:3080"
	@echo "Install GUI:     make install-gui"
	@echo "Install TUI:     make install-tui"
	@echo "Harness setup:   make ensure-harness → install + build cocode-harness if needed"

# Anchor target so `make dev gui` runs the gui dev server.
dev:
	@:

ensure-harness:
	cd cocode-gui && node scripts/ensure-harness.mjs

gui:
	cd cocode-gui && pnpm run dev

gui-web:
	cd cocode-gui && pnpm run dev:web

tui:
	@test -d cocode-tui/node_modules/react || $(MAKE) install-tui
	cd cocode-tui && pnpm run dev

dsh:
	cd $(HARNESS_DIR) && pnpm dsh web

install-gui:
	cd cocode-gui && pnpm install

install-tui:
	cd cocode-tui && pnpm install
