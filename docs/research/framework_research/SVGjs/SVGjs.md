# SVG.js

- **Full Name:** SVG.js -- The lightweight library for manipulating and animating SVG
- **URL:** https://github.com/svgdotjs/svg.js
- **Stars:** ~11,750
- **License:** MIT
- **Language:** JavaScript

## What It Does
Lightweight SVG manipulation and animation with fluent API. Plugin ecosystem. Active maintenance (v3.2).

## Key for Our Project
**Critical differentiator:** `.data('key', value)` persists to `data-*` attributes in the SVG DOM. When you serialize via `.svg()`, all metadata survives round-tripping. This means figure elements can carry `data-latex`, `data-annotation-id`, `data-element-type` and these survive save/load.

```javascript
draw.rect(100, 50).move(10, 10).fill('#f06')
  .data('latex', 'E=mc^2')
  .data('annotation-id', 'eq-1')
  .data('element-type', 'equation');

// Serialize entire canvas
const svgString = draw.svg();
// Parse back
SVG(svgString); // metadata preserved via data-* attributes
```

## Key APIs
- `.bbox()` / `.rbox()` -- bounding boxes that integrate with spatial indexing (feed into RBush)
- `.toParent(other)` -- reparent without visual change (transforms recomputed)
- `.ungroup()` -- dissolve group, applying transforms to children
- `.transform({translate, rotate, scale})` -- transforms
- `.svg()` / `SVG(svgString)` -- serialize/parse

## Key Insight
SVG.js makes SVG itself the scene graph AND the serialization format AND the metadata carrier. No separate JSON document model needed. The SVG IS the document.
