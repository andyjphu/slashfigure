# Konva.js

- **Full Name:** Konva.js
- **URL:** https://github.com/konvajs/konva
- **Stars:** ~14,300
- **License:** MIT
- **Language:** TypeScript

## What It Does
HTML5 Canvas framework with scene graph architecture. Layers, groups, shapes, events, drag-and-drop, serialization. Official React bindings (`react-konva`).

## Architecture
- **Rendering:** HTML5 Canvas 2D with **multi-layer system** -- each `Konva.Layer` gets its own `<canvas>`. Static layers don't re-render when dynamic layers update.
- **Data Model:** Hierarchical scene graph: `Stage > Layer > Group > Shape`.
- **Dual Canvas:** Each layer has scene canvas (visible) + hit graph canvas (hidden, unique colors per shape for pixel-perfect hit detection).

## Key for Our Project
- **Custom attributes auto-serialize:** `node.setAttr('key', value)` -- plain object attributes are included in `toJSON()` automatically. No extra work needed.
- **Multi-layer architecture** naturally separates static figure content from interactive overlays. Best performance/simplicity ratio.
- **Hierarchical scene graph** maps naturally to figure structure: `Stage > Figure > Panel > Elements`.
- **react-konva** for React integration.

## Key Insight
The multi-layer approach (one canvas per layer) is ideal for scientific figures: put the static chart on one layer, annotations on another, selection UI on a third. Only the active layer re-renders.
