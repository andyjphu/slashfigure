# Tables in Canvas-Based Drawing Applications

Comprehensive research on implementing tables within a canvas-based scientific figure drawing app. Covers rendering strategies, editing, export pipelines, accessibility, performance, and scientific conventions.

---

## 1. Table Rendering Approaches

There are four primary strategies for rendering tables in a canvas-based application. Each trades off control, fidelity, and complexity differently.

### 1.1 Pure Canvas 2D Rendering

Draw every line, rectangle, and text glyph directly onto the `<canvas>` element using the Canvas 2D API (`fillRect`, `strokeRect`, `fillText`, `measureText`).

**Advantages:**
- Pixel-perfect control over every element
- Consistent rendering across browsers (no CSS quirks)
- Single rendering surface -- no DOM/canvas synchronization
- Performs well at thousands of cells because the browser tracks zero DOM nodes per cell

**Disadvantages:**
- Must reimplement text selection, cursor blinking, IME composition, right-to-left text, and line wrapping
- No native accessibility -- must build a parallel DOM for screen readers
- `measureText` is limited: no line-height, no sub-pixel font metrics, no kerning tables
- Complex to implement rich text (bold/italic/superscript within a single cell)

**Who uses this:** Google Docs (migrated from DOM to canvas in 2021 for layout consistency), AG Grid (charts layer), canvas-datagrid, VTable.

Sources: [Google Docs canvas rendering](https://workspaceupdates.googleblog.com/2021/05/Google-Docs-Canvas-Based-Rendering-Update.html), [AG Grid canvas optimization](https://blog.ag-grid.com/optimising-html5-canvas-rendering-best-practices-and-techniques/)

### 1.2 SVG foreignObject

Embed an HTML `<table>` (or `<div>` grid) inside an SVG `<foreignObject>` element. The foreignObject can then be composited into the canvas via `drawImage` on an SVG-backed image, or kept as a live DOM element overlaid on the canvas.

**Advantages:**
- Full HTML/CSS layout engine for text wrapping, borders, padding
- Native text selection and editing
- CSS `border-collapse` works out of the box

**Disadvantages:**
- `foreignObject` is not supported in all SVG renderers (resvg has partial support; many PDF converters ignore it entirely)
- Cross-origin restrictions: images inside foreignObject are tainted, blocking `toDataURL`
- Styles declared via external stylesheets do not pass through to foreignObject contents
- Cannot be rasterized reliably for PNG export across all browsers

**Critical limitation for our project:** Our export pipeline goes SVG -> PDF via typst/svg2pdf. foreignObject is poorly supported in svg2pdf and resvg/resvg-wasm. Tables rendered this way would break in export. Avoid as a primary strategy.

Sources: [MDN foreignObject](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/foreignObject)

### 1.3 HTML Overlay (DOM Layer on Top of Canvas)

Render the table as a positioned HTML `<div>` or `<table>` element floating above the canvas. Transform it with CSS `transform` to match the canvas zoom/pan.

**Advantages:**
- Full browser layout engine for text, borders, wrapping
- Native text editing, selection, clipboard, IME, accessibility
- Fast to implement initially

**Disadvantages:**
- Synchronizing DOM element position/scale with canvas transforms on every frame
- Z-ordering conflicts: canvas elements cannot render on top of the HTML overlay
- Export requires separately rasterizing the DOM overlay and compositing it
- Scrolling and zooming feel slightly off due to DOM repaint timing vs canvas

**Who uses this:** Konva.js uses this pattern for text editing (textarea overlay during edit, canvas rendering when idle). Excalidraw uses a textarea overlay for its text WYSIWYG editor.

Sources: [Konva editable text](https://konvajs.org/docs/sandbox/Editable_Text.html), [Excalidraw text editor](https://deepwiki.com/excalidraw/excalidraw/5.4-font-management)

### 1.4 Hybrid: Canvas Render + DOM Edit (Recommended)

Render the table on canvas (or as pure SVG elements) for display and export. When the user double-clicks a cell to edit, spawn a positioned `<textarea>` or `<div contenteditable>` overlay for that single cell. On commit, destroy the overlay and re-render the cell on canvas.

**Advantages:**
- Best of both worlds: pixel-perfect rendering + native text editing
- Export pipeline sees only canvas/SVG primitives -- no foreignObject dependency
- Proven pattern used by Figma, Konva, and JointJS

**Disadvantages:**
- Must match font metrics between canvas rendering and DOM overlay precisely
- Slight visual flash when transitioning between display and edit modes

**Recommendation for our project:** Use this approach. Render tables as pure SVG rect/line/text elements in the scene graph. Edit cells via a DOM overlay. Export produces clean SVG that svg2pdf and resvg handle correctly.

Sources: [JointJS inline text editing](https://docs.jointjs.com/learn/features/inline-text-editing/)

---

## 2. Cell Editing

### 2.1 Inline Text Editing on Canvas

Three documented approaches exist for editing text on a canvas surface:

1. **Textarea overlay (most common):** Position a `<textarea>` or `<div contenteditable>` over the cell being edited. Excalidraw, Konva, and Figma all use this. The overlay inherits the cell's font, size, padding, and alignment. On blur or Enter, the text is committed to the data model and the overlay is removed.

2. **Full canvas text engine:** Libraries like Carota implement the entire text editing stack on canvas: character-level positioning, cursor drawing, selection rectangles, clipboard integration. Carota's architecture uses a hierarchy of Document -> Line -> PositionedWord -> PositionedCharacter objects. Drawing is fast because everything is pre-positioned, but the implementation cost is high.

3. **Hybrid contentEditable:** Render text on canvas normally, but switch to a `contentEditable` div on double-click. This is what Google Docs does post-2021 migration -- canvas rendering with a side DOM for editing and accessibility.

Sources: [Carota](https://github.com/danielearwicker/carota), [canvas-text-editor-tutorial](https://github.com/grassator/canvas-text-editor-tutorial)

### 2.2 Cursor Management

When using a canvas text engine, cursor management requires:
- Tracking character positions via `measureText` or a pre-computed glyph map
- Drawing a blinking cursor rectangle at the insertion point (use `requestAnimationFrame` with a 530ms blink interval to match native behavior)
- Handling arrow keys, Home/End, Ctrl+Left/Right (word boundaries), Shift+Arrow (selection)
- A positioned DOM element for the cursor avoids the CPU cost of re-rendering the full canvas on every blink

### 2.3 Selection Across Cells

Multi-cell selection in a table requires:
- **Click-drag selection:** Track mousedown cell, mousemove target cell, compute rectangular selection region
- **Shift+Click:** Extend selection from anchor cell to clicked cell
- **Ctrl+A:** Select all cells (or all cells in the current row/column depending on context)
- **Tab/Shift+Tab:** Move to next/previous cell
- **Enter/Shift+Enter:** Move to cell below/above
- Selection state is a rectangle defined by `{startRow, startCol, endRow, endCol}`, normalized so start <= end

---

## 3. Table Structure

### 3.1 Data Model

A table's internal representation should separate structure from presentation:

```typescript
interface TableElement {
  id: string;
  type: 'table';
  position: { x: number; y: number };
  columns: ColumnDefinition[];
  rows: RowDefinition[];
  cells: Map<string, CellData>;  // key: "row,col"
  mergedRegions: MergedRegion[];
  style: TableStyle;
}

interface ColumnDefinition {
  id: string;
  width: number;        // pixels
  minWidth: number;
  maxWidth: number;
}

interface RowDefinition {
  id: string;
  height: number;
  minHeight: number;
}

interface CellData {
  content: string;       // plain text or LaTeX
  contentType: 'text' | 'latex' | 'number';
  style?: CellStyle;
  metadata?: Record<string, unknown>;
}

interface MergedRegion {
  startRow: number;
  startCol: number;
  rowSpan: number;
  colSpan: number;
}
```

### 3.2 Merged Cells

Merged cells (colspan/rowspan) are the hardest part of table layout. Key rules:
- Store merged regions as a separate list, not as properties on individual cells
- Only the top-left cell of a merged region holds content; other cells in the region are "occluded"
- When calculating layout, a merged cell's width = sum of spanned column widths; height = sum of spanned row heights
- When inserting/deleting rows or columns, merged regions must be updated: split if the insertion bisects a merge, expand if appending to a merged edge
- Notion sidesteps this entirely -- its simple tables do not support merged cells

### 3.3 Nested Tables

Nested tables (a table cell containing another table) add significant complexity. For a scientific figure app, avoid supporting nested tables in the first version. Instead, support:
- Embedding charts/figures in cells (rendered as images)
- Multi-line text with sub-structure (bullet lists in cells)
- LaTeX content for complex cell layouts

### 3.4 Headers

Headers are semantically distinct from data rows:
- Store a `headerRows: number` and `headerColumns: number` property on the table
- Header cells get different default styling (bold, background color)
- Headers are repeated on each page when a table spans multiple pages (relevant for PDF export)
- In LaTeX export, header rows map to the rows above `\midrule`

---

## 4. Sizing and Resize

### 4.1 Column/Row Sizing Modes

| Mode | Description | Use Case |
|---|---|---|
| Fixed | User-specified width in pixels | Precise scientific tables |
| Auto-fit | Width = max(content width) + padding | Default for new tables |
| Proportional | Columns share table width by weight | Responsive layouts |
| Min-content | Smallest width without overflow | Compact tables |

### 4.2 Auto-fit Algorithm

1. For each column, measure the natural width of every cell's content (using `measureText` for canvas or a hidden DOM element for accurate multi-line measurement)
2. Add horizontal padding (2 * cellPadding)
3. Column width = max of all cell content widths in that column
4. If total table width exceeds a maximum, proportionally shrink columns that exceed a threshold
5. Re-wrap text in shrunk columns and recalculate row heights

### 4.3 Resize Handles

- Render thin invisible hit-target zones (8px wide) at column and row boundaries
- On hover, change cursor to `col-resize` or `row-resize`
- On drag, update the column/row definition and re-layout the table
- Snap to content width on double-click (auto-fit single column)
- Enforce `minWidth` / `maxWidth` constraints during drag
- Adjacent column behavior: by default, resizing one column changes only that column's width (table width changes). Optionally, hold Alt to resize the adjacent column inversely (table width stays constant).

### 4.4 Min/Max Constraints

- `minWidth`: typically 30px (enough for "..." ellipsis)
- `maxWidth`: typically unconstrained, but can be set for uniform layouts
- `minHeight`: one line of text + vertical padding
- Constraints must be checked during both manual resize and auto-fit

---

## 5. Styling

### 5.1 Border Models

**Collapsed borders:** Adjacent cells share a single border. This is the scientific standard (booktabs-style). Implementation: draw borders as lines at cell boundaries, not as rectangles around each cell. When two cells specify different border styles, use CSS-like conflict resolution (wider wins, then darker wins, then cell > row > table).

**Separated borders:** Each cell has its own border with spacing between them. Simpler to implement but rarely used in scientific publications. Implementation: draw each cell as a stroked rectangle with a gap.

**Recommendation:** Default to collapsed borders with booktabs-style horizontal rules (thick top/bottom, thin internal). This matches scientific convention.

### 5.2 Cell Padding

- Default: 6px horizontal, 4px vertical (matches booktabs visual spacing)
- Configurable per-cell or per-table
- Padding affects content area but not border position

### 5.3 Alternating Row Colors (Zebra Striping)

- Apply alternating background fills to even/odd data rows (skip header rows)
- Common in supplementary tables but not in formal publications
- Implement as a table-level style toggle, not per-row

### 5.4 Themes

Provide pre-built table themes matching common scientific styles:

| Theme | Description |
|---|---|
| Booktabs | Top/bottom thick rules, thin mid-rule, no vertical lines |
| APA | Similar to booktabs, APA 7th edition spacing |
| Grid | All borders visible, thin lines |
| Minimal | Top and bottom rules only |
| Plain | No borders, no fills |

---

## 6. How Existing Tools Handle Tables

### 6.1 Figma

Figma does not have a native table element. Tables are built from Auto Layout frames:
- Each cell is a component instance inside a row frame
- Rows are stacked in a column frame with auto layout
- Column widths synchronized via component properties
- Resize propagates through auto layout constraints
- This approach is flexible but fragile and verbose -- hundreds of nodes for a moderate table
- Third-party plugins (Table Creator) generate these structures automatically

Source: [Smashing Magazine: Creating Tables in Figma](https://www.smashingmagazine.com/2019/09/creating-tables-in-figma/)

### 6.2 tldraw

tldraw has no native table shape as of v4.4.0. Tables would be implemented as a custom shape via the `ShapeUtil` pattern:
- Define a `TableShapeUtil` extending `ShapeUtil`
- Implement `component()` for rendering (React component that draws to SVG or canvas)
- Implement `indicator()` for selection outline
- Store table data in the shape's `props`
- tldraw's v4.4.0 introduced canvas-based shape indicators (25x faster than SVG indicators), which would benefit table selection rendering

Source: [tldraw custom shapes](https://tldraw.dev/examples/custom-shape), [tldraw v4.4.0](https://github.com/tldraw/tldraw/releases/tag/v4.4.0)

### 6.3 Excalidraw

Excalidraw has no native table element. Multiple GitHub issues request it (issues #4847, #7471, #7491, #8928). As of early 2025, the team had "initiated research" but not shipped a table feature. Users create table-like structures manually by arranging rectangle and text elements on the canvas.

Source: [Excalidraw issue #4847](https://github.com/excalidraw/excalidraw/issues/4847)

### 6.4 Google Docs

Google Docs migrated to canvas-based rendering in 2021. Tables are rendered entirely on canvas with a parallel "side DOM" for accessibility and text editing. This proves the viability of the pure-canvas approach for complex table layouts but required years of engineering from a large team. Their approach:
- Layout engine calculates cell positions, handling merged cells, text wrapping, page breaks
- Canvas draws borders, fills, and text glyphs
- Invisible DOM mirror provides screen reader access
- Text editing uses a hidden `<textarea>` that captures input

Source: [Google Docs canvas rendering](https://thenewstack.io/google-docs-switches-to-canvas-rendering-sidelining-the-dom/)

### 6.5 Notion

Notion uses a block-based architecture. A table is a parent block containing `table_row` child blocks. Key properties:
- `table_width`: number of columns (set at creation, immutable via API)
- `has_column_header`, `has_row_header`: boolean toggles
- Each `table_row` contains an array of rich text arrays (one per cell)
- No merged cells in simple tables
- Database tables (the other table type) are far more powerful but are fundamentally filtered/sorted views of a database, not a drawing element

Source: [Notion data model](https://www.notion.com/blog/data-model-behind-notion), [Notion API: block types](https://developers.notion.com/reference/block)

---

## 7. Math/LaTeX in Table Cells

### 7.1 Rendering Pipeline

Scientific tables frequently contain math: variables, equations, units with superscripts/subscripts, and chemical formulas. Two rendering approaches:

**MathJax `tex2svg()`:** Produces native SVG elements that can be directly composited into the scene graph. Each math expression becomes an SVG group (`<g>`) with paths and glyphs. This is the best approach for our export pipeline because the output is pure SVG -- no foreignObject, no HTML dependencies. MathJax v4 supports server-side rendering and has no DOM dependency.

**KaTeX:** Produces HTML+CSS output (spans with custom fonts). Faster than MathJax (synchronous, ~100KB with fonts). However, KaTeX does not produce SVG output natively (GitHub issue #375 has been open since 2015). To use KaTeX in a canvas/SVG pipeline, you would need to render to HTML, then use foreignObject or html2canvas to rasterize -- both problematic for our export pipeline.

**Recommendation:** Use MathJax `tex2svg()` for math in table cells. Store the LaTeX source string in the cell data model. Render to SVG on change. Cache the rendered SVG. Composite into the table cell region with appropriate alignment.

Sources: [MathJax SVG output](https://docs.mathjax.org/en/v4.0/output/svg.html), [KaTeX SVG issue](https://github.com/KaTeX/KaTeX/issues/375)

### 7.2 Alignment of Math in Cells

- Baseline alignment: align the baseline of math expressions with the baseline of text in adjacent cells
- MathJax SVG output includes a `style` attribute with `vertical-align` indicating the baseline offset
- For numeric columns with `\pm` uncertainties, align on the decimal point using a custom column type
- In LaTeX export, use `S` column type from the `siunitx` package for decimal-aligned numbers

---

## 8. Export Fidelity: Table -> SVG -> PDF Pipeline

### 8.1 Internal Scene Graph to SVG

The table must be flattened to primitive SVG elements for export:

```xml
<g class="table" data-table-id="t1">
  <!-- Background fills -->
  <rect x="0" y="0" width="120" height="30" fill="#f0f0f0"/>
  <!-- Border lines (booktabs style) -->
  <line x1="0" y1="0" x2="300" y2="0" stroke="#000" stroke-width="1.5"/>
  <line x1="0" y1="30" x2="300" y2="30" stroke="#000" stroke-width="0.75"/>
  <line x1="0" y1="180" x2="300" y2="180" stroke="#000" stroke-width="1.5"/>
  <!-- Cell text -->
  <text x="10" y="20" font-family="serif" font-size="12">Variable</text>
  <!-- Math (pre-rendered SVG from MathJax) -->
  <g transform="translate(130, 5)">
    <!-- MathJax SVG output inlined here -->
  </g>
</g>
```

Key principles:
- No `<table>`, `<tr>`, `<td>` elements -- SVG has no table layout
- Positions are absolute, calculated by our layout engine
- Borders are `<line>` elements, not `<rect>` strokes (avoids doubled borders)
- Math is inlined SVG, not foreignObject
- Fonts must be embedded or converted to paths for portability

### 8.2 SVG to PDF

Our pipeline uses typst/svg2pdf (Rust, compiled to WASM). This library handles:
- `<rect>`, `<line>`, `<text>`, `<path>` -- all primitives our table produces
- Font embedding via subsetting
- Gradient fills (for header backgrounds if needed)

It does NOT handle:
- `<foreignObject>` (ignored/dropped)
- CSS `border-collapse` (irrelevant since we use explicit lines)
- External stylesheets

**Fidelity rule:** What the user sees on canvas = what appears in SVG = what appears in PDF. Since our table is rendered as primitive SVG elements, this is achievable. Test every border style, merged cell configuration, and math expression in the full pipeline.

### 8.3 SVG to PNG

Our pipeline uses resvg/resvg-wasm. It handles the same SVG primitives. Tables rendered as rects/lines/text will rasterize correctly. Font rendering may differ slightly from the browser -- test with the exact fonts used.

Sources: [typst/svg2pdf](https://github.com/typst/svg2pdf), [resvg](https://github.com/nicodemus26/resvg)

---

## 9. LaTeX Table Export

### 9.1 Basic tabular

The simplest export maps our table data model to a `tabular` environment:

```latex
\begin{tabular}{l c r}
  \toprule
  Variable & Value & Unit \\
  \midrule
  Mass & 5.0 & kg \\
  Velocity & 3.2 & m/s \\
  \bottomrule
\end{tabular}
```

Column alignment (`l`, `c`, `r`) is derived from the cell text-align property. Requires `\usepackage{booktabs}`.

### 9.2 booktabs Rules

Map our border model to booktabs commands:
- Table top border -> `\toprule` (thick)
- Header/data separator -> `\midrule` (thin)
- Table bottom border -> `\bottomrule` (thick)
- Partial horizontal rules -> `\cmidrule{2-4}` (with optional trim: `\cmidrule(lr){2-4}`)
- No vertical lines (booktabs convention)

### 9.3 multicolumn / multirow

Merged cells map directly:
- Horizontal merge: `\multicolumn{numCols}{alignment}{content}`
- Vertical merge: `\multirow{numRows}{width}{content}` (requires `\usepackage{multirow}`)
- Combined: nest `\multirow` inside `\multicolumn`

Generating correct LaTeX for complex merged layouts is the hardest part. The algorithm:
1. Iterate row by row
2. Track which cells are "occluded" by an active rowspan from a previous row
3. For each visible cell, emit `\multicolumn` if colSpan > 1, `\multirow` if rowSpan > 1
4. For occluded cells in subsequent rows of a multirow, emit empty cells
5. Add `\cmidrule` where horizontal borders exist within the table body

### 9.4 siunitx Integration

For scientific data, generate `S`-type columns (from the `siunitx` package):

```latex
\begin{tabular}{l S[table-format=2.1] S[table-format=1.2]}
  \toprule
  {Variable} & {Value} & {Uncertainty} \\
  \midrule
  Mass   & 5.0 & 0.12 \\
  Length & 12.3 & 0.05 \\
  \bottomrule
\end{tabular}
```

Header cells in `S` columns must be wrapped in `{braces}` to prevent siunitx from parsing them as numbers.

### 9.5 Reference Implementation

The LaTeX Table Editor (latex-tables.com, MIT license) is the best reference for table-to-LaTeX conversion logic. Study its codebase for handling edge cases in border mapping, merged cells, and multi-format export.

Sources: [Overleaf tables guide](https://www.overleaf.com/learn/latex/Tables), [LaTeX Table Editor](https://github.com/JDMCreator/LaTeXTableEditor), [texblog multicolumn/multirow](https://texblog.org/2012/12/21/multi-column-and-multi-row-cells-in-latex-tables/)

---

## 10. Accessibility

### 10.1 The Canvas Accessibility Problem

Canvas content is opaque to screen readers. A table drawn on canvas is invisible to assistive technology unless a parallel accessible structure is provided.

### 10.2 ARIA Grid Pattern

The WAI-ARIA Grid pattern provides the accessibility model for interactive tables:
- Wrap the canvas in a container with `role="grid"`
- Create an invisible (visually hidden, not `display:none`) DOM structure mirroring the table:
  - `role="row"` for each row
  - `role="columnheader"` / `role="rowheader"` for header cells
  - `role="gridcell"` for data cells
- Use `aria-rowcount`, `aria-colcount` for total dimensions
- Use `aria-rowindex`, `aria-colindex` for cell position
- Use `aria-colspan`, `aria-rowspan` for merged cells

### 10.3 Keyboard Navigation

Following the WAI-ARIA Grid pattern:

| Key | Action |
|---|---|
| Arrow keys | Move focus between cells |
| Tab | Move to next interactive element (or next cell if cells are editable) |
| Enter | Begin editing the focused cell |
| Escape | Cancel editing, return focus to cell |
| Ctrl+Home | Move to first cell |
| Ctrl+End | Move to last cell |
| Page Up/Down | Scroll by visible rows |

### 10.4 Screen Reader Announcements

- On cell focus, announce: cell content, row/column position, header associations
- On entering a merged cell, announce the span ("merged across 3 columns")
- Use `aria-live="polite"` regions to announce table state changes (sort, filter)

Sources: [W3C ARIA Grid pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/), [AG Grid accessibility](https://www.ag-grid.com/javascript-data-grid/accessibility/)

---

## 11. Performance

### 11.1 When Virtualization Matters

Performance thresholds for table rendering:
- **< 200 cells:** No optimization needed. Render everything.
- **200 - 5,000 cells:** Simple culling (skip cells outside viewport) is sufficient.
- **5,000 - 100,000 cells:** 2D virtualization required -- only render visible rows AND columns.
- **100,000+ cells:** Canvas rendering outperforms DOM by 10x+. Offscreen canvas caching becomes essential.

For a scientific figure app, most tables will be < 200 cells. Optimize for the common case but support larger tables gracefully.

### 11.2 Viewport Culling

Only draw cells whose bounding box intersects the visible viewport:
1. Compute visible row range: binary search on row Y positions for viewport top/bottom
2. Compute visible column range: binary search on column X positions for viewport left/right
3. Draw only cells in the intersection

This is O(log n) per frame for finding the range, then O(visible cells) for drawing.

### 11.3 Offscreen Canvas Caching

For tables with complex content (math expressions, styled text):
1. Render the table to an `OffscreenCanvas` once
2. On pan/zoom, `drawImage` from the offscreen canvas (single GPU operation)
3. Invalidate and re-render the offscreen canvas only when table data or style changes
4. Use a dirty flag system (like AG Charts): mark cells/rows/columns dirty on change, only re-render dirty regions

### 11.4 Lazy Cell Rendering

For cells containing expensive content (MathJax-rendered LaTeX):
1. Render a placeholder (the LaTeX source text in monospace) immediately
2. Queue the MathJax rendering in a microtask
3. When MathJax completes, cache the SVG result and mark the cell dirty
4. On next frame, composite the cached SVG into the cell

This prevents MathJax rendering from blocking table interaction.

Sources: [Observable table virtualization](https://observablehq.com/blog/table-virtualization-in-observable-canvases), [MDN canvas optimization](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas)

---

## 12. Data Binding and Clipboard Integration

### 12.1 CSV/TSV Paste

When the user pastes into a table, detect tabular data:

```typescript
function handlePaste(event: ClipboardEvent): void {
  const text = event.clipboardData?.getData('text/plain');
  if (!text) return;

  // Detect TSV (from Excel/Google Sheets) or CSV
  const rows = text.split('\n').map(row => {
    if (row.includes('\t')) return row.split('\t');
    // Fall back to CSV parsing (handle quoted fields)
    return parseCSVRow(row);
  });

  // Insert into table starting at focused cell
  insertDataAtSelection(rows);
}
```

### 12.2 Clipboard Formats

When data is copied from Excel, the clipboard contains multiple formats:
- `text/plain`: TSV (tab-separated values)
- `text/html`: HTML `<table>` with styling
- Various proprietary formats (XLSB, SpreadsheetML)

For paste: prefer `text/html` (preserves structure and formatting) with fallback to `text/plain` (TSV).
For copy: write both `text/plain` (TSV) and `text/html` to the clipboard so data round-trips to spreadsheets.

### 12.3 Structured Data Import

Support import from:
- **CSV files:** Via file picker or drag-and-drop. Use a streaming parser for large files (papaparse).
- **JSON arrays:** Array of objects -> columns from keys, rows from values
- **Markdown tables:** Parse pipe-delimited tables (`| col | col |`)
- **LaTeX tabular:** Parse `\begin{tabular}` environments (useful for importing from papers)

### 12.4 Copy as LaTeX

When the user copies a selection of cells, offer "Copy as LaTeX" in addition to plain text:
- Generate a `tabular` snippet for the selected region
- Include `\usepackage` preamble if the user hasn't copied LaTeX before in this session
- This is a differentiating feature for a scientific figure app

Sources: [SheetJS clipboard](https://docs.sheetjs.com/docs/demos/local/clipboard/)

---

## 13. Scientific Table Conventions

### 13.1 Formatting Rules (APA / Scientific Style)

- **No vertical lines.** Horizontal rules only: thick at top/bottom, thin separating header from data.
- **Headers centered, data left-aligned** (text) or **right/decimal-aligned** (numbers).
- **Units in parentheses** below the column header, not repeated in every cell: `Mass (kg)`, not `5.0 kg` in each cell.
- **Table number and title above the table** (e.g., "Table 1. Summary of measurements"). Caption below (notes, sources).
- **Footnotes** use superscript letters (a, b, c), not numbers (to avoid confusion with data).

Source: [USU Engineering Writing Center](https://engineering.usu.edu/students/ewc/writing-resources/tables-figures)

### 13.2 Significant Figures

- All values in a column should have the same number of decimal places
- Uncertainty should have 1-2 significant figures; the value should match precision: `5.03 +/- 0.12`, not `5.032847 +/- 0.12`
- Use scientific notation for very large/small numbers: `1.3 x 10^5`, not `130000`
- The app should offer auto-formatting: detect numeric columns and normalize significant figures

### 13.3 Uncertainty Notation

Common formats the app should support:
- Parenthetical: `5.03(12)` meaning `5.03 +/- 0.12`
- Plus-minus: `5.03 +/- 0.12` (rendered as `5.03 \pm 0.12` in LaTeX)
- Percentage: `5.03 +/- 2.4%`
- Asymmetric: `5.03 +0.15 / -0.10` (rendered with superscript/subscript in LaTeX)

In LaTeX export, use `siunitx` for consistent formatting:
```latex
\num{5.03(12)}          % -> 5.03(12)
\num{5.03 +- 0.12}     % -> 5.03 +/- 0.12
\SI{5.03(12)}{\kilo\gram}  % -> 5.03(12) kg
```

### 13.4 Units

- Store units as metadata on columns, not as cell content
- Render units in the column header: `Velocity (m s^{-1})`
- In LaTeX export, use `siunitx` `\si{}` commands for proper unit formatting
- Support common scientific unit systems (SI, CGS, natural units)

---

## 14. Table Metadata for LLM Consumption

### 14.1 Why Table Metadata Matters

Research shows that structured text representations of visual data outperform vision models for understanding. DePlot (Google, 2023) found that converting charts to tables improved LLM reasoning by 29.4% over vision-based approaches. Tables in our figures should carry machine-readable metadata.

### 14.2 Recommended Formats

**Markdown table (primary -- lowest token cost, highest LLM accuracy):**
Research benchmarking 11 table formats found Markdown-KV achieved 60.7% accuracy on table understanding tasks, roughly 16 points ahead of CSV. Markdown tables are the best default.

```markdown
| Variable | Value | Unit |
|----------|-------|------|
| Mass     | 5.0   | kg   |
| Velocity | 3.2   | m/s  |
```

**CSV (fallback for data-heavy tables):**
More compact for large numeric tables. ~30% fewer tokens than Markdown for pure data.

```
Variable,Value,Unit
Mass,5.0,kg
Velocity,3.2,m/s
```

**JSON (for programmatic consumption):**
Most verbose but unambiguous. Include type annotations.

```json
{
  "caption": "Table 1. Summary of measurements",
  "columns": ["Variable", "Value", "Unit"],
  "types": ["string", "number", "string"],
  "rows": [
    ["Mass", 5.0, "kg"],
    ["Velocity", 3.2, "m/s"]
  ]
}
```

### 14.3 Embedding Strategy

Following our project's dual-representation approach:
- **Rich JSON** (for rendering): Full table data model with styles, merges, positions
- **Compact text** (for LLM, ~50 tokens for a small table): Markdown table with caption
- Embed the compact text in exported PNG (iTXt metadata), SVG (`<metadata>` element), and PDF (XMP metadata)
- Auto-generate the compact text from the data model; protect user edits to captions/descriptions

### 14.4 Merged Cell Representation in Text

Merged cells lose their visual meaning in Markdown. Strategies:
- Repeat the merged cell's content in each spanned position (with a note: `[spans 3 cols]`)
- Use a flat list description: "Row 1: 'Results' spans columns 2-4"
- For LLM consumption, the flat list is more reliable than trying to represent merges in ASCII

Sources: [Table Meets LLM (arXiv)](https://arxiv.org/html/2305.13062v4), [Best input format for LLMs](https://www.improvingagents.com/blog/best-input-data-format-for-llms)

---

## 15. Comparison of npm Libraries for Table Rendering

### 15.1 Canvas-Native Libraries

| Library | Stars | License | Rendering | Max Cells | Key Feature | Limitation |
|---|---|---|---|---|---|---|
| **VTable** (@visactor/vtable) | ~2.5K | MIT | Canvas (VRender engine) | Millions | Scene graph architecture, chart embedding | Large bundle, ByteDance ecosystem |
| **canvas-datagrid** | ~1.8K | BSD-3 | Canvas 2D | Millions | Zero-dep web component, inline editing | Inactive maintenance (last publish 2+ years ago) |
| **Glide Data Grid** | ~3.5K | MIT | Canvas 2D | Millions | React-native, 10K updates/sec | React-only, no framework-agnostic build |
| **LyteNyte Grid** | New | Commercial | Canvas 2D | Millions | ~40KB, zero-dep | Commercial license, limited ecosystem |

### 15.2 DOM-Based Libraries (for Reference/Comparison)

| Library | Stars | License | Rendering | Key Feature | Limitation |
|---|---|---|---|---|---|
| **TanStack Table** | ~27K | MIT | Headless (any renderer) | Most popular, framework-agnostic logic | No rendering -- must build UI |
| **AG Grid** | ~13K | MIT (Community) | DOM + Canvas (charts) | Most complete enterprise grid | Enterprise features require paid license |
| **Tabulator** | ~7.6K | MIT | DOM | Zero-dep, custom export API, LaTeX-exportable | DOM-based, not ideal for canvas integration |
| **Handsontable** | ~20K | Custom (non-commercial free) | DOM | Excel-like spreadsheet UX | Non-commercial license for free tier |
| **RevoGrid** | ~2.8K | MIT | DOM (Web Component) | Framework-agnostic, millions of rows | Less mature ecosystem |

### 15.3 Evaluation for Our Project

**VTable is the strongest candidate** if we want to embed an existing canvas table library. Its scene-graph architecture (VRender engine) aligns with our custom rendering approach, and it supports chart embedding within cells. However, its bundle size is large and it introduces a dependency on the ByteDance VisActor ecosystem.

**TanStack Table is the best headless option** if we want to own the rendering. It provides the data model, sorting, filtering, grouping, and column sizing logic. We plug in our own canvas/SVG renderer. This is the most architecturally clean approach for a custom drawing app.

**Tabulator is best for LaTeX export** due to its custom download formatter API, which makes writing a LaTeX serializer straightforward.

**Recommendation:** Use TanStack Table for the data model and interaction logic. Implement our own SVG-based renderer that produces clean primitives for the export pipeline. Reference Tabulator's export API design and LaTeX Table Editor's serialization logic for the LaTeX export feature.

Sources: [VTable GitHub](https://github.com/VisActor/VTable), [canvas-datagrid](https://github.com/TonyGermaneri/canvas-datagrid), [TanStack Table](https://tanstack.com/table), [Tabulator](https://github.com/olifolkerd/tabulator)

---

## Summary of Recommendations

| Decision | Recommendation | Rationale |
|---|---|---|
| Rendering approach | Hybrid: SVG scene graph + DOM overlay for editing | Clean export pipeline, native text editing |
| Data model | TanStack Table (headless) + custom renderer | Separation of logic and rendering |
| Cell editing | Positioned textarea overlay on double-click | Proven pattern (Figma, Konva, Excalidraw) |
| Border style | Collapsed, booktabs-default | Scientific convention |
| Math in cells | MathJax `tex2svg()`, cached | Pure SVG output for export fidelity |
| LaTeX export | booktabs + siunitx + multirow | Standard scientific LaTeX |
| Accessibility | ARIA grid with hidden DOM mirror | WAI-ARIA Grid pattern |
| LLM metadata | Markdown table (primary), CSV (fallback) | Highest LLM accuracy per token |
| Performance | Viewport culling + offscreen canvas cache | Sufficient for scientific tables (< 200 cells typical) |
| Clipboard | TSV paste/copy + "Copy as LaTeX" | Interop with Excel/Sheets + scientific workflow |
