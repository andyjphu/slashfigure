# Excalidraw

- **Full Name:** Excalidraw
- **URL:** https://github.com/excalidraw/excalidraw
- **Stars:** ~120,200
- **License:** MIT
- **Language:** TypeScript

## What It Does
Virtual whiteboard for sketching hand-drawn-like diagrams. Uses Rough.js for sketchy aesthetic. Available as standalone app and embeddable React component (`@excalidraw/excalidraw`).

## Architecture
- **Rendering:** Canvas-based (HTML5 Canvas 2D) with SVG export.
- **Data Model:** Flat array of `ExcalidrawElement` objects. 13+ element types. No scene graph tree -- layering by array order.
- **Dual-canvas pattern:** Static canvas for elements (rerenders on `sceneNonce` change) + interactive canvas for selection/cursors on animation loop.
- **No formal plugin system.** Extension via React component props.

## Key for Our Project
- **`customData` field on every element** -- `Record<string, any>` for arbitrary metadata. Perfect for scientific annotations.
- **PNG/SVG embedding:** Scene data can be embedded in exported PNG (via iTXt metadata) and SVG (via base64 in `<metadata>`). Enables round-trip editing from exported images. Unique and valuable for scientific workflows.
- **JSON format (`.excalidraw`):** UTF-8 JSON with `elements[]`, `appState`, `files{}`. Well-documented schema.
- **MIT license** -- best option for open-source use.
- **~500 tokens** for a simple diagram JSON. More verbose than Mermaid (~50) but much richer.

## Key Insight
The round-trip PNG embedding (embed scene data in exported PNG, open PNG to restore full editing state) is a pattern worth adopting. Scientists share PNGs -- if the PNG carries its own editable source, that's a killer feature.
