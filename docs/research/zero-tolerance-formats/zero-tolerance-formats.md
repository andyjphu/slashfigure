# Zero-Tolerance Cross-Format Export: Pixel-Perfect Fidelity Across Canvas, SVG, and PDF

## Purpose

This document is an exhaustive reference on achieving pixel-perfect visual consistency across Canvas 2D rendering, SVG export, and PDF output. "Zero tolerance" means: what the user sees on the canvas is identical to what appears in the exported SVG, which is identical to the exported PDF. Not approximately the same -- identical.

This is the hardest problem in any drawing tool's export pipeline. Every tool that has attempted it has made significant compromises. This document catalogs those compromises, the failure modes, the library landscape, and our recommended approach.

---

## 1. How Existing Tools Handle Cross-Format Fidelity

### 1.1 Figma

Figma uses a custom C++/WASM rendering engine (now powered by WebGPU) that gives them total control over pixel output. Their approach to cross-format fidelity:

- **SVG export**: Figma converts text to outlines by default ("Outline text" option). This eliminates font rendering differences entirely but sacrifices text selectability and searchability. When text is exported as `<text>` elements, Figma warns that rendering depends on the browser's engine and may look different across platforms. ([Figma Export Docs](https://help.figma.com/hc/en-us/articles/13402894554519-Export-formats-and-settings))
- **PDF export**: Figma built a dedicated PDF exporter (April 2024 blog post). The key architectural decision: PDF descriptions are fundamentally vector (like SVG) but far more complex. Figma must decide per-element whether to keep it as vector or rasterize it. Effects that have no PDF equivalent (CSS filters, complex blend modes) get rasterized at high resolution. The exporter makes these rasterize-or-fight decisions per element to balance file size against fidelity. ([Figma Blog: PDF Export](https://www.figma.com/blog/our-path-to-creating-the-highest-quality-pdf-exporter/))
- **Color**: Figma internally works in display-p3 on capable displays. Their SVG export has a known issue where the sRGB fallback color in exported SVGs is unconverted, distorting intended colors. ([Figma Forum: SVG color profile](https://forum.figma.com/report-a-problem-6/svg-export-incorrect-color-profile-39416))
- **Pixel cap**: Exports are capped at 4096px in either dimension; larger objects are proportionally resized.

**Takeaway**: Figma achieves fidelity through total rendering control (custom engine) and aggressive text outlining. They still have color space edge cases.

### 1.2 tldraw

tldraw uses an SVG-first export architecture that is the closest model to our planned approach:

- **Shape utilities**: Each shape type implements a `toSvg()` method that returns an SVG element. This is the single source of truth for export. The `toBackgroundSvg()` method handles layered rendering (used for the highlighter tool). ([tldraw Docs: toSvg](https://tldraw.dev/examples/toSvg-method-example))
- **Font handling**: Shapes that contain text add font definitions to the SVG via `addExportDef()` on the `SvgExportContext`. Fonts are registered per-shape, not globally. ([tldraw Docs: SvgExportContext](https://tldraw.dev/reference/editor/SvgExportContext))
- **PNG from SVG**: tldraw rasterizes the SVG to produce PNG. The CLI uses Puppeteer (headless Chrome) for this, which means PNG output depends on Chrome's SVG renderer -- introducing potential browser-specific rendering.
- **No native PDF**: tldraw does not export to PDF natively. Users rely on browser print-to-PDF or third-party tools.
- **SVG defs**: Shape utilities can return elements for the `<defs>` section (patterns, masks, gradients), keeping the SVG self-contained.

**Takeaway**: tldraw's `toSvg()` pattern per shape is clean and composable. Their PNG pipeline via Puppeteer is a fidelity risk (browser-dependent rendering). No PDF support means they sidestep the hardest problem.

### 1.3 Excalidraw

Excalidraw uses a dual-rendering approach with shared element preparation:

- **Dual backends**: `exportToCanvas` renders via HTML5 Canvas + RoughJS canvas generator. `exportToSvg` renders via DOM SVG element + RoughJS SVG generator. Both backends process the same element data, but rendering is done independently. ([DeepWiki: Excalidraw Export](https://deepwiki.com/excalidraw/excalidraw/6.6-export-system))
- **Font embedding**: Excalidraw embeds fonts as `@font-face` declarations with base64-encoded font data inside `<style>` in the SVG `<defs>`. They perform client-side glyph subsetting using Harfbuzz WASM, reducing embedded font size by up to 95%. ([GitHub Issue #2192](https://github.com/excalidraw/excalidraw/issues/2192))
- **Scene data round-trip**: The full scene JSON is base64-encoded and embedded in exported SVGs and PNGs. This enables lossless re-import but does not affect visual fidelity.
- **Export flags**: When `isExporting: true`, the system disables render optimizations and CSS filters to ensure canvas output matches the intended design.
- **No native PDF**: Like tldraw, Excalidraw has no built-in PDF export.

**Takeaway**: The dual-rendering approach (Canvas and SVG from the same data) is inherently risky for fidelity because two different renderers interpret the same data. Excalidraw mitigates this with shared element preparation and export-mode flags. Font subsetting via Harfbuzz is a proven technique we should adopt.

### 1.4 draw.io (diagrams.net)

draw.io takes a fundamentally different approach from the above tools:

- **HTML in SVG**: draw.io uses HTML markup for text and embeds it in SVG via `<foreignObject>` tags. This means exported SVGs depend on an HTML rendering engine and break in SVG-only tools like Inkscape or resvg. ([GitHub Gist: SVG output](https://gist.github.com/kLiHz/61ca333fc5242829d9739b5df6548610))
- **PDF export**: Uses a server-side renderer (Puppeteer/headless Chrome) for PDF generation. This introduces browser-dependent rendering.
- **Editability over fidelity**: draw.io embeds diagram data in exported files (SVG, PDF, PNG) so users can re-open them for editing. Fidelity is secondary to editability.

**Takeaway**: draw.io's `foreignObject` approach is a cautionary example. It provides rich text layout at the cost of portability and renderer compatibility. We must avoid `foreignObject` entirely.

---

## 2. SVG-First Export Pipeline Architecture

### 2.1 The Pipeline

```
Internal Scene Graph (source of truth)
        |
        v
   Self-Contained SVG
   (fonts inlined as base64, images as data URIs, all CSS inlined)
        |
   +----+----+
   v    v    v
  PDF  SVG  PNG
```

All three export formats derive from a single SVG document. This is the only architecture that can achieve mechanical consistency. If SVG-to-PDF and SVG-to-PNG are both deterministic transformations, then all three outputs are guaranteed identical (within the capabilities of each format).

### 2.2 Scene Graph to SVG Serialization

Each element type in the scene graph implements a `toSvg()` method (following tldraw's pattern). This method returns an SVG element or group that fully represents the element's visual appearance. Rules:

1. **No external dependencies**: Every SVG must be self-contained. No external stylesheets, no linked fonts, no external images. Everything is inlined.
2. **No foreignObject**: All text must be native SVG `<text>` elements or paths. Never use `<foreignObject>` -- it introduces HTML rendering dependency.
3. **No CSS-only effects**: No `box-shadow`, `backdrop-filter`, `drop-shadow()` CSS function. Only SVG filter primitives that have known PDF equivalents.
4. **Explicit coordinates**: All positions are absolute (no CSS layout, no flexbox). SVG is a coordinate-based format.
5. **Deterministic output**: Same scene graph always produces byte-identical SVG. No timestamps, no random IDs (use deterministic ID generation).

### 2.3 Self-Containment Checklist

| Resource | Embedding Method |
|----------|-----------------|
| Fonts | Base64 WOFF2 in `@font-face` within `<style>` in `<defs>` |
| Raster images | Base64 data URI in `<image>` `href` |
| Gradients | `<linearGradient>` / `<radialGradient>` in `<defs>` |
| Patterns | `<pattern>` in `<defs>` |
| Clip paths | `<clipPath>` in `<defs>` |
| Masks | `<mask>` in `<defs>` |
| Filters | `<filter>` with SVG filter primitives in `<defs>` |

---

## 3. Font Handling

Fonts are the single largest source of cross-format inconsistency. This section covers the problem exhaustively.

### 3.1 The Core Problem

The same font rendered by different engines produces different pixel output:
- Chrome, Safari, and Firefox all use different text shaping and rasterization pipelines
- resvg uses its own text layout engine (no system dependencies)
- PDF viewers (Adobe Reader, Preview, Evince) each render text differently
- Font hinting, subpixel antialiasing, and gamma correction all vary by platform

### 3.2 Font Embedding Strategy

**Step 1: Limited font set.** In v1, restrict users to a controlled set of fonts that we bundle: Times (Nimbus Roman), STIX Two (math), Palatino, Computer Modern. Do not allow arbitrary system fonts.

**Step 2: Embed as base64 WOFF2 in SVG.** WOFF2 achieves up to 10x compression over TTF. Base64 encoding adds 33% overhead, so a 60KB WOFF2 font becomes ~80KB in the SVG. ([dzx.fr: SVG font embedding](https://dzx.fr/blog/svg-font-embedding/))

**Step 3: Subset fonts per export.** Only include glyphs actually used in the document. Excalidraw achieves 95% size reduction with Harfbuzz-based subsetting. Tools: `pyftsubset` (fonttools), Harfbuzz WASM (`hb-subset`), or the `fontkit` library. ([GitHub: Excalidraw font subsetting](https://github.com/excalidraw/excalidraw/issues/2192))

**Step 4: Register same font files with all renderers.** The exact same font binary must be used by: the Canvas 2D context (via `FontFace` API), resvg-wasm (via `font.register()`), and svg2pdf (via font loading options). Any mismatch in font binaries causes metric differences.

**Step 5: Font metrics validation.** After loading a font, measure a reference string (e.g., "Hxqp") and compare metrics across canvas, resvg, and svg2pdf. Flag any discrepancy during development.

### 3.3 Text-to-Paths (Nuclear Option)

Converting all text to SVG `<path>` elements eliminates every font rendering inconsistency. The tradeoff:
- **Pros**: Pixel-perfect across all formats and renderers. No font embedding needed.
- **Cons**: Loses text selectability, searchability, copy-paste, and accessibility. Increases file size for text-heavy documents.

**Recommendation**: Offer text-to-paths as an advanced export option ("Outline all text"). Use it for final publication figures where fidelity is paramount. Keep embedded text as the default for working documents.

### 3.4 Web Fonts vs System Fonts

| Aspect | Bundled/Web Fonts | System Fonts |
|--------|-------------------|--------------|
| Cross-platform consistency | Guaranteed (same binary) | No guarantee (version differences) |
| Embedding in SVG | Easy (we have the file) | Legally ambiguous, technically hard |
| Metric matching | Exact (same metrics table) | Varies by platform/version |
| User expectation | "Why can't I use Arial?" | Natural for design tools |

**Decision**: Bundle fonts. Do not rely on system fonts. If users request system font support in v2, require them to upload the font file so we control the binary.

---

## 4. Color Management

### 4.1 Color Spaces in Our Pipeline

| Format | Default Color Space | Wide Gamut Support |
|--------|--------------------|--------------------|
| Canvas 2D | sRGB (can use display-p3 via `colorSpace` option) | Yes (Chrome 104+, Safari 16+) |
| SVG | sRGB (CSS Color 4 adds `color()` for display-p3) | Partial (browser-dependent) |
| PDF | Device-dependent (can embed ICC profiles) | Yes (via ICC profiles) |
| PNG | sRGB (can embed ICC profile via `iCCP` chunk) | Yes (via embedded profile) |

### 4.2 The Strategy: sRGB Everywhere

For v1, standardize on sRGB across the entire pipeline:
1. Store all colors in sRGB internally (hex, `rgb()`, or `hsl()`)
2. Export SVG with explicit sRGB values
3. Configure resvg-wasm for sRGB output
4. Configure svg2pdf to embed the sRGB ICC profile

**Why not display-p3?** display-p3 is 25% larger gamut than sRGB, but:
- SVG support for `color(display-p3 ...)` is inconsistent across browsers ([Evil Martians: P3 in SVG](https://evilmartians.com/chronicles/how-to-use-p3-colors-in-svg))
- Color clamping algorithms differ between browsers when converting P3 to sRGB fallback
- PDF requires explicit ICC profile embedding for P3
- resvg does not support display-p3
- Scientific figures rarely need wide gamut

**v2 consideration**: If wide gamut is needed later, add display-p3 support with mandatory sRGB fallback values on every color. The SVG `color()` function with `display-p3` requires a fallback, e.g., `color(display-p3 1 0 0 / 1)` with `style="color: red"` fallback.

### 4.3 Failure Mode: Color Space Mismatch

If the Canvas 2D context is initialized with `colorSpace: 'display-p3'` (for high-end displays) but SVG export uses sRGB values, colors will shift. The canvas shows the P3 interpretation while the SVG shows the sRGB interpretation. **Prevention**: Always initialize Canvas 2D with `colorSpace: 'srgb'`, even on P3-capable displays.

---

## 5. Line Rendering

### 5.1 Stroke Alignment

SVG only supports center-aligned strokes by default. A 2px stroke on a rectangle extends 1px inside and 1px outside the shape boundary. Canvas 2D behaves identically. However, design tools often offer inside/outside stroke alignment.

**SVG workaround for inside/outside strokes:**
- **Inside stroke**: Double the stroke width and clip to the shape's fill area using `<clipPath>`. ([alexwlchan: inner/outer strokes](https://alexwlchan.net/2021/inner-outer-strokes-svg/))
- **Outside stroke**: Double the stroke width and use a mask that excludes the fill area.
- **SVG 2 draft**: The `stroke-alignment` property (`inside`, `outside`, `center`) exists in the SVG Strokes draft spec but has zero browser support and is not implemented in resvg or svg2pdf. ([W3C SVG Strokes](https://www.w3.org/TR/svg-strokes/))

**Recommendation**: Implement inside/outside strokes using the clip-path workaround. This is portable across all renderers.

### 5.2 Anti-Aliasing Differences

Anti-aliasing behavior is the most visible per-renderer difference:
- **Canvas 2D**: Uses subpixel anti-aliasing by default. Cannot be disabled in most browsers. Lines at fractional coordinates get anti-aliased across pixel boundaries.
- **resvg**: Uses its own anti-aliasing algorithm. Consistent across platforms (no system dependency) but different from any browser.
- **PDF viewers**: Each viewer applies its own anti-aliasing.

**Mitigation strategies:**
1. Snap coordinates to whole pixels (or half-pixels for 1px strokes). A 1px stroke at `y=100` should be drawn at `y=100.5` so it occupies exactly one pixel row. ([MDN: Optimizing Canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas))
2. Use `shape-rendering="crispEdges"` in SVG for elements where crispness matters more than smoothness. ([MDN: shape-rendering](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/shape-rendering))
3. Accept that anti-aliasing differences at single-pixel boundaries are unavoidable. Our "zero tolerance" applies to geometry and layout, not to individual anti-aliased pixel values.

### 5.3 Hairline Rules

A "hairline" is the thinnest possible line (1 device pixel regardless of zoom). SVG has no native hairline concept. A `stroke-width="0.5"` looks different at different zoom levels and DPIs.

**Recommendation**: Do not support hairline rules. All strokes have explicit widths in user-space units. If users need thin lines for print, recommend 0.25pt (0.33px), which is the thinnest reliably printable line at 300 DPI.

---

## 6. Text Rendering

### 6.1 Kerning and Ligatures

SVG 1.1 provided `kerning`, `letter-spacing`, and `word-spacing` properties. SVG 2 removes `kerning` (replaced by `font-kerning`). The `text-rendering` CSS property hints the engine on whether to optimize for speed, legibility, or geometric precision. ([MDN: text-rendering](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/text-rendering))

**Cross-renderer behavior:**
- Browsers: Apply kerning and ligatures by default. `text-rendering: geometricPrecision` disables some optimizations.
- resvg: Applies kerning from font tables. Ligature support depends on the text shaping engine (HarfBuzz in recent versions).
- PDF: Kerning is applied via glyph positioning arrays in the text stream. Ligatures depend on the PDF generator.

**Recommendation**: Set `text-rendering="geometricPrecision"` on all text in exported SVGs. This requests the most predictable rendering across engines. Explicitly set `font-kerning="normal"` and avoid relying on ligatures for correctness (ligatures should be visual enhancements only).

### 6.2 Line Height and Text Layout

SVG has no concept of multi-line text layout (no `line-height`, no automatic wrapping). Each line must be a separate `<tspan>` with explicit `x` and `dy` attributes.

**Our approach**: The scene graph stores text with explicit line breaks and computes line positions using the font's metrics (ascent, descent, line gap). The `toSvg()` method emits one `<tspan>` per line with absolute positioning. This ensures consistent layout regardless of renderer.

### 6.3 Rich Text in SVG

SVG `<text>` supports inline styling via `<tspan>` (bold, italic, font-size changes) but does not support:
- Inline images
- Tables
- Lists
- Block-level layout

For rich text elements, we must decompose the content into positioned SVG primitives at serialization time. The scene graph owns the layout; SVG merely renders the result.

### 6.4 Text Overflow and Clipping

When text exceeds its bounding box, the scene graph must handle clipping before SVG serialization. Use `<clipPath>` on the text element's container group. Do not rely on CSS `overflow: hidden` (SVG does not support it on arbitrary elements).

---

## 7. Image Handling

### 7.1 Raster Images in Vector Export

When a user inserts a raster image (PNG, JPEG) into the canvas, it must be embedded in the exported SVG as a base64 data URI:

```svg
<image href="data:image/png;base64,iVBOR..." width="400" height="300" />
```

### 7.2 Resolution and DPI for Print

Scientific figures are destined for print (conference papers, journals). DPI requirements:

| Use Case | Minimum DPI | Recommended DPI |
|----------|-------------|-----------------|
| Screen/web | 72-96 | 144 (2x retina) |
| Conference poster | 150 | 300 |
| Journal figure | 300 | 600 |
| Line art (no photos) | 600 | 1200 |

**How DPI affects our pipeline:**
- Vector elements (shapes, text, lines) are resolution-independent in SVG and PDF. DPI is irrelevant for them.
- Raster images embedded in the SVG have fixed pixel dimensions. A 600x400px image at 300 DPI prints at 2x1.33 inches.
- When exporting to PNG, the user specifies a scale factor (1x, 2x, 3x). A 1000x800 canvas at 2x produces a 2000x1600 PNG.
- resvg-wasm accepts a `fitTo` parameter to control output resolution.

**Recommendation**: Display a DPI indicator in the properties panel for raster images. Warn when an image's effective DPI at its current size is below 150 for the expected output medium.

### 7.3 Image Compression in PDF

typst/svg2pdf handles image embedding with format-specific optimizations:
- **JPEG**: Embedded directly with DCT compression (no re-encoding needed, preserving quality)
- **PNG/GIF/WebP**: Re-encoded with deflate compression; alpha channels become separate soft masks
- **SVG images**: Recursively converted to PDF Form XObjects

---

## 8. Library Deep Dive

### 8.1 @resvg/resvg-wasm (SVG to PNG)

**What it is**: A Rust SVG rendering library compiled to WebAssembly. Renders SVG to raster pixels without any browser or system dependencies.

**Capabilities:**
- Full SVG 1.1 static subset support (no animations, no scripting)
- Platform-independent output: x86 Windows and ARM macOS produce byte-identical PNGs from the same SVG ([GitHub: resvg](https://github.com/linebender/resvg))
- SVG filter primitives (blur, color matrix, etc.)
- Clip paths, masks, patterns, gradients
- Text rendering with HarfBuzz text shaping (when fonts are registered)

**Unsupported features:**
- `foreignObject` (HTML content in SVG)
- SVG fonts (`<font>`, `<glyph>` elements) -- use WOFF2/OTF instead
- `color-profile`, `color-interpolation` attributes
- `font-size-adjust`, `font-stretch` attributes
- SVG 2.0 features (not planned)
- `use` elements referencing external SVG files
- ([GitHub: resvg unsupported.md](https://github.com/linebender/resvg/blob/main/docs/unsupported.md))

**Critical limitation -- fonts**: resvg does not use system fonts. You MUST register font files explicitly via `font.register()`. If you forget to register a font, text renders as empty space -- no fallback, no error in some configurations. This is the most common issue reported by users. ([AnswerOverflow: resvg text rendering](https://www.answeroverflow.com/m/1305607729343234150))

**Integration pattern:**
```typescript
import { Resvg, initWasm } from '@resvg/resvg-wasm';

await initWasm(wasmBinary);

const resvg = new Resvg(svgString, {
  fitTo: { mode: 'width', value: 2000 },
  font: { loadSystemFonts: false },
});

// Register the EXACT same font files used in the SVG
resvg.resolveFont(fontBuffer);

const png = resvg.render().asPng();
```

### 8.2 typst/svg2pdf (SVG to PDF)

**What it is**: A Rust library (with WASM bindings) that converts SVG to PDF, built by the Typst team. Used internally by Typst for SVG image handling.

**Capabilities:**
- Paths, groups, clip paths, masks with full transform support
- Text embedding as proper PDF text (selectable, searchable) with font subsetting
- Image handling: JPEG pass-through, PNG/WebP with alpha mask separation
- SVG filter effects rasterized at configurable scale (`raster_scale` option)
- PDF/A-2b compliance mode
- Two output modes: standalone PDF (`to_pdf()`) or embeddable PDF chunk (`to_chunk()`)
- ICC color profile embedding (sRGB, Gray)
- ([DeepWiki: typst/svg2pdf](https://deepwiki.com/typst/svg2pdf))

**Configuration:**

| Option | Default | Notes |
|--------|---------|-------|
| `compress` | `true` | Deflate compression on content streams |
| `raster_scale` | `1.5` | Scale factor for rasterized filter effects |
| `embed_text` | `true` | `false` converts text to paths |
| `pdfa` | `false` | PDF/A-2b compliance (stricter validation) |
| `dpi` | `72.0` | Page density for standalone PDFs |

**Known limitations and issues:**
- **Font fallback**: If the exact font specified in `font-family` is not available, text may not render. The `--font-path` and `--ignore-system-fonts` CLI flags help control font resolution. ([GitHub Issue #65: font fallback](https://github.com/typst/svg2pdf/issues/65))
- **Font selection bugs**: Some font family names resolve to the wrong variant (e.g., Ubuntu resolving to Ubuntu Condensed). ([GitHub Issue #5782: wrong font](https://github.com/typst/typst/issues/5782))
- **Percentage units**: `width`/`height` defined with `%` are not handled correctly. ([GitHub Issue #23](https://github.com/typst/svg2pdf/issues/23))
- **Filter rasterization**: SVG filters have no PDF equivalent, so they are rasterized. The `raster_scale` option controls quality (higher = larger file).
- **Nesting depth limit**: Deeply nested SVGs can trigger `TooMuchNesting` errors.

### 8.3 svg2pdf.js (yWorks) -- Alternative

**What it is**: A JavaScript-only SVG-to-PDF converter built on jsPDF. Simpler to integrate but less capable.

**Unsupported features (as of issue #82):**
- `foreignObject`
- `mask` and `filter` elements
- `textPath`, `textLength`, text stroking
- `glyph` elements
- Animations
- Most units other than `px`
- Different opacities on gradient stops
- `use` with non-local references
- Gradients/patterns on strokes
- ([GitHub Issue #82: known issues](https://github.com/yWorks/svg2pdf.js/issues/82))

**Comparison with typst/svg2pdf:**

| Feature | typst/svg2pdf | svg2pdf.js |
|---------|---------------|------------|
| Filters | Rasterized (good fallback) | Not supported |
| Masks | Supported | Not supported |
| Font subsetting | Built-in | Manual (add fonts to jsPDF) |
| Text embedding | Native PDF text | Basic text support |
| PDF/A | Supported | Not supported |
| Language | Rust/WASM | JavaScript |
| File size (WASM) | ~2-4MB | ~200KB (JS) |

**Recommendation**: Use typst/svg2pdf. The broader SVG feature support, font subsetting, and PDF/A compliance justify the WASM payload.

---

## 9. Testing Strategies

### 9.1 The Golden-File Pipeline

The core test: render a reference scene to all three formats, rasterize SVG and PDF to PNG at a fixed resolution, then pixel-diff the three PNGs.

```
Reference Scene
      |
      v
   toSvg()
      |
   +--+--+
   v     v
  PNG   PDF
  (resvg) (svg2pdf -> rasterize)
      |     |
      v     v
   pixelmatch(png_from_svg, png_from_pdf)
   pixelmatch(png_from_svg, canvas_screenshot)
```

### 9.2 Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **pixelmatch** | Pixel-level image comparison | ~150 lines, no dependencies, threshold 0-1 (0.1 default). Detects anti-aliasing vs true differences. ([GitHub: pixelmatch](https://github.com/mapbox/pixelmatch)) |
| **pdf-visual-diff** | PDF-specific visual regression | Rasterizes PDF pages and compares them. ([GitHub: pdf-visual-diff](https://github.com/moshensky/pdf-visual-diff)) |
| **Playwright** | Cross-browser screenshot comparison | Built-in `toMatchSnapshot()` for visual regression. Test canvas rendering in Chrome, Firefox, Safari. ([Playwright Docs](https://playwright.dev/)) |
| **Visual Regression Tracker** | Self-hosted baseline management | Tracks baseline images, reviews diffs in CI. ([GitHub: VRT](https://github.com/Visual-Regression-Tracker/Visual-Regression-Tracker)) |

### 9.3 CI Integration

```yaml
# Pseudocode for CI export validation
- render test_scene to Canvas (Playwright screenshot)
- render test_scene to SVG (toSvg())
- render SVG to PNG (resvg-wasm)
- render SVG to PDF (svg2pdf)
- rasterize PDF to PNG (pdf.js or poppler)
- pixelmatch(canvas_png, svg_png, threshold=0)
- pixelmatch(svg_png, pdf_png, threshold=0)
- FAIL if any diff > 0 pixels
```

**Threshold policy**: Start with threshold=0 (zero tolerance). If anti-aliasing differences at element boundaries produce false positives, increase to threshold=0.01 (1% sensitivity) and document every exception.

### 9.4 Test Scenes

Maintain a library of test scenes that cover known failure modes:

1. **Font metrics**: Text with descenders (g, p, q, y), ascenders (b, d, f, h), mixed sizes
2. **Stroke alignment**: 1px strokes at integer and half-integer coordinates
3. **Gradients**: Linear, radial, with varying stop opacities
4. **Clip paths**: Nested clip paths, clip paths on text
5. **Transforms**: Rotation, scale, skew, nested transforms
6. **Images**: JPEG, PNG with alpha, small images scaled up
7. **Colors**: Full sRGB gamut, near-black, near-white, transparency
8. **Text**: Kerning pairs (AV, To, WA), multi-line, different sizes
9. **Patterns**: Repeating patterns, patterns with transforms
10. **Filters**: Gaussian blur, drop shadow (rasterization boundary)

### 9.5 Cross-Browser Validation

Canvas rendering differs across browsers. Test with Playwright in:
- Chrome (Blink engine)
- Firefox (Gecko engine)
- Safari/WebKit

The canvas screenshot should match the resvg PNG within threshold. If Chrome and Safari produce different canvas renders, we have a problem -- it means the canvas display does not match the export.

**Mitigation**: If canvas rendering diverges across browsers, consider using resvg-wasm for the canvas preview too (rendering to an offscreen canvas). This ensures what the user sees IS the export output.

---

## 10. Failure Modes and Edge Cases

### 10.1 Font-Related Failures

| Failure | Cause | Prevention |
|---------|-------|------------|
| Text disappears in PNG export | Font not registered with resvg | Always register all fonts before rendering |
| Text shifts 1-3px between canvas and export | Different text shaping engines | Use same font binary everywhere; validate metrics |
| Wrong font variant in PDF | svg2pdf resolves font-family to wrong variant | Use explicit font file paths, not family names |
| Ligature differences | Different OpenType feature support | Set `font-variant-ligatures: none` in SVG if exact match needed |

### 10.2 Geometry Failures

| Failure | Cause | Prevention |
|---------|-------|------------|
| Blurry 1px lines | Coordinates at integer boundaries | Offset 1px strokes by 0.5px |
| Stroke width differs | Inside/outside stroke not translated to clip-path | Always use clip-path workaround |
| Shape slightly larger in PDF | Stroke contributes to bounding box differently | Use `vector-effect="non-scaling-stroke"` carefully |

### 10.3 Color Failures

| Failure | Cause | Prevention |
|---------|-------|------------|
| Colors appear washed out in PDF | Missing ICC profile in PDF | Embed sRGB ICC profile via svg2pdf |
| Colors shift on P3 displays | Canvas using P3, SVG using sRGB | Force Canvas to sRGB mode |
| Gradient banding in PNG | Low bit depth | Export PNG as 8-bit RGBA (32-bit) |

### 10.4 Layout Failures

| Failure | Cause | Prevention |
|---------|-------|------------|
| Elements shift in PDF | Percentage units not handled by svg2pdf | Use absolute units (px) only |
| Clip path wrong in PDF | Complex clip path transforms | Test every clip path pattern |
| Pattern misaligned | Pattern coordinate system differs | Use `patternUnits="userSpaceOnUse"` |

### 10.5 The foreignObject Trap

Any SVG element using `<foreignObject>` will:
- Render correctly in browsers (Chrome, Firefox, Safari)
- Be COMPLETELY IGNORED by resvg (PNG export fails silently)
- Be COMPLETELY IGNORED by svg2pdf.js (PDF export fails silently)
- Be COMPLETELY IGNORED by typst/svg2pdf (PDF export fails silently)

This is the most dangerous failure mode because it works during development (browser preview) and fails silently in production (export). **Never use foreignObject.**

---

## 11. LaTeX/PDF Integration

### 11.1 How LaTeX Includes Figures

LaTeX includes PDF figures via:
```latex
\includegraphics[width=\columnwidth]{figure.pdf}
```

The `graphicx` package reads the PDF's bounding box to determine dimensions. It uses the CropBox if present, otherwise MediaBox.

### 11.2 PDF Box Types

PDF defines multiple page boundary boxes:

| Box | Purpose | Relevance |
|-----|---------|-----------|
| **MediaBox** | Physical page boundary | Always present. Our exported PDF's MediaBox = figure dimensions. |
| **CropBox** | Display/print clip region | Optional. LaTeX uses this preferentially for sizing. |
| **TrimBox** | Intended final page size | Used in professional printing for trim marks. |
| **BleedBox** | Region including bleed area | For figures that extend to paper edge. |
| **ArtBox** | Extent of meaningful content | Rarely used. |

([LaTeX reference: includegraphics](https://latexref.xyz/_005cincludegraphics.html))

### 11.3 Our PDF Output Requirements

For scientific figures embedded in LaTeX:
1. **MediaBox must exactly match figure dimensions.** No extra whitespace, no margins. The figure should be the entire page.
2. **CropBox = MediaBox.** Some LaTeX drivers read CropBox preferentially; if it differs from MediaBox, the figure appears wrong.
3. **No page numbers, headers, or other PDF page furniture.** The PDF is a figure, not a document.
4. **Fonts must be embedded.** LaTeX/PDF workflows require all fonts to be embedded for archival submission (e.g., arXiv, IEEE, ACM).
5. **PDF version compatibility.** Target PDF 1.7 or PDF 2.0. Avoid features that require specific viewer versions.

### 11.4 The trim/clip Problem

LaTeX's `\includegraphics[trim=...]` does not actually remove content -- it hides it. The full PDF content is still in the file. This matters because:
- Large embedded images increase compilation time
- Some workflows (arXiv) have file size limits

**Our mitigation**: Export tight-cropped PDFs. The MediaBox exactly matches the figure content with no excess whitespace. Users should not need `trim`.

### 11.5 Crop Marks and Bleed

For publication-quality figures, some journals request crop marks or bleed areas:
- **Crop marks**: Lines at the corners indicating where to trim. We can add these as SVG elements before PDF conversion.
- **Bleed**: Extending background color/images 3mm beyond the trim edge. Implement by expanding the SVG canvas and setting TrimBox to the intended size while MediaBox includes the bleed.

**Recommendation**: Crop marks and bleed are advanced features. Defer to v2. In v1, export tight-cropped PDFs with MediaBox = CropBox = figure dimensions.

---

## 12. Recommendations for Our Stack

### 12.1 Architecture Summary

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Scene to SVG | Custom `toSvg()` per element type | tldraw pattern; deterministic; we control every byte |
| SVG to PNG | @resvg/resvg-wasm | Platform-independent; no browser dependency; WASM payload acceptable |
| SVG to PDF | typst/svg2pdf (Rust/WASM) | Best SVG feature coverage; font subsetting; PDF/A support |
| Font subsetting | Harfbuzz WASM (hb-subset) | Proven in Excalidraw; 95% size reduction |
| Visual testing | pixelmatch + Playwright | Pixel-level comparison + cross-browser screenshots |
| Color space | sRGB only (v1) | Universal support; no conversion issues |

### 12.2 Implementation Priority

**Phase 1 (MVP):**
1. Implement `toSvg()` on all element types with self-contained output
2. Integrate resvg-wasm for PNG export with font registration
3. Integrate typst/svg2pdf for PDF export with font loading
4. Set up CI golden-file tests for all three formats
5. Validate font metric consistency across canvas, resvg, and svg2pdf

**Phase 2:**
1. Add font subsetting (Harfbuzz WASM)
2. Add text-to-paths export option
3. Add DPI indicator for raster images
4. Expand test scene library to cover edge cases
5. Cross-browser canvas validation (Chrome, Firefox, Safari)

**Phase 3:**
1. display-p3 color support with sRGB fallback
2. Crop marks and bleed for print workflows
3. PDF/A compliance mode for archival submissions
4. System font support (user-uploaded font files)

### 12.3 Non-Negotiable Rules

1. **No foreignObject. Ever.** It breaks resvg and svg2pdf silently.
2. **No CSS-only effects.** Every visual effect must have an SVG primitive representation.
3. **No system font dependency.** All fonts are bundled and explicitly registered.
4. **Same font binary everywhere.** Canvas, resvg, and svg2pdf must use identical font files.
5. **CI blocks on visual diff.** Any pixel difference between formats fails the build.
6. **New primitives require export tests.** Before merging any new element type, it must pass the three-format golden-file test.
7. **Absolute coordinates only.** No percentage units, no CSS layout, no relative positioning in exported SVG.
8. **sRGB everywhere (v1).** No display-p3, no device-dependent colors.

### 12.4 Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| resvg text rendering differs from canvas | HIGH | HIGH | Register identical fonts; validate metrics; text-to-paths fallback |
| svg2pdf font resolution bugs | MEDIUM | HIGH | Use explicit font file paths; pin svg2pdf version; report upstream |
| Anti-aliasing false positives in CI | HIGH | LOW | Use pixelmatch with anti-aliasing detection; set threshold=0.01 |
| WASM payload size (resvg + svg2pdf + Harfbuzz) | MEDIUM | MEDIUM | Lazy-load WASM on first export; ~10MB total acceptable for desktop-class app |
| SVG filter rasterization quality in PDF | MEDIUM | MEDIUM | Set raster_scale=3.0 for print; test blur/shadow rendering |
| New SVG features unsupported by resvg/svg2pdf | LOW | HIGH | Only ship primitives that pass all three export tests |

---

## Sources

- [Figma: Export formats and settings](https://help.figma.com/hc/en-us/articles/13402894554519-Export-formats-and-settings)
- [Figma Blog: Our Path to Creating the Highest Quality PDF Exporter](https://www.figma.com/blog/our-path-to-creating-the-highest-quality-pdf-exporter/)
- [Figma Blog: Figma Rendering Powered by WebGPU](https://www.figma.com/blog/figma-rendering-powered-by-webgpu/)
- [Figma Forum: SVG export incorrect color profile](https://forum.figma.com/report-a-problem-6/svg-export-incorrect-color-profile-39416)
- [tldraw Docs: Custom shape SVG export (toSvg)](https://tldraw.dev/examples/toSvg-method-example)
- [tldraw Docs: SvgExportContext](https://tldraw.dev/reference/editor/SvgExportContext)
- [tldraw Docs: ShapeUtil](https://tldraw.dev/reference/editor/ShapeUtil)
- [DeepWiki: Excalidraw Export System](https://deepwiki.com/excalidraw/excalidraw/6.6-export-system)
- [GitHub: Excalidraw font embedding (Issue #2192)](https://github.com/excalidraw/excalidraw/issues/2192)
- [GitHub: Excalidraw font embedding option (Issue #2496)](https://github.com/excalidraw/excalidraw/issues/2496)
- [DeepWiki: Excalidraw Font System](https://deepwiki.com/zsviczian/excalidraw/6.5-font-system-and-text-rendering)
- [GitHub Gist: About SVG output of diagrams.net](https://gist.github.com/kLiHz/61ca333fc5242829d9739b5df6548610)
- [draw.io: Export to SVG](https://www.drawio.com/doc/faq/export-to-svg)
- [GitHub: draw.io foreignObject issue (#3350)](https://github.com/jgraph/drawio/issues/3350)
- [GitHub: linebender/resvg](https://github.com/linebender/resvg)
- [GitHub: resvg unsupported features](https://github.com/linebender/resvg/blob/main/docs/unsupported.md)
- [AnswerOverflow: resvg-wasm text rendering issue](https://www.answeroverflow.com/m/1305607729343234150)
- [DeepWiki: typst/svg2pdf](https://deepwiki.com/typst/svg2pdf)
- [GitHub: typst/svg2pdf](https://github.com/typst/svg2pdf)
- [GitHub: svg2pdf font fallback (Issue #65)](https://github.com/typst/svg2pdf/issues/65)
- [GitHub: typst wrong font in PDF (Issue #5782)](https://github.com/typst/typst/issues/5782)
- [GitHub: svg2pdf percentage units (Issue #23)](https://github.com/typst/svg2pdf/issues/23)
- [GitHub: svg2pdf text embedding (Issue #21)](https://github.com/typst/svg2pdf/issues/21)
- [GitHub: yWorks/svg2pdf.js](https://github.com/yWorks/svg2pdf.js/)
- [GitHub: svg2pdf.js unsupported features (Issue #82)](https://github.com/yWorks/svg2pdf.js/issues/82)
- [GitHub: svg2pdf.js text position issues (Issue #159)](https://github.com/yWorks/svg2pdf.js/issues/159)
- [Evil Martians: How to use P3 colors in SVG](https://evilmartians.com/chronicles/how-to-use-p3-colors-in-svg)
- [W3C: SVG Color Module](https://svgwg.org/specs/color/)
- [W3C: SVG Text (SVG 2)](https://www.w3.org/TR/SVG/text.html)
- [W3C: SVG Strokes](https://www.w3.org/TR/svg-strokes/)
- [MDN: text-rendering](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/text-rendering)
- [MDN: shape-rendering](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/shape-rendering)
- [MDN: Optimizing Canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas)
- [alexwlchan: Inner/outer strokes in SVG](https://alexwlchan.net/2021/inner-outer-strokes-svg/)
- [dzx.fr: SVG font embedding and subsetting](https://dzx.fr/blog/svg-font-embedding/)
- [dee.underscore.world: Embedding fonts in SVGs](https://dee.underscore.world/blog/embedding-fonts-in-svgs/)
- [LaTeX reference: includegraphics](https://latexref.xyz/_005cincludegraphics.html)
- [LaTeX.org: Trim box and bleed box](https://latex.org/forum/viewtopic.php?t=6213)
- [LaTeX.org: includegraphics trim bug](https://latex.org/forum/viewtopic.php?t=34941)
- [GitHub: pixelmatch](https://github.com/mapbox/pixelmatch)
- [GitHub: pdf-visual-diff](https://github.com/moshensky/pdf-visual-diff)
- [GitHub: Visual Regression Tracker](https://github.com/Visual-Regression-Tracker/Visual-Regression-Tracker)
- [Playwright: Visual Testing](https://playwright.dev/)
- [Cypress: Visual Testing](https://docs.cypress.io/app/tooling/visual-testing)
- [GitHub: Mermaid foreignObject issue (#2688)](https://github.com/mermaid-js/mermaid/issues/2688)
- [SVG Edit: Stroke alignment (Issue #183)](https://github.com/SVG-Edit/svgedit/issues/183)
- [Inkscape: Color management](https://wiki.inkscape.org/wiki/index.php/Color_management)
