# Cocode icon source

`cocode-mark.png` is the only hand-maintained macOS icon source.

- It is a 1024×1024 RGBA PNG.
- It contains only the white Cocode mark on a transparent canvas.
- It does not contain the black background, rounded mask, shadow, highlight, or Dock padding.

Run `pnpm generate:mac-icons` from `cocode-gui/` to generate the Icon Composer package, the full macOS iconset, `resources/icons/cocode.icns`, and the development Dock PNG. `resources/icons/cocode.png` is retained as a generated compatibility alias; do not edit it manually.
