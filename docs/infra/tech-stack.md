# Technology Stack

## Decision: SolidJS + Custom Canvas Engine + Vite + pnpm + Tailwind

## Frontend Framework
| Option | Pros | Cons | Fit |
|---|---|---|---|
| SolidJS | True fine-grained reactivity, no VDOM, best perf for canvas state | Smaller ecosystem, fewer devs know it | Best for perf-first |
| React | Largest ecosystem, tldraw/Excalidraw use it, most hires know it | VDOM overhead, need Jotai/signals for canvas perf | Best for ecosystem |
| Svelte 5 | Runes (signal-like), good DX, small bundle | Smaller ecosystem than React | Good middle ground |
| Vanilla + signals | Maximum control, zero framework overhead | Most work, no component ecosystem | Best for minimal bundle |

## Rendering
| Option | Pros | Cons | Fit |
|---|---|---|---|
| Custom Canvas 2D scene graph | Full control, metadata-first design | Most work upfront | **Recommended** |
| Konva.js | Scene graph built-in, react-konva | Framework constraints, fight it for custom behavior | Good fallback |
| Fork Excalidraw | MIT, fast start, proven | 120K-star codebase debt, hand-drawn aesthetic | Not recommended |

## Key Libraries (Tentative)
| Layer | Library | Why |
|---|---|---|
| Spatial index | rbush | O(log n) hit-testing, tldraw-proven |
| Math rendering | MathJax (`tex2svg()`) | Native SVG output composites directly into scene graph. No KaTeX -- it produces HTML, not SVG, and we've banned foreignObject. |
| Tables | TanStack Table + custom canvas/SVG renderer | Headless table logic (sorting, merging, resize) + our own rendering. Tabulator is DOM-only. |
| Freehand | perfect-freehand | Gold standard pressure-sensitive strokes |
| SVG export | SVG.js | `data-*` attrs persist metadata through serialization |
| Path ops | svg-path-commander | DOM-free hit-testing and bbox computation |
| State management | SolidJS signals + stores (UI), custom signals (canvas core) | Fine-grained reactivity for canvas |
| Build tool | Vite | Fast HMR, ESM-native, works with all frameworks |
| Language | TypeScript | Type safety for complex scene graph + metadata |

## Build & Dev
- **Bundler:** Vite
- **Language:** TypeScript (strict mode)
- **Package manager:** pnpm (fast, disk-efficient)
- **Monorepo:** pnpm workspaces (`packages/core`, `packages/app`, `packages/export`)

## Resolved Decisions
- **Framework:** SolidJS (UI shell) + custom signal engine (canvas core). See `docs/infra/framework.md`.
- **Monorepo:** Yes, pnpm workspaces. Root is `slashfigure/` (the repo). Structure:
  - `packages/core` -- scene graph, spatial index, metadata engine (framework-agnostic)
  - `packages/app` -- SolidJS UI shell
  - `packages/export` -- SVG/PDF/PNG/LaTeX exporters
- **Testing:** Vitest (unit tests for core engine), Playwright (E2E for interactions), pixel-diff CI (export consistency).
- **CSS:** Tailwind. Fast iteration, utility-first, no naming debates. Works well with SolidJS via Vite.
