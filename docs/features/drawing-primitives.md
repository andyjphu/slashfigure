# Drawing Primitives

## MVP
- **Rectangle** -- the foundational shape. Resizable, rotatable, styled (fill, stroke, opacity, corner radius).
- **Arrows / Connectors** -- connect elements with straight or curved arrows. Bind to named anchor points on shapes (5 per edge: corner, quarter, middle, three-quarter, corner = 16 unique points per rectangle). Arrows follow when shapes move. Arrow heads configurable (none, arrow, diamond, circle).
- **Freehand drawing** -- pressure-sensitive strokes via perfect-freehand algorithm. For annotation and markup.
- **Text labels** -- on-canvas text editing. Font, size, color, alignment. Can be standalone or attached to shapes.
- **LaTeX equations** -- typed as LaTeX source, rendered via MathJax `tex2svg()` (native SVG output). Source stored as metadata. Editable by double-clicking. Invalid LaTeX shows raw source text on canvas (no error styling, no last-valid-render caching).
- **Tables** -- grid of cells with editable content. Live LaTeX preview of table source as user modifies. Export as LaTeX `tabular` environment.
- **Images** -- import PNG, JPEG. Placed on canvas as elements. Resizable. No LaTeX export for images (use `\includegraphics`).
- **SVG import** -- preserves vector paths by default (editable). User gets a popup on import asking: "Import as editable vectors (default)" or "Import as flattened image." Complex SVGs may not render perfectly as vectors.
- **PDF import** -- imported as rasterized image only (PDF is semantically flat, not editable vectors). User picks which page of multi-page PDFs. Default rasterization: 300 DPI.

## Post-MVP (plan architecture for these now)
- Ellipse, circle, triangle, polygon, star
- Line (not arrow, just a line segment)
- Curved paths (Bezier)
- Groups (select multiple elements, treat as one)
- Frames / panels (container regions for multi-panel figures)
- Chart elements (embedded Plotly/Vega-Lite)
- Matplotlib SVG import (with GID convention for structured parsing)

## Element Architecture
Every element shares a common interface:

```
Element {
  id: string
  type: ElementType
  position: { x: number, y: number }
  dimensions: { width: number, height: number }
  rotation: number
  style: StyleProperties
  metadata: ElementMetadata    // scientific annotations
  zIndex: number
  locked: boolean
  visible: boolean

  toSvg(): SVGElement          // for SVG + PNG export pipeline
  toPdf(doc: PDFDocument): void // for direct PDF export via pdfkit
  toMetadata(): TextDescription // for LLM consumption
  getBounds(): BoundingBox     // for spatial index (includes stroke width)
}
```

Each element type extends this with type-specific properties (e.g., Table has `cells[][]`, Arrow has `startBinding` and `endBinding`).

## Toolbox Popup
When an element is selected, a contextual popup appears with:
- Common: move, resize, rotate, duplicate, delete, style
- Type-specific:
  - Table: edit cells, "Copy as LaTeX" button, live LaTeX preview
  - Equation: edit LaTeX source, re-render
  - Text: font, size, alignment
  - Arrow: head style, curve type, binding targets
  - Image: crop, scale, replace

## Resolved Decisions
- **Rounded corners:** Yes from day 1. Editable `rx`/`ry` property in the properties panel. Trivial in SVG, exports identically to PDF.
- **Snap-to-grid:** Both. Freeform by default, toggleable snap-to-grid. Grid spacing configurable.
- **Alignment guides:** Yes for MVP. Center/edge snapping when dragging near other elements.
- **`data-*` custom attributes:** Yes. Low cost, high flexibility. Survives SVG export.
