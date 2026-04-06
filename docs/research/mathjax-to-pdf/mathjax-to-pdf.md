# MathJax SVG to PDF: Comprehensive Research

## Problem Statement

MathJax renders LaTeX math to SVG. We need that SVG content rendered inside a PDF with zero visual difference. The SVG output contains complex structure: nested `<g>` transforms, `<use>` references to `<defs>`, viewBox scaling, ex-unit dimensions, and glyph paths defined as SVG path data.

Our export architecture uses pdfkit for direct scene-graph-to-PDF rendering. Math elements are the one case where we have SVG as an intermediate representation (from MathJax) that must be faithfully translated to PDF drawing primitives.

---

## 1. MathJax SVG Output Structure

### What MathJax 4 tex2svg Actually Produces

MathJax's SVG output processor renders math using SVG path data for every glyph. The output structure for a typical equation like `\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}` looks like this:

```xml
<mjx-container class="MathJax" jax="SVG" display="true">
  <svg xmlns="http://www.w3.org/2000/svg"
       xmlns:xlink="http://www.w3.org/1999/xlink"
       width="20.86ex" height="6.009ex"
       role="img" focusable="false"
       viewBox="0 -1740.7 9219.6 2656"
       style="vertical-align: -2.071ex;">
    <defs>
      <path id="MJX-1-TEX-S2-222B" stroke-width="10"
            d="M114 -798Q132 -824 165 -824H167Q195 -824 223 -764T275 -600T320 ..." />
      <path id="MJX-1-TEX-N-221E" stroke-width="10"
            d="M55 217Q55 305 111 373T254 442Q342 442 419 381Q424 ..." />
      <path id="MJX-1-TEX-I-1D452" stroke-width="10"
            d="M39 168Q39 225 58 272T107 350T174 402T244 ..." />
      <!-- More glyph paths... -->
    </defs>
    <g stroke="currentColor" fill="currentColor"
       stroke-width="0" transform="matrix(1 0 0 -1 0 0)">
      <g data-mml-node="math">
        <g data-mml-node="msubsup">
          <g data-mml-node="mo" transform="translate(0, 0)">
            <use data-c="222B" xlink:href="#MJX-1-TEX-S2-222B" />
          </g>
          <g data-mml-node="mn" transform="translate(556, -806) scale(0.707)">
            <use data-c="221E" xlink:href="#MJX-1-TEX-N-221E" />
          </g>
          <!-- More nested groups with transforms... -->
        </g>
      </g>
    </g>
  </svg>
</mjx-container>
```

### Key SVG Features Used by MathJax

| Feature | How MathJax Uses It | PDF Conversion Difficulty |
|---|---|---|
| `<defs>` + `<path>` | Glyph shapes defined once as SVG path data | LOW -- paths are standard SVG commands |
| `<use xlink:href>` | References to glyph definitions, avoids duplication | MEDIUM -- must resolve references before conversion |
| `viewBox` | Coordinate system: units in 1/1000 em, e.g. `viewBox="0 -1740.7 9219.6 2656"` | MEDIUM -- must map viewBox to PDF coordinates |
| `transform="matrix(...)"` | Root `matrix(1 0 0 -1 0 0)` flips Y-axis (SVG Y-down to math Y-up) | MEDIUM -- must compose all transform matrices |
| `transform="translate(x,y)"` | Positions each glyph/group | LOW -- straightforward coordinate translation |
| `transform="scale(0.707)"` | Sub/superscript sizing (0.707 ~= 1/sqrt(2)) | LOW -- scale factor application |
| `stroke-width` on paths | MathJax sets `stroke-width="10"` on glyphs for slight emboldening ("blacker" option) | LOW -- direct pdfkit equivalent |
| `width`/`height` in ex units | e.g. `width="20.86ex"` -- relative to font x-height | MEDIUM -- must resolve ex to absolute units |
| `style="vertical-align: -2.071ex"` | Baseline alignment for inline math | LOW -- layout concern, not rendering |
| `fill="currentColor"` | Inherits text color | LOW -- resolve to actual color at conversion time |
| Nested `<g>` groups | Deep nesting (6-10 levels) with cumulative transforms | MEDIUM -- must compose transform chain |

### fontCache Modes

MathJax offers three modes that fundamentally change the SVG structure:

1. **`'global'`** (default): Glyph paths stored in a single `<defs>` block shared across ALL equations on the page. Individual equations use `<use href="#MJX-...">` to reference them. The SVG is NOT self-contained.

2. **`'local'`**: Each equation's SVG contains its own `<defs>` block with only the glyphs it needs. `<use>` elements reference local definitions. The SVG IS self-contained.

3. **`'none'`**: No caching. Every glyph occurrence gets its own inline `<path>` element with full path data. No `<use>` or `<defs>` at all. Largest output but simplest structure.

**Recommendation for our use case:** Use `fontCache: 'none'` or `fontCache: 'local'`. Global cache creates cross-equation dependencies that complicate export. `'none'` produces the simplest SVG (no use/defs resolution needed) at the cost of larger SVG size, which doesn't matter since we immediately convert to PDF.

### Dimension Calculations

MathJax SVG dimensions use **ex** units. The `viewBox` uses internal units (1/1000 em). To convert to absolute dimensions:

- 1ex is approximately 0.5em (depends on font)
- MathJax measures the actual ex-height of the surrounding font context
- For standalone rendering: assume 1ex = 8px at 16px font size, or compute from the target font metrics
- The viewBox coordinates divided by 1000 give em units; multiply by font-size-in-points to get PDF points

---

## 2. SVG-to-PDF Libraries

### 2a. typst/svg2pdf (Rust)

- **Repository:** https://github.com/typst/svg2pdf
- **Stars:** 393 | **Latest release:** v0.13.0 (March 2025)
- **License:** MIT / Apache 2.0

**Supported SVG features:**
- Paths with simple and complex fills
- Gradients, patterns
- Clip paths, masks
- Transformations (full matrix support)
- viewBox and preserveAspectRatio
- Text (with font subsetting, embeds as proper PDF text)
- Raster images and nested SVGs
- Filters (rasterizes filtered elements individually, rest stays vector)

**Architecture:** Uses `usvg` for SVG parsing, which normalizes the SVG tree. usvg resolves `<use>` references, applies inherited styles, resolves CSS, and produces a simplified "Micro SVG" tree. This means **`<use>`/`<defs>` resolution is handled automatically by usvg**.

**Unsupported:** `spreadMethod` on gradients, some SVG2 features.

**WASM availability:** There is NO official WASM build or npm package for svg2pdf as a standalone library. However, svg2pdf is used internally by Typst, and Typst compiles to WASM via typst.ts. The crate itself could theoretically be compiled to WASM via wasm-pack since it's pure Rust with no system dependencies, but nobody has published such a package.

**MathJax compatibility:** Not explicitly tested, but since usvg resolves `<use>`/`<defs>` and handles transforms/viewBox, MathJax SVG should work. The glyph paths are standard SVG path commands that svg2pdf handles well. Text is converted to paths by default (font subsetting is optional).

**How vl-convert uses it:** The Vega ecosystem's `vl-convert` tool uses svg2pdf for chart-to-PDF conversion. It runs server-side (CLI/Python), not in browser. This validates svg2pdf's ability to handle complex SVG output from JavaScript rendering libraries.

**Verdict:** Best SVG-to-PDF fidelity of any available library. The blocker is the lack of a pre-built WASM package. Building one ourselves is feasible but requires maintaining a Rust build pipeline.

### 2b. svg2pdf.js (yWorks)

- **Repository:** https://github.com/yWorks/svg2pdf.js
- **Stars:** 832 | **Latest release:** v2.7.0 (January 2026)
- **License:** MIT
- **npm:** `svg2pdf.js` (31 dependents)

**How it works:** Extends jsPDF with an `.svg()` method. Parses SVG DOM elements and translates them to jsPDF drawing commands. Runs entirely in the browser.

**Supported features:** Most common SVG elements including paths, transforms, basic text, images, gradients.

**Known limitations (from issue #82):**
- `foreignObject` not supported (irrelevant for MathJax)
- `textPath` and `textLength` not supported
- `mask` and `filter` not supported
- `glyph` elements not supported
- `use` elements referencing non-local IRI resources fail
- Most measurement units besides `px` not fully supported
- Text stroking not implemented
- Gradients/patterns on strokes unsupported
- Transforms on non-`path` elements within `clipPath` broken

**MathJax compatibility concerns:**
- The `<use>` element support is limited -- non-local references fail. MathJax with `fontCache: 'global'` would break. With `fontCache: 'local'`, local `<use>` references *should* work but are not guaranteed.
- The ex-unit dimensions may not be properly resolved (unit support is limited to px).
- The `matrix()` transform on the root `<g>` should work since basic transforms are supported.

**Verdict:** Easiest to integrate (pure JS, works with jsPDF we could add as a dependency). But the SVG feature coverage is incomplete and specifically weak in areas MathJax uses (units, use/defs). Would require testing with actual MathJax output and likely patching.

### 2c. SVG-to-PDFKit (alafr)

- **Repository:** https://github.com/alafr/SVG-to-PDFKit
- **Stars:** 432 | **npm:** `svg-to-pdfkit`

**How it works:** Inserts SVG into a PDF document created with PDFKit by calling `SVGtoPDF(doc, svg, x, y, options)`. Since we already use pdfkit, this is the most natural integration.

**Supported features:**
- All basic shapes (rect, circle, path, ellipse, line, polyline, polygon)
- `<use>` and nested SVGs -- explicitly supported
- Text with tspan, textPath
- `transform`, `viewBox`, `preserveAspectRatio` -- explicitly supported
- Fill, stroke, opacity, gradients, patterns, clip paths, masks, images, fonts, links

**Known limitations:**
- Filters unsupported
- `foreignObject` unsupported
- Some text attributes unsupported (font-variant, writing-mode, unicode-bidi)
- `vector-effect` unsupported
- **Critical bug with MathJax**: Issue #110 documents that math equation SVGs (from MathType, which is similar to MathJax) render with fonts that are "too small". The root cause is that `@font-face` declarations in SVG `<defs>` are not parsed. Since MathJax uses SVG paths (not fonts) for glyphs, this specific bug may not apply, but it indicates incomplete SVG parsing.

**MathJax compatibility:** The explicit support for `<use>`, `<defs>`, `viewBox`, and `transform` makes this the most promising pure-JS option. However, the issue with font sizing in math SVGs is concerning.

**Verdict:** Best pure-JS option for our pdfkit-based architecture. The `<use>`/`<defs>` and transform support directly addresses MathJax's SVG structure. Needs thorough testing with actual MathJax output. The library has known bugs ("There are bugs, please send issues and/or pull requests" -- their words).

### 2d. canvg + Canvas-to-PDF

- **Repository:** https://github.com/canvg/canvg

**How it works:** Parses SVG XML and renders to an HTML Canvas 2D context. The canvas could then be captured as a raster image for PDF embedding.

**Why this is bad for us:**
- Rasterizes the math. We need vector output in the PDF.
- Resolution-dependent. Would need to render at very high DPI to avoid visible artifacts.
- Loses the ability to select/search text in the PDF (though MathJax paths aren't selectable anyway).

**Verdict:** Reject. Rasterization is unacceptable for a scientific figure tool targeting PDF/LaTeX workflows.

### 2e. pdfkit's Built-in SVG Path Parser

pdfkit has a native `doc.path(svgPathString)` method that accepts SVG path data strings directly. This means if we can extract the raw `d` attribute from each `<path>` in the MathJax SVG and compute the correct transform matrix, we can replay the paths directly in pdfkit without any intermediate library.

```javascript
// pdfkit can draw SVG paths directly:
doc.path('M 0,20 L 100,160 Q 130,200 150,120 C 190,-40 200,200 300,150').stroke();
```

This is the basis for the "manual path replay" approach discussed in Section 6.

---

## 3. Direct MathJax-to-PDF Approaches

### 3a. Does MathJax Have Native PDF Output?

**No.** MathJax 4 supports exactly three output formats:
- **SVG** -- vector graphics using SVG path data for glyphs
- **CommonHTML (CHTML)** -- HTML+CSS using web fonts
- **There is no PDF, Canvas, or PostScript output**

MathJax has never had a PDF output processor. The MathJax team's focus is web rendering.

### 3b. Can MathJax Output to Canvas 2D?

**Not directly.** MathJax does not have a Canvas 2D output processor. The only way to get MathJax onto a canvas is:
1. Render to SVG, then use canvg to draw the SVG onto a canvas (rasterization)
2. Render to CHTML, then use html2canvas to screenshot (rasterization)

Both approaches rasterize. Neither produces vector PDF primitives.

### 3c. CommonHTML Output to PDF?

MathJax's CommonHTML output produces HTML elements styled with CSS, using web fonts (STIX Two Math, etc.) for glyph rendering. Converting this to PDF would require:
- A full CSS layout engine to compute positions
- Font metric matching between browser and PDF
- Handling of CSS transforms, positioning, and font-feature-settings

This is essentially "render HTML to PDF" which is what headless Chrome / Puppeteer does. It's a non-starter for a client-side app without a browser engine.

**Verdict:** MathJax provides no shortcut to PDF. SVG is the only viable intermediate format.

---

## 4. How Existing Tools Solve This

### 4a. Overleaf

Overleaf runs a **full TeX Live installation** on their servers (pdfTeX, XeTeX, or LuaTeX). When you compile a document:
1. The `.tex` source is sent to the server
2. A real TeX engine (pdflatex/xelatex/lualatex) compiles it
3. The engine directly produces PDF output with native math typesetting
4. PDF is sent back to the browser for preview

Overleaf never touches MathJax or SVG for math rendering. The math is rendered by TeX itself into PDF drawing primitives. This is the gold standard for fidelity but requires a server-side TeX installation (~4GB).

**Key insight:** Overleaf's approach is impossible to replicate client-side without WASM TeX engines.

### 4b. Typst

Typst is a modern typesetting system that compiles to PDF natively:
1. Source markup (including math) is parsed by the Typst compiler
2. The compiler lays out math using its own math rendering engine
3. Output is PDF (via `typst-pdf` crate) or SVG (via `typst-svg` crate)

Typst's math rendering is built-in, not via MathJax or any external tool. It directly emits PDF text and path commands for math glyphs.

**Typst in the browser via typst.ts:**
- npm packages: `@myriaddreamin/typst.ts`, `@myriaddreamin/typst-ts-web-compiler`, `@myriaddreamin/typst-ts-renderer`
- The `$typst.pdf()` method compiles Typst source to PDF bytes in the browser via WASM
- The `$typst.svg()` method compiles to SVG
- MiTeX package allows LaTeX math syntax inside Typst documents (185KB WASM, converts LaTeX to Typst math notation)

**Key insight:** typst.ts could theoretically render LaTeX math to PDF in the browser: LaTeX -> MiTeX -> Typst math -> typst-pdf -> PDF bytes. But this requires loading the full Typst compiler WASM (~several MB), providing fonts, and producing a full Typst document just for one equation.

### 4c. KaTeX

KaTeX renders math to HTML+CSS using web fonts (KaTeX fonts). It has **no PDF output** and no SVG output. KaTeX's HTML output has the same problems as MathJax CHTML for PDF conversion:
- Requires a CSS layout engine to determine glyph positions
- Font-dependent rendering
- When exported to PDF by tools like jsPDF, math appears as whitespace (documented in multiple GitHub issues across Joplin, BoostNote, Notable)

**Why KaTeX doesn't do PDF:** KaTeX's philosophy is fast web rendering. PDF is not a web format. The team has never prioritized it.

### 4d. Mathpix

Mathpix works in the **opposite direction**: it converts images/PDFs of math TO LaTeX. For LaTeX-to-image conversion, they likely use a server-side TeX engine (similar to Overleaf). They don't publish their rendering pipeline.

### 4e. latex2image.joeraut.com

Uses a server-side LaTeX installation to compile equations to DVI/PDF, then converts to PNG/SVG. Standard server-side approach.

---

## 5. How Design Tools Handle Math in PDF Export

### 5a. Figma

Figma handles LaTeX math through **community plugins** (LiveTeX Math, LaTeX Complete, FigMath Pro, etc.). The workflow:
1. User enters LaTeX in a plugin
2. Plugin renders the LaTeX to SVG (using MathJax or KaTeX under the hood)
3. SVG is inserted into the Figma canvas as a vector group (flattened vector paths)
4. When the user exports to PDF, Figma's C++/WASM renderer exports the vector paths as PDF drawing commands

**Key insight:** Figma flattens the SVG into its internal vector representation. The `<use>`/`<defs>` structure is resolved at import time, not at export time. By the time PDF export happens, math is just a set of filled paths -- no different from any other vector shape.

**This is the approach we should emulate:** resolve MathJax SVG into flat path data at render time, store as scene graph paths, export via our normal pdfkit pipeline.

### 5b. Canva

Canva's LaTeX Math app renders equations and adds them as **raster images** to the design. When exported to PDF, they remain raster. Canva does not support vector math in PDF export.

### 5c. draw.io (diagrams.net)

draw.io supports MathJax for math typesetting (enable via Extras > Mathematical Typesetting). When exporting to PDF:
- Math equations are converted to images (rasterized) or embedded as SVG
- Math expressions in exported PDFs are not selectable (confirmed by issue #5175)
- The math is essentially treated as a bitmap or opaque SVG block

**Key insight:** draw.io does not solve the fidelity problem. Their PDF export of math is lossy.

---

## 6. Approaches Ranked by Feasibility

### Approach A: Manual Path Replay via pdfkit (RECOMMENDED)

**Concept:** Parse MathJax SVG, resolve all `<use>` references, compose transform matrices, and replay each glyph's SVG path data through pdfkit's `doc.path()` method.

**Implementation steps:**
1. Configure MathJax with `fontCache: 'none'` (eliminates `<use>`/`<defs>` entirely) or `fontCache: 'local'` (self-contained SVG with local defs)
2. Parse the SVG output (DOMParser or the serialized XML string)
3. Walk the SVG tree depth-first
4. For each `<g>` element, extract and compose its `transform` attribute into a cumulative CTM (Current Transform Matrix)
5. For each `<path>` element (or resolved `<use>` target), extract the `d` attribute
6. Convert the viewBox coordinate system to PDF points
7. Apply the cumulative transform and draw via `doc.save()`, `doc.transform(...)`, `doc.path(d).fill(color)`, `doc.restore()`

**Pseudocode:**
```typescript
function renderMathJaxSvgToPdf(
  doc: PDFKit.PDFDocument,
  svgElement: SVGSVGElement,
  targetX: number,  // PDF x position in points
  targetY: number,  // PDF y position in points
  targetWidth: number  // desired width in points
): void {
  const viewBox = parseViewBox(svgElement.getAttribute('viewBox'));
  const scale = targetWidth / viewBox.width;

  doc.save();
  doc.translate(targetX, targetY);
  doc.scale(scale, scale);
  doc.translate(-viewBox.x, -viewBox.y);

  // Resolve all <use> references first (if fontCache != 'none')
  const resolvedSvg = resolveUseElements(svgElement);

  walkSvgTree(resolvedSvg, doc, identityMatrix());
  doc.restore();
}

function walkSvgTree(
  element: Element,
  doc: PDFKit.PDFDocument,
  parentTransform: Matrix
): void {
  const localTransform = parseTransform(element.getAttribute('transform'));
  const combinedTransform = multiply(parentTransform, localTransform);

  if (element.tagName === 'path') {
    const d = element.getAttribute('d');
    const fill = resolveColor(element, 'fill');
    doc.save();
    applyTransform(doc, combinedTransform);
    doc.path(d).fill(fill);
    doc.restore();
  }

  for (const child of element.children) {
    walkSvgTree(child, doc, combinedTransform);
  }
}
```

**Pros:**
- Zero external dependencies beyond pdfkit (already in our stack)
- Full control over coordinate mapping
- Vector-perfect output
- Works with our existing dual-export architecture
- The math becomes just another set of filled paths in the PDF

**Cons:**
- Must implement SVG transform parsing (matrix, translate, scale, rotate)
- Must implement `<use>`/`<defs>` resolution (avoided if fontCache='none')
- Must handle the viewBox-to-PDF coordinate mapping correctly
- Must handle edge cases (clip paths in math, colored equations, etc.)

**Complexity estimate:** ~200-400 lines of well-structured TypeScript. The core is a tree walker with transform composition and path replay. SVG path parsing is handled by pdfkit natively.

**This is the Figma approach.** Figma resolves SVG to flat paths and renders them directly. We would do the same but with pdfkit as the PDF backend.

### Approach B: SVG-to-PDFKit Library

**Concept:** Use the `svg-to-pdfkit` npm package to insert MathJax SVG directly into our pdfkit document.

**Implementation:**
```typescript
import SVGtoPDF from 'svg-to-pdfkit';

function renderMathToPdf(
  doc: PDFKit.PDFDocument,
  svgString: string,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  SVGtoPDF(doc, svgString, x, y, { width, height });
}
```

**Pros:**
- Minimal implementation effort (one function call)
- Already supports `<use>`, `<defs>`, `viewBox`, transforms
- Integrates directly with our pdfkit pipeline

**Cons:**
- Known bugs with math SVG rendering (issue #110: fonts too small)
- 432 stars, 56 open issues -- not battle-tested at scale
- We'd depend on a third-party library for a critical path
- May need patches for MathJax-specific SVG patterns
- "There are bugs" -- their own README

**Risk mitigation:** Test extensively with MathJax output. Fork and patch if needed.

### Approach C: typst/svg2pdf via Custom WASM Build

**Concept:** Compile the Rust `svg2pdf` crate to WASM using wasm-pack, expose a JS API, and use it to convert MathJax SVG to PDF chunks that we embed in our pdfkit document.

**Implementation outline:**
1. Create a Rust project depending on `svg2pdf` and `usvg`
2. Add `#[wasm_bindgen]` exports for an `svg_to_pdf_bytes(svg_string: &str) -> Vec<u8>` function
3. Build with `wasm-pack build --target web`
4. In our app, call the WASM function to get PDF bytes for each math element
5. Embed the PDF bytes as a Form XObject in our pdfkit document

**Key advantage:** svg2pdf uses usvg for parsing, which resolves ALL `<use>` references, applies all CSS, normalizes transforms, and produces a clean tree. This handles every SVG complexity MathJax can throw at it.

**Pros:**
- Highest fidelity SVG-to-PDF conversion available
- usvg resolves all SVG complexity automatically
- Battle-tested by Typst (which renders math to PDF daily) and vl-convert (Vega charts to PDF)
- Font subsetting, text embedding, full transform support

**Cons:**
- Requires maintaining a Rust build pipeline
- WASM binary size unknown (usvg + svg2pdf + pdf-writer -- likely 1-3MB)
- Must figure out how to embed the resulting PDF as XObject in our pdfkit document
- Two PDF generation libraries in one app (pdfkit + svg2pdf's pdf-writer)
- Font handling: svg2pdf needs access to font files for text embedding; MathJax uses paths not fonts, so this may be moot

**Verdict:** Overkill unless Approach A proves insufficient. But it's the nuclear option that guarantees correctness.

### Approach D: Typst WASM for Direct LaTeX-to-PDF

**Concept:** Use typst.ts to compile LaTeX math directly to PDF bytes in the browser, bypassing MathJax entirely.

**Pipeline:** LaTeX string -> MiTeX (LaTeX-to-Typst converter) -> Typst compiler -> PDF bytes

**Implementation:**
```typescript
import { $typst } from '@myriaddreamin/typst.ts';

async function renderLatexToPdf(latex: string): Promise<Uint8Array> {
  const typstSource = `
    #import "@preview/mitex:0.2.5": *
    #set page(width: auto, height: auto, margin: 0pt)
    $ mitex(${JSON.stringify(latex)}) $
  `;
  return await $typst.pdf({ mainContent: typstSource });
}
```

**Pros:**
- Completely bypasses MathJax SVG and all SVG-to-PDF conversion problems
- Typst's math rendering is high quality and well-tested
- Native PDF output with proper font embedding
- MiTeX is only 185KB WASM

**Cons:**
- Requires loading Typst compiler WASM (multi-MB)
- Requires bundling Typst fonts
- MiTeX's LaTeX compatibility is not 100% -- may not support all LaTeX packages/commands
- Produces a full PDF document per equation -- must extract and embed as XObject
- Different math rendering engine = potentially different visual output than MathJax on canvas
- Would need to also render via Typst on the canvas (for WYSIWYG consistency) or accept canvas-vs-PDF differences

**Verdict:** Interesting for a future "Typst mode" but violates our zero-tolerance rule for canvas/export divergence unless we also render with Typst on canvas.

### Approach E: SwiftLaTeX WASM for Direct TeX-to-PDF

**Concept:** Embed a full TeX engine (pdfTeX or XeTeX compiled to WASM) to render equations directly to PDF.

**SwiftLaTeX:**
- Repository: https://github.com/SwiftLaTeX/SwiftLaTeX
- Compiles XeTeX and PdfTeX to WebAssembly
- Runs ~2x slower than native binaries
- Fetches packages from CTAN on demand
- Can produce exact same output as TeX Live

**Implementation:**
```typescript
// Pseudocode
const engine = await loadSwiftLaTeX('pdftex');
engine.writeFile('equation.tex', `
  \\documentclass[preview,border=0pt]{standalone}
  \\usepackage{amsmath}
  \\begin{document}
  $${latex}$
  \\end{document}
`);
const pdfBytes = engine.compile('equation.tex');
```

**Pros:**
- Exact TeX output. This is what Overleaf does, but client-side.
- Supports ALL LaTeX packages (amsmath, amssymb, mathtools, etc.)
- Pixel-identical to what the user would get in their LaTeX paper

**Cons:**
- Massive WASM binary (XeTeX + libraries)
- Needs to fetch LaTeX packages from CTAN on first use
- Compilation latency (seconds per equation, not milliseconds)
- Same canvas-vs-PDF consistency problem as Approach D
- Maintenance burden of a TeX installation in the browser
- Memory usage of a running TeX engine

**Verdict:** Too heavy for our use case. Only viable if we pivot to being "Overleaf in the browser."

### Approach F: Hybrid SVG Page Render

**Concept:** Instead of converting individual math SVGs, render the ENTIRE page as one big SVG (including non-math elements) and convert the whole thing to PDF via one of the SVG-to-PDF libraries.

**Implementation:**
1. Each element implements `toSvg()` (already planned in our architecture)
2. Compose all elements into one page-level SVG
3. Convert entire SVG to PDF via svg2pdf (Rust/WASM) or svg2pdf.js

**Pros:**
- One conversion step for the whole page
- No need to mix pdfkit and SVG-to-PDF approaches
- Math elements are just part of the SVG tree

**Cons:**
- Abandons our direct scene-graph-to-PDF pipeline
- Makes pdfkit unnecessary (everything goes through SVG)
- Gives up fine-grained control over PDF output
- Text handling in SVG-to-PDF is always worse than direct pdfkit text rendering
- Violates our architectural decision of "no SVG translation layer" for PDF

**Verdict:** Contradicts our architecture. Reject unless we fundamentally change the export pipeline.

### Approach G: Pre-render Math to Raster

**Concept:** Use resvg-wasm (already in our stack) to render MathJax SVG to PNG at high DPI, embed the PNG in the PDF.

**Pros:**
- Dead simple. We already have resvg-wasm.
- Zero SVG parsing/conversion code.

**Cons:**
- Raster output in a vector PDF. Unacceptable for scientific publishing.
- File size bloat (high-DPI PNGs of every equation).
- Zoom reveals pixels.

**Verdict:** Reject. Same reason as canvg.

---

## 7. Decision Matrix

| Approach | Fidelity | Complexity | Dependencies | Architecture Fit | Recommendation |
|---|---|---|---|---|---|
| **A: Manual path replay** | HIGH | MEDIUM | None (pdfkit only) | PERFECT | **PRIMARY** |
| **B: svg-to-pdfkit** | MEDIUM-HIGH | LOW | +1 npm package | GOOD | **FALLBACK** |
| **C: svg2pdf WASM** | HIGHEST | HIGH | +WASM build pipeline | OK | RESERVE |
| **D: Typst WASM** | HIGH | HIGH | +Typst WASM ecosystem | POOR (canvas mismatch) | FUTURE |
| **E: SwiftLaTeX** | PERFECT | VERY HIGH | +TeX WASM engine | POOR (canvas mismatch) | REJECT |
| **F: Hybrid SVG page** | MEDIUM | MEDIUM | Depends on converter | POOR (architecture violation) | REJECT |
| **G: Raster fallback** | LOW | LOW | None (resvg-wasm) | OK | REJECT |

---

## 8. Recommended Strategy

### Primary: Approach A (Manual Path Replay)

Implement a `MathJaxSvgToPdf` module (~200-400 lines) that:

1. **Configures MathJax** with `svg: { fontCache: 'none' }` to produce inline paths (no `<use>`/`<defs>` resolution needed)
2. **Parses the SVG** using DOMParser or direct string parsing
3. **Walks the tree** depth-first, composing transform matrices at each `<g>` level
4. **Maps coordinates**: viewBox units -> PDF points via a computed scale factor
5. **Replays paths**: each `<path d="...">` becomes `doc.path(d).fill(color)` in pdfkit
6. **Handles the Y-axis flip**: MathJax's root `matrix(1 0 0 -1 0 0)` flips Y; compose this into the transform chain

This approach:
- Adds zero dependencies
- Fits perfectly into our pdfkit-based export pipeline
- Produces vector-perfect PDF output
- Is the same approach Figma uses (resolve SVG to flat paths, render directly)
- Keeps math elements as regular scene graph nodes that happen to contain path data

### Fallback: Approach B (svg-to-pdfkit)

If manual path replay proves too complex (unlikely given the constrained SVG subset MathJax produces), fall back to `svg-to-pdfkit` which already handles `<use>`, `<defs>`, `viewBox`, and `transform`. Test thoroughly with MathJax output. Be prepared to fork and patch.

### Future consideration: Approach D (Typst WASM)

If we ever want to offer a "Typst rendering mode" where math on canvas is also rendered by Typst (not MathJax), then typst.ts with `$typst.pdf()` becomes the natural export path. This would give us a fully integrated LaTeX -> Typst -> PDF pipeline with native math quality. The blocker is canvas rendering consistency: we'd need to render math on canvas using Typst SVG output rather than MathJax.

---

## 9. Implementation Notes for Approach A

### SVG Transform Parsing

MathJax uses these transform types:
- `matrix(a, b, c, d, e, f)` -- 2D affine matrix
- `translate(x, y)` -- position offset
- `scale(sx)` or `scale(sx, sy)` -- uniform or non-uniform scaling

A transform parser needs to handle these three types and produce a 3x3 matrix:
```
| a  c  e |
| b  d  f |
| 0  0  1 |
```

Matrix composition: `combined = parent * local`

### viewBox to PDF Mapping

Given:
- `viewBox="minX minY width height"` (MathJax units: 1/1000 em)
- Target position: `(pdfX, pdfY)` in PDF points
- Target width: `pdfWidth` in PDF points

Scale factor: `pdfWidth / viewBoxWidth`

The initial transform is:
```
doc.translate(pdfX, pdfY)
doc.scale(scaleFactor)
doc.translate(-minX, -minY)
```

### MathJax's Y-Axis Flip

MathJax SVG has a root `<g transform="matrix(1 0 0 -1 0 0)">` which flips the Y-axis. In the viewBox, Y increases upward (mathematical convention). In PDF, Y increases downward. The matrix flip combined with pdfkit's coordinate system needs careful handling:

- PDF coordinate origin is top-left, Y increases downward
- MathJax viewBox has negative Y values above the baseline
- The `matrix(1 0 0 -1 0 0)` in MathJax flips Y so that positive viewBox Y goes up

When replaying in pdfkit, this matrix is just another transform in the chain. pdfkit's `doc.transform(1, 0, 0, -1, 0, 0)` is the equivalent.

### Color Handling

MathJax uses `fill="currentColor"` and `stroke="currentColor"`. At conversion time, resolve to the actual text color of the math element in our scene graph (default: black).

### Stroke Width

MathJax path elements have `stroke-width="10"` (the "blacker" setting, default 1). For filled glyphs, the stroke width affects the visual weight. Replicate this in pdfkit:
```typescript
doc.path(d).fill(color); // For pure fills
// Or if stroked:
doc.lineWidth(strokeWidth * scaleFactor).path(d).fillAndStroke(fillColor, strokeColor);
```

---

## 10. Sources

### SVG-to-PDF Libraries
- [typst/svg2pdf (GitHub)](https://github.com/typst/svg2pdf) -- Rust SVG-to-PDF converter, 393 stars
- [svg2pdf API docs (docs.rs)](https://docs.rs/svg2pdf/latest/svg2pdf/) -- Supported features documentation
- [typst/svg2pdf DeepWiki](https://deepwiki.com/typst/svg2pdf) -- Architecture analysis
- [yWorks/svg2pdf.js (GitHub)](https://github.com/yWorks/svg2pdf.js) -- JS SVG-to-PDF via jsPDF, 832 stars
- [svg2pdf.js npm](https://www.npmjs.com/package/svg2pdf.js) -- v2.7.0
- [svg2pdf.js unsupported features (issue #82)](https://github.com/yWorks/svg2pdf.js/issues/82) -- Known limitations
- [alafr/SVG-to-PDFKit (GitHub)](https://github.com/alafr/SVG-to-PDFKit) -- SVG insertion into pdfkit, 432 stars
- [SVG-to-PDFKit math equation issue (#110)](https://github.com/alafr/SVG-to-PDFKit/issues/110) -- MathType SVG rendering bug
- [svg-to-pdfkit npm](https://www.npmjs.com/package/svg-to-pdfkit)
- [canvg (GitHub)](https://github.com/canvg/canvg) -- SVG to Canvas renderer
- [vl-convert (GitHub)](https://github.com/vega/vl-convert) -- Uses svg2pdf for Vega chart PDF export
- [vl-convert-pdf (crates.io)](https://crates.io/crates/vl-convert-pdf)

### MathJax Documentation
- [MathJax SVG Output Support](https://docs.mathjax.org/en/latest/output/svg.html)
- [MathJax SVG Output Options](https://docs.mathjax.org/en/latest/options/output/svg.html) -- fontCache, blacker, etc.
- [MathJax Converting Math Strings](https://docs.mathjax.org/en/v4.0/web/convert.html) -- tex2svg API
- [MathJax Output Formats](https://docs.mathjax.org/en/v3.2/output/index.html) -- CHTML vs SVG
- [MathJax viewBox issue #2390](https://github.com/mathjax/MathJax/issues/2390) -- viewBox sizing bugs
- [MathJax + jsPDF (jsPDF issue #953)](https://github.com/parallax/jsPDF/issues/953) -- Integration attempts
- [jsPDF math equation SVG (issue #2316)](https://github.com/parallax/jsPDF/issues/2316)

### TeX/Typst Engines
- [SwiftLaTeX (GitHub)](https://github.com/SwiftLaTeX/SwiftLaTeX) -- WASM TeX engine
- [typst.ts (GitHub)](https://github.com/Myriad-Dreamin/typst.ts) -- Typst in JavaScript via WASM
- [typst.ts All-in-One API](https://deepwiki.com/Myriad-Dreamin/typst.ts/6.2-all-in-one-api-(dollartypst)) -- $typst.pdf() method
- [MiTeX (GitHub)](https://github.com/mitex-rs/mitex) -- LaTeX to Typst converter, 185KB WASM
- [typst-pdf (crates.io)](https://crates.io/crates/typst-pdf) -- Typst PDF exporter
- [Overleaf TeX Live docs](https://docs.overleaf.com/troubleshooting-and-support/tex-live)

### Design Tool Approaches
- [Figma LaTeX plugins](https://www.figma.com/community/plugin/1578050259390493409/livetex-math-ultimate-latex-equation-toolkit)
- [Canva LaTeX Math app](https://www.canva.com/apps/AAF8-4fP98k/latex-math)
- [draw.io math typesetting](https://www.drawio.com/doc/faq/math-typesetting)
- [draw.io MathJax PDF issue #5175](https://github.com/jgraph/drawio/issues/5175) -- Math not selectable in PDF

### PDFKit
- [PDFKit vector graphics docs](https://pdfkit.org/docs/vector.html) -- SVG path parser, doc.path()
- [PDFKit npm](https://www.npmjs.com/package/pdfkit)

### SVG Parsing and Processing
- [resvg (GitHub)](https://github.com/linebender/resvg) -- usvg resolves use/defs
- [resvg-js (GitHub)](https://github.com/thx/resvg-js) -- WASM SVG renderer
- [SVG coordinate systems (W3C)](https://www.w3.org/TR/SVG11/coords.html)
- [SVG units reference](https://oreillymedia.github.io/Using_SVG/guide/units.html)

### KaTeX
- [KaTeX (GitHub)](https://github.com/KaTeX/KaTeX) -- No PDF output, HTML+CSS only
- [KaTeX PDF rendering issues](https://github.com/laurent22/joplin/issues/3058) -- Renders as whitespace in PDF
- [KaTeX server-side rendering limitations](https://github.com/KaTeX/KaTeX/issues/2176)
