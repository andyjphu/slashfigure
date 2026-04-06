# Project: Scientific Figure Drawing App

## Context
A scientific figure drawing app hosted as a website (Cloudflare Pages). Figma-like but more performant and minimalist, where every element added is an annotation in metadata. The metadata includes spatial descriptions, ASCII approximations, and LLM-friendly representations of the drawing.

## Navigation
Refer to `docs/TABLE_OF_CONTENTS.md` for a complete index of all project documentation (features, infrastructure, research).

## Code Quality Standards
All code must be LLM-readable, maintainable, and well-structured. See `docs/infra/code-quality.md` for full rules. Key points:
- **150-500 lines per file**, one responsibility per file
- **Descriptive names** -- no abbreviations. `calculateBoundingBox()` not `calcBB()`
- **TypeScript strict mode** with explicit type annotations
- **"Why" comments** on non-obvious decisions, never "what" comments
- **Explicit over implicit** -- no metaprogramming, no eval, no magic, no implicit global state
- **Composition over inheritance**, max 1-2 levels of inheritance
- **Consistent patterns everywhere** -- if you do X one way, always do it that way
- **Functions: 20-40 lines**, one testable responsibility
- **Flat directories** grouped by feature, max 3-4 levels deep

## Key Architectural Decisions

### Stack
- **Hosting:** Cloudflare Pages + Cloudflare Worker (LLM proxy)
- **Framework:** SolidJS (UI shell) + custom signal-based engine (canvas core)
- **Rendering:** Custom Canvas 2D scene graph, dual export pipeline (SVG+PNG from SVG path, PDF direct from scene graph)
- **Language:** TypeScript (strict mode)
- **Build:** Vite + pnpm

### Engine Architecture (src/engine/)
- **CanvasEngine** -- slim coordinator (~470 lines). Owns lifecycle, delegates input to tools, bridges to SolidJS UI via EngineStore.
- **Tool system** -- each tool (select, rectangle, text, arrow, freehand) is its own class implementing the `Tool` interface (`onPointerDown/Move/Up`, `getCursor`). Registered in `ToolRegistry`. Adding a new tool = one class + one line in registry.
- **Node registry** -- `NodeRegistry` maps `ElementType` to layer label, icon name, and selection style. Adding a new node type = one class + one `registerNodeType()` call. Layers panel, serializer, and renderer all read from the registry.
- **EngineContext** -- interface passed to tools, providing access to sceneGraph, viewport, undoManager, selection, and rendering without coupling tools to the full engine.
- **Code splitting** -- PDF exporter (pdfkit, 1.4MB) and SVG exporter are lazy-loaded via dynamic `import()`.

### Export: PDF-primary, pixel-perfect, dual pipeline
- **Dual export:** Scene graph → SVG (for SVG export + resvg-wasm PNG) AND Scene graph → PDF directly (pdfkit, no SVG translation layer)
- PDF is the first-class export because LaTeX uses `\includegraphics` with PDF
- What user sees on canvas = what they see in SVG = what they see in PDF. Zero tolerance for differences.
- Libraries: @resvg/resvg-wasm (SVG→PNG), pdfkit (scene graph→PDF direct), Harfbuzz WASM (font subsetting)
- Each element implements both `toSvg()` and `toPdf()` methods
- See `docs/infra/export.md` for full architecture

### Metadata (validated by research)
- Dual representations: rich JSON (rendering) + compact text (LLM, ~50 tokens)
- Scene graph extraction (VisText pattern): flatten via DFS for LLM input
- Metadata panel visible to user, auto-generated, user edits are protected
- Optionally embedded in exported PNG/SVG/PDF so LLMs can read figures without vision
- See `docs/features/metadata-panel.md`

### Project Format
- Two modes: **Single File** (`.sf` zip) or **Working Directory** (`.slashfigure/` folder)
- Working Directory includes `metadata.md` for git-trackable diffs of figure changes
- Multi-page support (tabs)
- Autosave to IndexedDB (1.5s debounce), saves on page unload, restores on load
- See `docs/features/project-format.md`, `docs/UX/project-creation.md`

### Theme
- All accent colors, selection colors, default element colors, and UI class fragments are centralized in `src/engine/theme.ts`. Change the accent color in one place.

## Source Structure
```
src/
├── App.tsx                    -- SolidJS root, wires UI to engine
├── index.tsx, styles.css
├── engine/
│   ├── CanvasEngine.ts        -- slim coordinator
│   ├── Renderer.ts            -- canvas 2D drawing
│   ├── SceneGraph.ts          -- document > page > elements tree
│   ├── Viewport.ts            -- zoom, pan, coordinate spaces
│   ├── Transform.ts           -- affine matrix math
│   ├── UndoManager.ts         -- command pattern with coalescing
│   ├── AutoSave.ts            -- IndexedDB with debounce
│   ├── Serializer.ts          -- scene graph to/from JSON
│   ├── SvgExporter.ts         -- scene graph → SVG (code-split)
│   ├── PdfExporter.ts         -- scene graph → PDF via pdfkit (code-split)
│   ├── MetadataGenerator.ts   -- text summary + ASCII art + JSON
│   ├── ResizeHandle.ts        -- handle positions and resize math
│   ├── EngineStore.ts         -- SolidJS signal bridge
│   ├── theme.ts               -- centralized colors and style tokens
│   ├── cursors.ts             -- custom CSS cursors
│   ├── tools/
│   │   ├── Tool.ts            -- interface
│   │   ├── EngineContext.ts   -- context interface for tools
│   │   ├── ToolRegistry.ts    -- one-line registration
│   │   ├── SelectTool.ts      -- select, move, resize, rotate, vertex, marquee
│   │   ├── RectangleTool.ts
│   │   ├── TextTool.ts
│   │   ├── ArrowTool.ts
│   │   └── FreehandTool.ts
│   ├── nodes/
│   │   ├── BaseNode.ts        -- abstract base with vertex interface
│   │   ├── NodeRegistry.ts    -- type → layer label, icon, selection style
│   │   ├── RectangleNode.ts
│   │   ├── PathNode.ts        -- arrows, lines, polygons
│   │   ├── TextNode.ts
│   │   ├── ImageNode.ts
│   │   ├── FreehandNode.ts
│   │   └── GroupNode.ts
│   └── types/index.ts
└── ui/
    ├── Toolbar.tsx             -- left sidebar: file menu, tools grid, layers
    ├── PropertiesPanel.tsx     -- right sidebar: transform, fill, stroke, opacity
    ├── MetadataPanel.tsx       -- right sidebar bottom: text/ASCII/JSON tabs
    └── StatusBar.tsx           -- zoom %, selection count
```

## UX Decisions
Style decisions, interaction patterns, and UI layout choices go in `docs/UX/`.
- Project creation flow with visual mode selector: `docs/UX/project-creation.md`
- Save dialog: cursor placed before `.sf` so user can prepend project name
- Layout: left sidebar (file menu + tools + layers), right sidebar (properties + metadata)
- Tools stay active after use until user explicitly switches (no auto-revert to select)
- Metadata generation must be modular in code -- easy for an LLM developer to adjust algorithms, add new element types, and modify output format without touching unrelated code

## Research Docs
All research is in `docs/research` with index at `docs/research/research_table_of_contents.md`.
Avoid reading subfolders under `docs/research/<name>/` unless necessary -- they are from an initial study.
76 sources documented across: canvas frameworks, charting, LaTeX, tables, annotation standards, SVG/spatial, ASCII/text diagrams, code-to-figure, LLM+visual, collaboration/state, scientific tools.
