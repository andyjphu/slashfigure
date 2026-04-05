# tldraw

- **Full Name:** tldraw
- **URL:** https://github.com/tldraw/tldraw
- **Stars:** ~46,200
- **License:** Custom commercial (1.x was MIT)
- **Language:** TypeScript

## What It Does
Infinite canvas SDK for React with a complete drawing/diagramming/whiteboarding engine. Default shapes (arrows, geo, text, notes, frames, images, draw, lines), selection/transformation, geometry-based hit-testing, and a reactive record store with undo/redo.

## Architecture
- **Rendering:** HTML/SVG DOM-based. Shapes render as React components with CSS transforms.
- **Data Model:** `@tldraw/store` reactive record store. All state in `TLStore` with immutable `TLRecord` entries. Records use branded IDs (`TShapeId`, `TBindingId`).
- **Scene Graph:** `SpatialIndexManager` uses **rbush** R-tree for O(log n) hit testing and viewport culling.
- **State Machines:** Hierarchical state machines for tools: `RootState > SelectTool > Idle/Pointing/Dragging`.
- **Reactivity:** Custom fine-grained `Atom<T>`, `Signal<T>`, computed values (not Redux).

## Key for Our Project
- **`meta` field on every shape** -- `Record<string, any>` for arbitrary metadata. This is how we'd attach scientific annotations.
- **ShapeUtil pattern** for custom shapes:
  ```typescript
  class MyShapeUtil extends ShapeUtil<MyShape> {
    static type = 'my-shape'
    static props = { w: T.number, h: T.number, label: T.string }
    getDefaultProps() { return { w: 100, h: 100, label: '' } }
    getGeometry(shape) { return new Rectangle2d({...}) }
    component(shape) { return <HTMLContainer>...</HTMLContainer> }
  }
  ```
- **BindingUtil** for shape-to-shape relationships (arrows, connections).
- **JSON serialization** via `getStoreSnapshot()` / `loadStoreSnapshot()` with versioned migrations.
- **AI integration** -- tldraw already sends both screenshots AND simplified shape data to LLMs. Their shape extraction pattern is a direct template for our metadata generator.
- **Mark-based undo/redo** groups multiple changes into single undo steps.

## Concerns
- Commercial license for v2+. Not free for commercial use.
- DOM-based rendering limits scalability to thousands of shapes.
