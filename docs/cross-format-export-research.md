# Pixel-Perfect Consistent Export Across PNG, SVG, and PDF

## Research findings for web-based canvas drawing applications

---

## 1. WHY EXPORTS DIFFER ACROSS FORMATS

### The fundamental mismatch

PNG, SVG, and PDF are fundamentally different representations:

- **PNG**: Raster bitmap. Each pixel has a fixed color value. Resolution-dependent.
- **SVG**: XML-based vector markup. Rendered by each viewer's own engine (browser, Inkscape, etc.). Output varies by implementation.
- **PDF**: Page description language with its own coordinate system (origin at bottom-left, not top-left). Embeds fonts, supports both vector and raster content.

### Specific sources of inconsistency

| Problem | Details |
|---------|---------|
| **Font rendering** | Canvas uses the browser's text rasterizer (platform-dependent hinting). SVG text depends on the viewer's engine. PDF embeds font subsets but viewers render differently. Different browsers (Blink, Gecko, WebKit) apply different font hinting -- text at identical font-size can appear 1-2px taller in Firefox vs Chrome. |
| **Text baseline** | Canvas `fillText` draws from the baseline. SVG uses `dominant-baseline` which varies per browser (Chrome measures from cap height, Safari from x-height -- 2-3px vertical shift). PDF has its own ascent/descent model from font tables. |
| **Anti-aliasing** | Canvas anti-aliasing is browser-controlled and cannot be disabled. SVG has `shape-rendering: crispEdges` but browser support varies. PDF viewers each apply their own anti-aliasing. |
| **Half-pixel problem** | Both Canvas and SVG map integer coordinates to pixel boundaries, not centers. A 1px stroke at integer coordinates renders across two pixels (blurry). Fix: offset odd-width strokes by 0.5px. Even-width strokes (0, 2, 4) are naturally sharp. |
| **Stroke alignment** | SVG only supports center-aligned strokes. Figma works around this by converting inside/outside strokes during SVG export. Canvas strokes are always centered. |
| **Color space** | Canvas operates in sRGB by default. PNG can embed sRGB/ICC profiles. SVG inherits the display color space. PDF supports multiple color spaces (sRGB, CMYK). If not explicitly managed, colors can shift between formats. |
| **Coordinate rounding** | Floating-point coordinates round differently across renderers. Canvas rounds to device pixels. SVG preserves exact values but viewers round during rasterization. PDF uses its own coordinate precision. |
| **Image resampling** | When scaling, each format/viewer uses different resampling algorithms (nearest-neighbor, bilinear, bicubic). Figma defaults to bicubic ("Detailed") for quality. |

---

## 2. HOW THE MAJOR TOOLS SOLVE THIS

### Figma -- Custom C++/WASM Renderer

**Architecture**: Hybrid C++/JavaScript. The document model and rendering are in C++ compiled to WASM via Emscripten. UI is TypeScript/React. Uses WebGL/WebGPU for screen rendering.

**Key insight**: Figma does NOT use Skia as a general renderer. They use "only some specific graphics algorithms in Skia" and have their own custom GPU rendering engine. This gives them total control over rendering consistency.

**Export strategy**:
- PNG: Rendered by their C++ engine with bicubic resampling
- SVG: Text can be exported as outlines (guarantees visual match) or as text elements (relies on viewer's font engine -- may look different)
- PDF: Embeds fonts, text, vectors, and images in fixed layout

**Consistency trick**: For SVG, Figma offers "outline text" mode which converts all text to paths, guaranteeing the SVG looks identical to the screen at the cost of text selectability/searchability.

URL: https://madebyevan.com/figma/ | https://www.figma.com/blog/figma-rendering-powered-by-webgpu/

### Excalidraw -- Dual-Path with Shared Preparation

**Architecture**: Internal element model rendered through two parallel paths:
1. `exportToCanvas` -> `renderStaticScene` with RoughJS canvas generator -> `canvas.toBlob()` for PNG
2. `exportToSvg` -> `renderSceneToSvg` with RoughJS SVG generator -> SVG DOM element

**Consistency mechanisms**:
- Both paths share identical element filtering (`prepareElementsForRender`)
- Both use same bounding box calculation (`getCanvasSize` / `getExportSize`)
- Both use same frame rendering config (`getFrameRenderingConfig`)
- Canvas export sets `isExporting: true` to disable render optimizations
- SVG embeds fonts as base64 `@font-face` declarations via `Fonts.generateFontFaceDeclarations()`
- Canvas export pre-loads fonts via `Fonts.loadElementsFonts()`

**Limitation**: Canvas export disables frame clipping to avoid corner artifacts, while SVG preserves precise clipping. This means there CAN be subtle differences.

**No native PDF export** -- requires third-party conversion.

URL: https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/utils/export

### tldraw -- SVG-First with Browser Rasterization

**Architecture**: Each shape type implements a `toSvg()` method that returns a React element as SVG. PNG export rasterizes the SVG.

**Export pipeline**:
1. SVG: Collect all shapes' `toSvg()` output into an SVG document
2. PNG: Render the SVG to a canvas, export as bitmap (browser-based rasterization)
3. CLI export: Uses Puppeteer headless browser to load tldraw and trigger export

**Key limitation**: "Due to the architecture of tldraw, export depends on functionality provided by a web browser." This means headless browser is required for server-side export.

URL: https://tldraw.dev/reference/editor/SvgExportContext

### Sketch -- Skia + WASM Scene Graph

**Architecture**: C++ scene graph compiled to WASM via Emscripten, rendered using Skia. "The Canvas experience is powered by the same scene graph built for the Mac app." Zoom-independent, renders live without pre-rendered assets.

**Key insight**: Single scene graph, single renderer (Skia), multiple output targets. This is the gold standard for consistency.

URL: https://www.sketch.com/blog/canvas-tech/

---

## 3. THE THREE ARCHITECTURAL APPROACHES (EVALUATED)

### Approach A: Canvas-First (Render to Canvas, derive other formats)

```
Scene Model -> Canvas 2D API -> PNG (canvas.toBlob)
                             -> SVG (via canvas2svg mock context)
                             -> PDF (via canvas2pdf mock context)
```

**How it works**: Write drawing code once against the Canvas 2D context API. Use mock context implementations (canvas2svg, canvas2pdf) that intercept the same draw calls and produce SVG/PDF output.

**Libraries**:
- canvas2svg (https://github.com/gliffy/canvas2svg) -- Mock 2D context that builds SVG scene graph. Supports fillRect, arc, paths, text, gradients. Known gaps: `setTransform`, `arcTo` incomplete.
- canvas2pdf (https://github.com/joshua-gould/canvas2pdf) -- Mock 2D context that generates PDF via PDFKit. Produces actual vector PDF drawing calls (not rasterized). Known gaps: `fill` then `stroke` only executes fill; `arcTo` not implemented.

**Pros**:
- Single drawing function for all formats
- Vector quality preserved in SVG and PDF
- Conceptually simple

**Cons**:
- Mock contexts never achieve 100% Canvas API coverage
- Text rendering differs (Canvas measures text differently than SVG/PDF)
- No gradient/filter parity guarantees
- canvas2svg and canvas2pdf are not actively maintained and have API gaps
- You are limited to Canvas 2D primitives -- no higher-level abstractions

**Verdict**: Workable for simple drawings. Falls apart with complex text, gradients, filters, or advanced compositing.

### Approach B: Scene Graph with Independent Renderers

```
Scene Model -> Canvas Renderer -> PNG
           -> SVG Renderer    -> SVG
           -> PDF Renderer    -> PDF
```

**How it works**: Maintain an internal representation (scene graph) of all shapes, text, images. Implement separate renderers for each output format, each translating the scene graph into format-appropriate operations.

**Libraries/frameworks that use this**:
- Two.js (https://two.js.org/) -- Renderer-agnostic scene graph. Same API renders to SVG, Canvas, WebGL. Does not directly support PDF.
- Vega Scenegraph (https://github.com/vega/vega-scenegraph) -- Mark-based scene graph with Canvas and SVG renderers, plus static SVG string export.
- Kendo Drawing (Telerik) -- Object model renders to SVG, PDF, Canvas, and PNG.
- Excalidraw -- Internal element model with separate Canvas and SVG rendering paths.

**Pros**:
- Full control over each renderer
- Can optimize per-format (e.g., embed fonts in SVG, subset fonts in PDF)
- Scene graph can include metadata not representable in any single format
- Most flexible architecture

**Cons**:
- MOST WORK: You must implement and maintain N renderers
- Consistency is your responsibility -- subtle bugs between renderers are inevitable
- Text positioning is the hardest to keep consistent across renderers

**Verdict**: The correct choice for a serious drawing application. This is what Excalidraw, Sketch, Figma, and Kendo use. Requires rigorous visual regression testing.

### Approach C: SVG-First (Build SVG, convert to PNG and PDF) [RECOMMENDED]

```
Scene Model -> SVG generation -> SVG (direct output)
                              -> PNG (rasterize SVG via resvg-wasm or browser)
                              -> PDF (convert SVG via svg2pdf.js or typst/svg2pdf)
```

**How it works**: Generate a single, self-contained SVG as the canonical representation. Derive PNG by rasterizing the SVG. Derive PDF by converting SVG vector operations to PDF operations.

**Why this is the best default approach**:

1. **Single source of truth**: One SVG output. PNG and PDF are mechanical derivatives.
2. **SVG is the richest web vector format**: Text, paths, gradients, filters, clip paths, masks, transforms -- all expressible.
3. **Font consistency**: Embed fonts as base64 `@font-face` in the SVG. The same font data flows to PNG (rasterizer uses it) and PDF (converter embeds it).
4. **Pixel-perfect PNG**: Use resvg-wasm to rasterize -- it guarantees identical output on every platform ("each pixel would have the same value" on x86 Windows vs ARM macOS).
5. **High-fidelity PDF**: svg2pdf.js or typst/svg2pdf convert SVG vectors to PDF vectors without rasterization (except for filter effects).
6. **Proven by tldraw**: tldraw uses exactly this architecture.

**Conversion tools (SVG -> PNG)**:
- **resvg-wasm / @resvg/resvg-wasm** (RECOMMENDED): Rust-based SVG renderer compiled to WASM. 1600+ regression tests. Platform-independent pixel-perfect output. Supports custom fonts. ~34KB. https://github.com/linebender/resvg | https://www.npmjs.com/package/@resvg/resvg-wasm
- **svg2png-wasm**: Built on resvg. Now deprecated in favor of @resvg/resvg-js. https://github.com/ssssota/svg2png-wasm
- **Browser rasterization**: Draw SVG to canvas via `<img>` or `canvg`, export canvas as PNG. Less consistent across browsers/platforms. canvg (https://github.com/canvg/canvg) has known anti-aliasing and text rendering differences.

**Conversion tools (SVG -> PDF)**:
- **svg2pdf.js** (Browser JS): Runs in browser, built on jsPDF. Translates SVG elements to jsPDF drawing operations. Supports SVG 1.1 mostly, some 2.0. Custom fonts must be pre-registered with jsPDF. https://github.com/yWorks/svg2pdf.js (832 stars)
- **typst/svg2pdf** (Rust/WASM): Higher fidelity. Uses usvg for parsing (same as resvg). Converts SVG to PDF vectors without rasterization. Supports font subsetting, image embedding, clip paths. Can produce PDF/A-2b. https://github.com/typst/svg2pdf (391 stars)

**Verdict**: Best balance of consistency, simplicity, and quality. One rendering path to debug. SVG is human-readable and debuggable. Strongly recommended unless you need Approach B's flexibility.

---

## 4. DETAILED LIBRARY RECOMMENDATIONS

### For PNG Export

| Library | Type | Best For | URL |
|---------|------|----------|-----|
| **@resvg/resvg-wasm** | WASM (Rust) | Pixel-perfect SVG->PNG in browser. Platform-independent. | https://www.npmjs.com/package/@resvg/resvg-wasm |
| **@resvg/resvg-js** | Node native (Rust+napi) | Server-side SVG->PNG. Fastest option. | https://github.com/thx/resvg-js |
| `canvas.toBlob()` | Browser native | Direct canvas export. Browser-dependent rendering. | MDN Web Docs |
| modern-screenshot | JS | DOM-to-image. Better than html2canvas for CSS support. | npm: modern-screenshot |

### For SVG Export

| Library | Type | Best For | URL |
|---------|------|----------|-----|
| **Custom SVG generation** | Manual | Full control. Build SVG DOM or string from scene graph. | -- |
| canvas2svg | JS | Translating Canvas 2D calls to SVG. Gaps in API coverage. | https://github.com/gliffy/canvas2svg |
| Fabric.js `toSVG()` | JS | If already using Fabric.js. Has canvas-to-SVG parser. | http://fabricjs.com/ |

### For PDF Export

| Library | Type | Best For | URL |
|---------|------|----------|-----|
| **svg2pdf.js + jsPDF** | Browser JS | SVG-to-PDF in browser. Good for simple/medium SVGs. | https://github.com/yWorks/svg2pdf.js |
| **typst/svg2pdf** | Rust/WASM | Highest fidelity SVG-to-PDF. Font subsetting. PDF/A. | https://github.com/typst/svg2pdf |
| pdf-lib | JS | Programmatic PDF creation/editing. No SVG conversion. | https://github.com/Hopding/pdf-lib |
| jsPDF | JS | Direct PDF drawing. Manual coordinate positioning. | https://github.com/parallax/jsPDF |
| canvas2pdf | JS | Canvas 2D API mock -> PDF vectors via PDFKit. Incomplete API. | https://github.com/joshua-gould/canvas2pdf |
| Puppeteer/Playwright | Headless browser | Page.pdf() for browser-rendered content. High fidelity but heavy. | https://pptr.dev/guides/pdf-generation |

### For a Unified Rendering Engine (Single Renderer)

| Library | Type | Best For | URL |
|---------|------|----------|-----|
| **skia-canvas** | Node.js (Skia native) | Server-side Canvas 2D API with PNG/SVG/PDF/JPEG/WEBP output. Same Skia engine for all formats. Multi-page PDF support. | https://github.com/samizdatco/skia-canvas |
| canvaskit-wasm | WASM (Skia) | Browser Skia. WebGL rendering. PNG output works. **PDF bindings not yet exposed in WASM build.** SVG output not available. | https://www.npmjs.com/package/canvaskit-wasm |
| Two.js | JS | Renderer-agnostic scene graph (SVG, Canvas, WebGL). No PDF. | https://two.js.org/ |

---

## 5. FONT CONSISTENCY ACROSS FORMATS

### The problem

Fonts are the #1 source of cross-format inconsistency. Each format handles fonts differently:

- **Canvas**: Uses whatever fonts are loaded in the browser. Platform-dependent hinting.
- **SVG**: References fonts by name. If the font is not available to the viewer, fallback occurs.
- **PDF**: Can embed font subsets. Viewers render embedded fonts, but hinting still varies.

### The solution: embed everywhere

1. **Load web fonts explicitly** before any rendering. Use `document.fonts.load()` or the CSS Font Loading API.

2. **For SVG**: Embed fonts as base64 data URIs inside `@font-face` rules within the SVG's `<style>` element. This is what Excalidraw does. The SVG becomes self-contained.

   ```xml
   <svg>
     <defs>
       <style>
         @font-face {
           font-family: 'MyFont';
           src: url(data:font/woff2;base64,...) format('woff2');
         }
       </style>
     </defs>
     <text font-family="MyFont">Hello</text>
   </svg>
   ```

3. **For PNG via resvg**: Register the same font files with the resvg WASM instance before rendering. resvg uses its own font engine (rustybuzz, a HarfBuzz port) -- it does NOT use browser fonts, which is WHY it produces consistent output.

4. **For PDF via svg2pdf.js**: Register fonts with jsPDF BEFORE calling svg2pdf. jsPDF needs the raw font data for embedding.

5. **For PDF via typst/svg2pdf**: Pass a fontdb (font database) when configuring usvg. The converter will subset and embed fonts automatically.

6. **Nuclear option -- convert text to paths**: Eliminates all font inconsistency by converting text to vector outlines before export. Figma offers this for SVG. Downside: text is no longer selectable or searchable.

---

## 6. RECOMMENDED ARCHITECTURE

### For a new web-based drawing app seeking consistent export:

```
                    +------------------+
                    |   Scene Graph    |  (internal element model)
                    | shapes, text,    |
                    | images, groups   |
                    +--------+---------+
                             |
                    +--------v---------+
                    |  SVG Generator   |  (canonical output)
                    | - inline fonts   |
                    | - inline styles  |
                    | - embed images   |
                    +--------+---------+
                             |
              +--------------+--------------+
              |              |              |
     +--------v---+  +------v------+  +----v--------+
     |  SVG File  |  | resvg-wasm  |  | svg2pdf.js  |
     |  (direct)  |  |  SVG->PNG   |  | OR typst/   |
     |            |  |             |  | svg2pdf     |
     +------------+  +------+------+  | SVG->PDF    |
                            |         +----+--------+
                     +------v------+       |
                     |  PNG File   |  +----v--------+
                     +-------------+  |  PDF File   |
                                      +-------------+
```

### Step-by-step implementation:

1. **Build your scene graph**: Model shapes, text, images as plain objects/classes. This is your single source of truth.

2. **Write an SVG serializer**: Convert your scene graph to a self-contained SVG string. Inline all fonts as base64 `@font-face`. Inline all images as base64 data URIs. Inline all CSS. The SVG must render correctly with zero external dependencies.

3. **SVG export**: Output the SVG string directly. Done.

4. **PNG export**: Feed the SVG string to `@resvg/resvg-wasm`. Configure with the same fonts. Get back a Uint8Array of PNG bytes. This is deterministic and platform-independent.

5. **PDF export**: Feed the SVG to `svg2pdf.js` (simpler, browser-only) or `typst/svg2pdf` via WASM (higher fidelity, font subsetting, PDF/A). Both produce vector PDFs.

6. **Screen rendering**: For the interactive editor, render via Canvas 2D, SVG DOM, or WebGL -- whatever gives the best UX. This rendering path does NOT need to match the export exactly (users expect minor differences between screen and export). But the three export formats WILL match each other because they all derive from the same SVG.

### If you need the exports to match the screen exactly:

Use **skia-canvas** (Node.js server-side) or wait for **canvaskit-wasm** PDF bindings:

```
Scene Graph -> Skia Canvas 2D API -> PNG (skia-canvas saveAs)
                                  -> SVG (skia-canvas saveAs)
                                  -> PDF (skia-canvas saveAs)
```

Skia uses the same rendering engine for all formats. This is the closest to Figma/Sketch's approach achievable in the JS ecosystem. Trade-off: requires Node.js server (skia-canvas is not a browser library).

---

## 7. CRITICAL GOTCHAS AND FIXES

### Half-pixel stroke blurriness
- Strokes with odd widths (1, 3, 5px) at integer coordinates straddle pixel boundaries
- Fix: Offset by 0.5px, or adjust the SVG `viewBox` by -0.5
- Even-width strokes (2, 4, 6px) are naturally sharp at integer coordinates

### SVG text vs Canvas text positioning
- Canvas: `fillText(text, x, y)` draws with y at the baseline
- SVG: `<text x="..." y="...">` defaults to y at the baseline, but `dominant-baseline` interpretation varies by browser
- Fix: Always set explicit `dy` offsets; or convert text to paths for export

### Color space
- Always work in sRGB
- When generating SVG, do not add color profile metadata unless you specifically need it
- For PDF: sRGB is the web default; typst/svg2pdf manages ICC profiles automatically

### DPI/resolution for PNG
- Export at 2x DPI minimum for quality (tldraw defaults to 2x)
- resvg-wasm supports a `fitTo` option for scaling
- At 1x, thin lines and small text will look aliased

### SVG `@font-face` and CORS
- When embedding fonts from CDNs, fetch the font file bytes yourself and inline as base64
- Do not use external `url()` references -- they will break in many SVG viewers

### PDF font embedding
- Always embed and subset fonts
- jsPDF requires manual font registration before svg2pdf conversion
- typst/svg2pdf does automatic font discovery via fontdb

---

## 8. SUMMARY DECISION MATRIX

| Requirement | Recommended Approach |
|-------------|---------------------|
| Simple drawings, quick implementation | Approach A: Canvas-first with canvas2svg + canvas2pdf |
| Complex app, maximum consistency across exports | **Approach C: SVG-first with resvg-wasm + svg2pdf.js** |
| Export must match screen rendering exactly | Approach B: Scene graph + skia-canvas (server-side) |
| Need browser-only, no server | Approach C with resvg-wasm + svg2pdf.js (all run in browser via WASM) |
| Text must be selectable in PDF | Approach C with svg2pdf.js (embed_text: true) or typst/svg2pdf |
| Need PDF/A compliance | typst/svg2pdf with pdfa: true |
| Maximum performance for batch export | @resvg/resvg-js (Node native) + typst/svg2pdf (Rust native) |

---

## Sources

- [Excalidraw Export System](https://deepwiki.com/excalidraw/excalidraw/6.6-export-system)
- [Excalidraw Export Utilities Docs](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/utils/export)
- [tldraw Custom Shape SVG Export](https://tldraw.dev/examples/toSvg-method-example)
- [tldraw SvgExportContext](https://tldraw.dev/reference/editor/SvgExportContext)
- [Figma Architecture (Made by Evan)](https://madebyevan.com/figma/)
- [Figma Rendering: Powered by WebGPU](https://www.figma.com/blog/figma-rendering-powered-by-webgpu/)
- [Figma Export Formats](https://help.figma.com/hc/en-us/articles/13402894554519-Export-formats-and-settings)
- [Sketch Canvas Tech Deep Dive](https://www.sketch.com/blog/canvas-tech/)
- [resvg - SVG Rendering Library](https://github.com/linebender/resvg)
- [resvg-js (Node.js/WASM bindings)](https://github.com/thx/resvg-js)
- [@resvg/resvg-wasm on npm](https://www.npmjs.com/package/@resvg/resvg-wasm)
- [svg2pdf.js](https://github.com/yWorks/svg2pdf.js)
- [typst/svg2pdf (Rust)](https://github.com/typst/svg2pdf)
- [canvg - SVG to Canvas](https://github.com/canvg/canvg)
- [canvas2svg](https://github.com/gliffy/canvas2svg)
- [canvas2pdf](https://github.com/joshua-gould/canvas2pdf)
- [canvaskit-wasm](https://www.npmjs.com/package/canvaskit-wasm)
- [CanvasKit Docs (Skia)](https://skia.org/docs/user/modules/canvaskit/)
- [Skia PDF Backend](https://skia.org/docs/user/sample/pdf/)
- [skia-canvas (Node.js)](https://github.com/samizdatco/skia-canvas)
- [skia-canvas Docs](https://skia-canvas.org/)
- [Two.js (renderer-agnostic)](https://two.js.org/)
- [Vega Scenegraph](https://github.com/vega/vega-scenegraph)
- [jsPDF](https://github.com/parallax/jsPDF)
- [pdf-lib](https://github.com/Hopding/pdf-lib)
- [Kendo Drawing (Telerik)](https://www.telerik.com/kendo-react-ui/components/drawing)
- [Monday.com DOM Capture Engineering](https://engineering.monday.com/capturing-dom-as-image-is-harder-than-you-think-how-we-solved-it-at-monday-com/)
- [SVG Font Embedding Guide](https://dzx.fr/blog/svg-font-embedding/)
- [MDN shape-rendering](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/shape-rendering)
- [Pixel-Perfect Canvas (Oscar Lindberg)](https://medium.com/@oscar.lindberg/how-to-create-pixel-perfect-graphics-using-html5-canvas-3750eb5f1dc9)
- [Getting Crisp SVG (Vecta.io)](https://vecta.io/blog/guide-to-getting-sharp-and-crisp-svg-images)
- [draw.io Font Embedding Issue](https://github.com/jgraph/drawio/issues/1702)
- [SVG to PNG with Resvg (Dev.to)](https://dev.to/hrishiksh/convert-svg-into-png-in-the-browser-using-resvg-64a)
