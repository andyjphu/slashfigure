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

### Export: PDF-primary, pixel-perfect, dual pipeline
- **Dual export:** Scene graph → SVG (for SVG export + resvg-wasm PNG) AND Scene graph → PDF directly (pdfkit/jsPDF, no SVG translation layer)
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
- Two modes: **Single File** (`.slashfigure` zip) or **Working Directory** (`.slashfigure/` folder)
- Working Directory includes `metadata.md` for git-trackable diffs of figure changes
- Multi-page support (tabs)
- Autosave on close + every 10 min, user-triggered snapshots with branching
- See `docs/features/project-format.md`, `docs/UX/project-creation.md`

## UX Decisions
Style decisions, interaction patterns, and UI layout choices go in `docs/UX/`.
- Project creation flow with visual mode selector: `docs/UX/project-creation.md`
- Save dialog: cursor placed before `.slashfigure` so user can prepend project name
- Layout: left sidebar (tools), right sidebar (properties + metadata tabs)
- Metadata generation must be modular in code -- easy for an LLM developer to adjust algorithms, add new element types, and modify output format without touching unrelated code

## Research Docs
All research is in `docs/research` with index at `docs/research/research_table_of_contents.md`.
Avoid reading subfolders under `docs/research/<name>/` unless necessary -- they are from an initial study.
76 sources documented across: canvas frameworks, charting, LaTeX, tables, annotation standards, SVG/spatial, ASCII/text diagrams, code-to-figure, LLM+visual, collaboration/state, scientific tools.
