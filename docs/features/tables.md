# Tables

## Overview
Tables are first-class drawing elements. They render visually on the canvas AND produce LaTeX `tabular` source code that the user can see and copy in real time.

## Behavior

### Creation
- Click "Table" tool → drag to place → specify rows x columns
- Default: 3x3, editable after placement

### Editing
- Double-click a cell to edit its content
- Tab to move between cells
- Add/remove rows and columns via context menu or keyboard shortcuts
- Cell merging (multicolumn/multirow) -- deferred to v1.1 (touches every part of table system: layout, rendering, selection, export, metadata)

### Live LaTeX Preview
As the user modifies the table, a live preview shows the LaTeX source:
```latex
\begin{tabular}{|l|c|r|}
\hline
Group & Mean & SD \\
\hline
Control & 3.2 & 0.4 \\
Treatment & 5.1 & 0.6 \\
\hline
\end{tabular}
```
This preview is shown in the element's toolbox popup and/or the metadata panel.

### Copy as LaTeX
One-click button copies the LaTeX tabular code to clipboard. The code should be clean, human-readable, and directly pasteable into a `.tex` document.

### Export
- **Visual export (PNG/SVG/PDF):** Renders the table as it appears on canvas
- **LaTeX export:** Outputs the `tabular` environment code
- The table element stores both representations

### Styling
- Pre-built themes: booktabs (scientific default), APA, grid, minimal, plain
- Column/row resize via drag handles
- Border styles: collapsed vs separated, per-edge control
- Colored cells and alternating row shading deferred (see `docs/deferred.md` -- LaTeX `\cellcolor`/`\rowcolor` requires `colortbl` package)

### Data
- CSV/TSV paste detection and import
- "Copy as LaTeX" button
- Clipboard integration (paste from Excel/Google Sheets)

### Math in Cells
- Wrap in `$...$` for inline math, `$$...$$` for display math
- Rendered via MathJax `tex2svg()` (not KaTeX -- must be native SVG for export pipeline)
- Scientific conventions: significant figures, uncertainty notation (e.g. `3.2 ± 0.1`), units via siunitx

### LaTeX Export
- `booktabs` package output by default (`\toprule`, `\midrule`, `\bottomrule`)
- `\multicolumn{}{}{}` and `\multirow{}{}{}` for merged cells (deferred to v1.1 with merged cells feature)
- `siunitx` `S` column type for numerical alignment
- Clean, human-readable, directly pasteable into `.tex`

## Implementation
- **Table logic:** TanStack Table (headless) for column/row management, merging, resize logic
- **Rendering:** Hybrid -- Canvas 2D for table chrome (borders, fills), DOM overlay for cell editing (contenteditable)
- **SVG export:** Pure SVG primitives (`<rect>`, `<line>`, `<text>`, `<tspan>`). No foreignObject.
- **PDF export:** Direct scene graph → pdfkit primitives
- **LLM metadata:** Markdown-KV format (best accuracy per research at 60.7%)

## Resolved Decisions
- **Scope:** Tables in v1 include: rows/columns, resize, math in cells, booktabs themes, CSV paste, LaTeX export. Merged cells deferred to v1.1.
- **Header row:** Yes. Bold text + bottom border. Maps to `\midrule` in booktabs.
- **Column alignment:** Yes. Left/center/right per column. Maps to LaTeX `{l c r}`.
- **Math in cells:** Yes. MathJax `tex2svg()` for rendering (native SVG, no foreignObject). Store LaTeX source in scene graph.
- **Cell editing:** DOM overlay (contenteditable div), same as main text editing approach.
