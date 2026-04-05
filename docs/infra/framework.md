# Framework Decision: SolidJS vs Vanilla Signals

## Context
The app is a canvas-based drawing tool. Most of the visual surface is a single `<canvas>` element. The framework manages the surrounding UI (toolbars, panels, dialogs, metadata panel). Canvas rendering is always imperative -- no framework helps there.

## SolidJS

### Pros
- **True fine-grained reactivity** -- signals compile to direct DOM updates, no VDOM diffing
- **7.6 KB gzipped** (vs React's ~40KB)
- **JSX familiarity** -- same mental model as React but faster
- **Stores** use Proxies to create trees of independently-tracked signals, ideal for scene graph state
- **Ecosystem exists:** Kobalte (Radix-equivalent), Solid UI (shadcn-equivalent), solid-router
- **Devtools** exist (early, Chrome/Firefox extension)
- **Path-based updates:** `setStore("shapes", shapeId, "position", "x", 100)` -- only watchers of that specific x-coordinate fire
- Growing influence: Angular, Svelte, React all adopting signals pattern

### Cons
- Smaller community (~1.49M weekly npm downloads vs React's 25M+)
- Fewer developers know it
- v2.0 under development (migration risk)
- Most canvas-specific value is limited to the UI chrome, not the canvas itself
- Store proxy overhead may be measurable during bulk operations (thousands of shapes)

### Canvas Integration Pattern
```
App (SolidJS)
  ├── Toolbar (SolidJS DOM components)
  ├── Canvas (<canvas ref={canvasRef}>)
  │   └── createEffect(() => { /* bridge state → draw calls */ })
  ├── PropertiesPanel (SolidJS DOM)
  ├── MetadataPanel (SolidJS DOM)
  └── LayersPanel (SolidJS DOM)
```

## Vanilla Signals (tldraw-style)

### Pros
- **Maximum control** -- purpose-built for canvas workloads
- **Smallest bundle** (~1-3 KB for signal primitives)
- **No framework migration risk** -- you own it
- tldraw's Signia solves problems SolidJS stores don't:
  - Clock-based caching (always-on, not just when observed)
  - Incremental derivations (recompute only affected items in collections)
  - Built-in transactions with rollback
- Core reactive primitives fit in ~50-100 lines. Full system (transactions, batching, incremental): ~500-2000 lines.

### Cons
- **No component model** -- must build or vendor all UI (toolbars, dialogs, dropdowns, color pickers)
- **No devtools** -- console.log debugging only
- **No HMR** without manual setup
- **No testing utilities** -- manual test harness
- **All maintenance is yours** -- every edge case, every bug

### What You Must Build Yourself
- Component system (or use Web Components / lit-html)
- Routing (if needed)
- Error boundaries
- All UI widgets (toolbar, color picker, dropdown, modal, tooltip...)
- Hot module replacement integration

## Performance Comparison

**For the canvas itself: identical.** Both call the same `ctx.fillRect()` / `ctx.stroke()` etc. Framework overhead is zero for canvas rendering.

**For UI chrome:** SolidJS is ~5% slower than vanilla JS in benchmarks. Unmeasurable in practice for toolbar/panel UI.

**For state management:** tldraw's Signia is purpose-built for large scene graphs with incremental derivations. SolidJS stores are general-purpose reactive proxies. For thousands of shapes with complex derived state, Signia-style wins. For simpler state, no difference.

## Recommendation

**SolidJS for the application shell + custom signal-based engine for the canvas core.**

Rationale:
- The canvas engine (scene graph, rendering, hit-testing, undo/redo) must be framework-agnostic. It's the core IP. Build it with custom signals/stores.
- The UI (toolbars, panels, dialogs, metadata view) is standard web UI. SolidJS handles this with minimal overhead and good DX.
- This is what tldraw does (custom reactive core + React shell) and what Excalidraw does (custom canvas engine + React wrapper).
- Clean boundary: `packages/core` (framework-agnostic engine) + `packages/app` (SolidJS shell)

## Resolved Decisions
- **SolidJS confirmed.** SolidJS for UI shell + custom signal-based engine for canvas core. SolidJS saves ~80-130 hours of UI component work vs from-scratch, with no measurable performance cost (canvas draw calls are identical either way; the framework only manages UI chrome).
- **Kobalte** for accessible UI primitives (dropdowns, dialogs, tooltips). Custom styling with Tailwind.
- **Plain SolidJS SPA via Vite.** No SSR needed for a canvas app. SolidStart adds server complexity we don't use. SPA = Single Page Application -- entire app loads as one HTML file, all navigation client-side.
