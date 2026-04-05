# Export Architecture

## Decision: Dual Export Pipeline, PDF-Primary Output

### Core Constraint
**What the user sees on the canvas = what they see in SVG = what they see in PDF. Zero tolerance for differences. Not even a slight margin difference.**

PDF is the first-class export format because LaTeX uses `\includegraphics` with PDF files, not SVG. Scientists embed PDF figures in papers.

### The Problem
Pixel-perfect consistency across formats is hard. Common failure modes:
- Font rendering differences across browsers/platforms
- Text baseline interpretation varies (Chrome vs Safari: 1-3px)
- Anti-aliasing behavior differs per format
- Color space assumptions (sRGB vs device)
- Stroke alignment (half-pixel misalignment)

### Architecture: Dual Export from Scene Graph

```
Internal Scene Graph (source of truth)
        │
   ┌────┴────────────┐
   ▼                 ▼
Self-Contained SVG   PDF (direct)
(fonts base64,       (pdfkit/jsPDF)
 images data URIs,    scene graph → PDF primitives
 CSS inlined)         no SVG translation layer
   │
   ├──▶ SVG export (as-is)
   └──▶ PNG export (resvg-wasm)
```

**Why dual export instead of SVG-first for everything:**
- PDF is our primary export format. Routing through SVG→PDF (svg2pdf) introduces a translation layer with known limitations (no `textPath`, `textLength`, gradient on text, `%` units).
- Direct scene graph → PDF gives us full control over PDF output. No dependency on svg2pdf's SVG feature coverage.
- Figma and tldraw use this same approach -- they never convert SVG to PDF.
- Each element type implements both `toSvg()` and `toPdf()` methods.
- Fidelity is validated by rendering all three formats to pixels and diffing.

**Consistency guarantee:** Canvas rendering, SVG export, and PDF export all read from the same scene graph. Visual regression tests rasterize all three and pixel-diff to ensure zero divergence.

### Design Constraint on Primitives
We will only add drawing primitives to the app if we can guarantee they export identically across all formats. If a visual effect cannot be reproduced exactly in PDF, we do not ship it. This means:
- No CSS-only effects (box-shadow, backdrop-filter) -- these don't exist in PDF
- No browser-dependent rendering (system font fallbacks, subpixel rendering)
- Every element must have a well-defined SVG representation that converts losslessly to PDF
- Test every new primitive against all three exports before merging

### Libraries

| Step | Library | Why |
|---|---|---|
| SVG → PNG | **@resvg/resvg-wasm** | Rust SVG renderer in WASM. Pixel-identical output across all platforms (x86 Windows = ARM macOS). No browser rendering inconsistencies. |
| Scene → PDF | **pdfkit** | Direct scene graph → PDF primitives via Canvas-like API (`moveTo`, `lineTo`, `bezierCurveTo`, `fill`, `stroke`). Built-in font subsetting via fontkit. Browser requires `blob-stream` + fonts as ArrayBuffer. |
| Scene → SVG | Custom serializer | Each element type implements a `toSvg()` method (tldraw pattern). |

### How Major Tools Do It

| Tool | Approach |
|---|---|
| **Figma** | Custom C++/WASM renderer. Total control. "Outline text" option for SVG. |
| **Excalidraw** | Dual rendering (Canvas + SVG) with shared element prep. Fonts base64-embedded. No native PDF. |
| **tldraw** | SVG-first. Each shape has `toSvg()`. PNG from rasterizing SVG. CLI uses Puppeteer. |

### Font Consistency (Critical)

Fonts are the #1 source of cross-format inconsistency.

**Rules:**
1. Embed fonts as base64 `@font-face` in exported SVG
2. Register the same font files with resvg-wasm for PNG
3. Register the same font files with pdfkit/jsPDF for PDF
4. Use a curated font set covering all major conference requirements. Users can add custom fonts with a warning that fidelity may degrade.
5. Subset fonts per export using **Harfbuzz WASM** (`hb-subset`). Only include glyphs used in the document. Lazy-loaded at export time (~1.5MB WASM binary, not loaded at startup).

**Nuclear option:** Convert text to paths. Eliminates ALL font problems. Loses text selectability and searchability. Use for final publication export only.

### LaTeX Export

LaTeX export is NOT the same as visual export. It applies only to elements that were:
1. Created as LaTeX in the first place (equations, LaTeX boxes)
2. Designed for LaTeX export from the outset (tables)

Regular drawings/shapes/images do NOT get LaTeX export. They get `\includegraphics{figure.pdf}`.

### TikZ

TikZ is a LaTeX drawing package (1300-page manual). It produces figures natively inside LaTeX documents with perfect font consistency.

**Should we export to TikZ?** Selectively:

| Figure Type | TikZ Export Feasibility |
|---|---|
| Node-edge graphs, flowcharts | HIGH -- maps cleanly |
| Simple annotated diagrams | MEDIUM |
| Data plots | MEDIUM -- target pgfplots, not raw TikZ |
| Complex freeform/gradient figures | LOW -- TikZ can't do this well |

**Pipeline:** Internal representation → SVG → svg2tikz (existing tool, pip-installable, actively maintained). Or direct semantic export for structured diagrams.

**Recommendation:** Not in MVP. Add as opt-in export for structured diagrams in v2. svg2tikz handles the conversion but produces coordinate-dump code for anything beyond simple shapes.

### Resolved Decisions
- **Export pipeline:** Dual export. Scene graph → SVG (for SVG + resvg PNG). Scene graph → PDF directly (pdfkit). No SVG→PDF translation layer.
- **SVG→PNG:** resvg-wasm only. No foreignObject, no HTML in SVG. Pure SVG elements only. This is the same constraint Figma and Excalidraw work under.
- **Color space:** sRGB only. Canvas created with `{ colorSpace: 'srgb' }`. No display-P3. Scientific publishing is entirely sRGB.
- **Fonts:** Curated set covering all major conferences (Times/Nimbus Roman for NeurIPS/ICLR/ICML, Palatino for COLM, STIX Two for math, Computer Modern as option). Users can add custom fonts; a note appears in the font picker UI when a custom font is selected explaining that export fidelity may differ from curated fonts.
- **Font subsetting:** Harfbuzz WASM (`hb-subset`). Lazy-loaded at export time. Proven by Excalidraw for this exact use case.
- **Text-to-paths:** Available as advanced export option ("Outline all text") for final publication. Default keeps embedded text. Deferred to post-MVP.
- **Raster images:** Export at whatever resolution the user provides. Show effective DPI in properties panel when image is selected. No warnings, no blocks.
- **PDF box types:** Tight-cropped by default. MediaBox = TrimBox = CropBox = tightest bounding box of all elements including stroke width (a 10px stroke extends 5px past geometric edge). Advanced export option to add uniform padding (in pt). No bleed, no crop marks.
- **CI export validation:** Day one. Start with 5 golden-file test scenes (empty, single rect, text, image, mixed). Render all 3 formats to PNG, pixel-diff. Fail CI if diff > threshold. Expand test suite as features land.
- **Text editing:** DOM overlay (contenteditable div positioned over canvas element). Browser handles cursor, selection, IME, copy/paste. On commit, parse into scene graph text model. Same approach as Excalidraw and tldraw.
- **Text rendering in SVG:** Pure `<tspan>` elements for rich text (bold, italic, mixed fonts). No foreignObject ever. resvg-wasm and direct PDF export both handle `<tspan>` correctly.
- **No foreignObject:** Banned from the SVG pipeline. It breaks resvg-wasm, breaks PDF export, and renders inconsistently across browsers. This is the lesson from draw.io.
