# Fabric.js

- **Full Name:** Fabric.js
- **URL:** https://github.com/fabricjs/fabric.js
- **Stars:** ~31,000
- **License:** MIT
- **Language:** TypeScript (v6+)

## What It Does
Interactive object model on top of HTML5 Canvas with SVG parsing (SVG-to-canvas and canvas-to-SVG). Selection, transformation, grouping, text editing, filters, serialization.

## Architecture
- **Rendering:** HTML5 Canvas 2D. Caching system renders complex objects to offscreen canvases.
- **Data Model:** OOP -- `fabric.Object` base class with subclasses: Rect, Circle, Path, Text, IText, Textbox, Image, Group.
- **No scene graph tree** -- flat ordered list with Groups for hierarchy.
- **Custom controls API** for adding handles to objects.

## Key for Our Project
- **Custom properties** on any object. Must explicitly declare for serialization:
  ```javascript
  canvas.toJSON(['myLabel', 'myMetadata']);
  ```
- **SVG round-trip:** `canvas.toSVG()` and SVG import. Excellent for importing existing scientific vector graphics.
- **Rich text:** `Textbox` supports multi-line, word wrap, per-character styling.
- **Most mature interaction model** -- battle-tested selection, transformation, snapping.

## Concern
Custom properties require explicit inclusion in serialization -- easy to forget. Contrast with Konva where custom attrs auto-serialize.
