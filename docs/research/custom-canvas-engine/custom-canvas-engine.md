# Custom Canvas 2D Rendering Engine -- Research Document

This document covers how to build a custom Canvas 2D rendering engine from scratch, targeting a scientific figure drawing app with SolidJS and a signal-based architecture. It synthesizes patterns from Figma, tldraw, Excalidraw, Konva, and Fabric.js alongside general graphics programming techniques.

---

## 1. Scene Graph Architecture

### Node Types

A scene graph is a tree of nodes representing every drawable object. Typical node hierarchy:

- **BaseNode** -- abstract root: `id`, `name`, `parent`, `children[]`, `visible`, `locked`, `opacity`, `localTransform`, `worldTransform`, `boundingBox`
- **GroupNode** -- container with no visual output, propagates transforms to children
- **ShapeNode** -- rectangle, ellipse, line, path, polygon, arrow
- **TextNode** -- text with font, size, alignment, wrapping, and inline editing state
- **ImageNode** -- raster bitmap with crop and filters
- **CompoundNode** -- grouped shapes that act as one unit (e.g., a labeled arrow)

Each node stores its own local transform (position, rotation, scale, skew) and a cached world transform derived from its ancestors.

### Tree Structure

The scene graph is a strict tree (each node has exactly one parent). The root is a **Document** node containing **Page** nodes, each containing element nodes. Traversal during rendering uses depth-first pre-order (parent renders before children, children render in z-order). The tree doubles as the structure for metadata extraction -- a DFS flattening produces the ordered list of elements for LLM-friendly representations.

tldraw stores its shapes in a flat record store (`TLStore`) keyed by ID, with `parentId` references forming a virtual tree. Excalidraw uses a flat array where array order determines z-index. Konva uses a true in-memory tree: `Stage > Layer > Group > Shape`. For a scientific figure app, a hybrid approach is recommended: a flat store for persistence and signals, with a computed tree for rendering and hit testing.

### Dirty Flagging

The dirty flag pattern (from [Game Programming Patterns](https://gameprogrammingpatterns.com/dirty-flag.html)) avoids redundant recalculation. Each node has a `dirty` boolean. When a property changes (fill, stroke, position, size), the node and its ancestors are marked dirty. During the render pass, only dirty subtrees are re-rendered. After rendering, dirty flags are cleared.

Dirty flags apply at multiple levels:
- **Transform dirty** -- local transform changed, world transform needs recomputation. Propagates upward to parent (bounding box changed) and downward to children (inherited transform changed).
- **Visual dirty** -- fill, stroke, opacity, or other visual property changed. Does not propagate to children.
- **Layout dirty** -- size or text content changed, requiring text reflow or auto-layout recalculation.

Fabric.js implements this with a `dirty` property on each object. When the object's cache is marked dirty, the next render cycle re-renders the object to its offscreen cache canvas before compositing. See [Fabric.js Object Caching](https://fabricjs.com/docs/fabric-object-caching/).

### Render Order (Z-Index)

Render order is determined by tree traversal order. Children render on top of parents; siblings render in order. To change z-order within siblings, reorder the `children[]` array. Figma uses **fractional indexing** -- z-order is a base-95 string between 0 and 1, allowing arbitrary insertion without reindexing. This avoids the array-shuffle problem when moving one object forward/backward.

For layers (like a background grid, static content, and interactive overlays), use separate canvas elements stacked via CSS `z-index`. Konva does exactly this -- each `Layer` gets its own `<canvas>` DOM element, so static layers never re-render when interactive layers update. See [Konva Layer Management](https://konvajs.org/docs/performance/Layer_Management.html).

---

## 2. Rendering Loop

### requestAnimationFrame

The rendering loop uses `requestAnimationFrame` (rAF) to synchronize with the browser's display refresh rate (typically 60 Hz). A single rAF callback orchestrates: (1) process pending state changes, (2) recompute dirty transforms, (3) render dirty regions, (4) clear dirty flags.

```
function renderLoop() {
  if (sceneIsDirty) {
    updateTransforms(root);
    renderScene(context, root);
    sceneIsDirty = false;
  }
  requestAnimationFrame(renderLoop);
}
```

Excalidraw runs two loops: the static canvas re-renders only when `sceneNonce` changes (throttled), while the interactive canvas runs on every animation frame for cursors, selection handles, and snap lines. See [Excalidraw Canvas Rendering Pipeline](https://deepwiki.com/excalidraw/excalidraw/5.1-canvas-rendering-pipeline).

### Dirty-Rect Rendering

Full redraws clear the entire canvas and re-render every node on every frame. This is simple but expensive for large scenes. Dirty-rect rendering tracks which rectangular regions changed, clips the canvas to those regions, and redraws only the affected objects.

Algorithm:
1. Collect bounding boxes of all changed nodes (old position + new position).
2. Merge overlapping rectangles into a union set.
3. For each dirty rect: `context.save()`, `context.beginPath()`, `context.rect(...)`, `context.clip()`, clear the region, render all objects intersecting the region, `context.restore()`.

Apache ECharts 5 adopted dirty-rect rendering and saw drawcall counts drop from ~366 to ~28 in UI-heavy scenes. The trade-off: tracking dirty regions adds bookkeeping complexity and can produce visual artifacts if regions are miscalculated. See [Apache ECharts Dirty Rectangle Rendering](https://apachecon.com/acasia2021/sessions/1087.html).

### Full Redraws vs Incremental

For a scientific figure app with typically tens to low hundreds of objects, full redraws are often fast enough (sub-2ms for <200 shapes). Dirty-rect rendering becomes worthwhile above ~500 objects or when complex objects (images, filtered shapes) dominate. A pragmatic approach: start with full redraws, profile, and add dirty-rect optimization only where needed.

---

## 3. Hit Testing

Hit testing answers: "which object is under this point?" Three approaches exist, each with different trade-offs.

### Geometric Hit Testing

Test the pointer coordinate against each shape's mathematical definition. For rectangles, check point-in-rect. For ellipses, check `(x-cx)^2/rx^2 + (y-cy)^2/ry^2 <= 1`. For paths, use the winding number algorithm or `Path2D` with `context.isPointInPath()`. This is the most common approach for Canvas 2D apps.

Advantages: precise, no extra memory, works at any zoom level. Disadvantages: complex for curves and compound paths; must account for stroke width and line joins.

### Pixel-Based Hit Testing (Color Picking)

Render each shape with a unique solid color to a hidden "hit canvas." To test a point, read the pixel color at that coordinate and map it back to the shape. This is Konva's approach -- each `Layer` maintains a hidden hit graph canvas alongside the visible scene canvas. See [Konva Custom Hit Region](https://konvajs.org/docs/events/Custom_Hit_Region.html).

Advantages: automatically handles any shape complexity, including strokes and shadows. Disadvantages: extra memory (one canvas per layer), must re-render hit canvas when objects move, resolution-dependent (thin lines can be missed at low resolutions). Konva allows configuring `hitCanvasPixelRatio` (e.g., 0.5 for 1/4 memory).

### Spatial Indexing

For scenes with many objects, iterating every shape for every pointer event is slow. Spatial indexes accelerate the query.

- **R-tree (RBush)**: Dynamic R-tree that supports insert, remove, and bulk-load. Ideal for interactive editors where objects move frequently. Queries like "all items in this bounding box" run hundreds of times faster than linear scan. See [RBush on GitHub](https://github.com/mourner/rbush).
- **Flatbush**: Static R-tree -- immutable after construction but faster indexing and lower memory than RBush. Best for read-heavy scenarios like exported/static figures. See [Flatbush on GitHub](https://github.com/mourner/flatbush).
- **Quadtree**: Recursively subdivides 2D space into quadrants. Simpler to implement than R-tree but less efficient for non-uniform object distributions and non-point data.

Recommended approach: use RBush as a broadphase to get candidate shapes, then geometric testing as a narrowphase for exact hit detection. Rebuild the spatial index on bulk operations; update incrementally on single-object moves.

---

## 4. Selection System

### Single Selection

Click on an object to select it. The hit test returns the topmost object under the pointer. Selected objects display handles (resize, rotate) rendered on the interactive overlay canvas.

### Multi-Selection

Shift+click adds/removes objects from the selection set. A rectangular marquee (click-drag on empty space) selects all objects whose bounding boxes intersect or are contained within the marquee rectangle. The intersection test uses the spatial index for efficiency.

### Group Selection

Groups behave as a single selectable unit. First click selects the group; double-click or Enter drills into the group to select individual children. Escape exits the group context. This is the standard Figma/tldraw pattern.

### Lasso Selection

Freeform selection draws a polygon path. After the path closes, test each object's center (or bounding box corners) against the polygon using the ray-casting point-in-polygon algorithm: cast a ray from the test point; count intersections with polygon edges; odd count = inside. See [UiB Lasso Selection Paper](https://bora.uib.no/bora-xmlui/bitstream/handle/1956/22873/report.pdf).

### Click-Through

When objects overlap, repeated clicks on the same spot cycle through the z-stack. Implementation: after a click selects the topmost object, a subsequent click within a short time window (300ms) and within a small radius (5px) selects the next object below it in z-order. Figma implements this with Alt+click to select objects behind the current selection.

---

## 5. Transform System

### Local vs World Transforms

Every node has a **local transform** (relative to its parent) and a **world transform** (relative to the canvas origin). The world transform is the product of all ancestor local transforms:

```
worldTransform = parent.worldTransform * localTransform
```

A 2D affine transform is represented as a 3x3 matrix (or the six meaningful values `[a, b, c, d, tx, ty]` matching the `DOMMatrix` / `CanvasRenderingContext2D.setTransform()` API):

```
| a  c  tx |     | scaleX  skewX   translateX |
| b  d  ty |  =  | skewY   scaleY  translateY |
| 0  0  1  |     | 0       0       1          |
```

### Matrix Math

Common operations:
- **Translate**: multiply by `[1, 0, 0, 1, tx, ty]`
- **Scale**: multiply by `[sx, 0, 0, sy, 0, 0]`
- **Rotate**: multiply by `[cos(a), sin(a), -sin(a), cos(a), 0, 0]`
- **Inverse**: needed for converting screen coordinates to local coordinates (for hit testing inside transformed/rotated objects)

The Canvas 2D API provides `setTransform(a, b, c, d, e, f)` which sets the transform directly rather than accumulating. Use this for each node's render call by applying its world transform.

### Parent-Child Inheritance

When a parent moves, all children move with it -- their world transforms are recomputed by multiplying the new parent world transform with each child's unchanged local transform. This is where dirty flagging is critical: marking a parent's transform as dirty must propagate the dirty flag to all descendants. The [Infinite Canvas Tutorial Lesson 3](https://infinitecanvas.cc/guide/lesson-003) demonstrates this with a solar system model (sun > planet > moon).

---

## 6. Zoom and Pan

### Coordinate Spaces

Three coordinate spaces matter:

1. **Screen space** -- physical pixels on the display. Mouse events report screen coordinates.
2. **Canvas space** -- the canvas element's CSS pixel coordinates, accounting for device pixel ratio (`window.devicePixelRatio`).
3. **World space** -- the infinite drawing surface. Objects store positions in world coordinates.

The **viewport transform** (also called camera transform) converts between world and screen:

```
screenX = (worldX - cameraX) * zoom
screenY = (worldY - cameraY) * zoom
```

Inverse (screen to world, needed for hit testing):

```
worldX = screenX / zoom + cameraX
worldY = screenY / zoom + cameraY
```

### Zoom at Cursor

To zoom centered on the mouse position (not the canvas origin), adjust the camera so the world point under the cursor stays fixed:

```
newCameraX = cursorWorldX - (cursorScreenX / newZoom)
newCameraY = cursorWorldY - (cursorScreenY / newZoom)
```

See [Zooming at Mouse Coordinates with Affine Transformations](https://medium.com/@benjamin.botto/zooming-at-the-mouse-coordinates-with-affine-transformations-86e7312fd50b) and Steve Ruiz's [Zoom UI](https://www.steveruiz.me/posts/zoom-ui) post for detailed derivations.

### Pan

Pan translates the camera. During a pan gesture, accumulate pointer deltas divided by zoom:

```
cameraX -= deltaScreenX / zoom
cameraY -= deltaScreenY / zoom
```

Dividing by zoom ensures consistent pan speed regardless of zoom level. Middle-mouse-drag or Space+drag are standard shortcuts.

### Device Pixel Ratio

For crisp rendering on HiDPI displays, set the canvas backing store size to `width * devicePixelRatio` and `height * devicePixelRatio`, then scale the context by `devicePixelRatio`. The CSS size of the canvas remains at logical pixels.

---

## 7. Undo/Redo

### Command Pattern

Each user action produces a **command object** with `execute()` and `undo()` methods. Commands are pushed onto a history stack. Undo pops and calls `undo()`; redo re-executes. This is the classic pattern from [Esveo's Undo/Redo Guide](https://www.esveo.com/en/blog/undo-redo-and-the-command-pattern/).

For property changes, a command stores the old and new values:

```typescript
interface Command {
  execute(): void;
  undo(): void;
  description: string;
}
```

### Coalescing Micro-Updates

Dragging an object produces hundreds of move events per second. Without coalescing, each pixel of movement becomes a separate undo step. Solution: batch micro-updates within a drag gesture into a single command. Start a "transaction" on pointerdown, accumulate changes, and commit the transaction on pointerup as one undoable command.

### Structural Sharing

Snapshot-based undo (Memento pattern) clones the entire state on every action, which is expensive for large documents. Structural sharing stores only the diff -- changed properties reference new values while unchanged properties share references with the previous state. This is the approach used by immutable data structures (Immer, Immutable.js) and tldraw's `TLStore`.

tldraw's `HistoryManager` records changes as diffs against the store. Each history entry contains only the changed records, making undo/redo O(changes) rather than O(document-size).

### History Branching

Linear undo discards redo history when a new action is performed after undoing. History branching preserves all branches -- after undoing three steps and performing a new action, the original "future" is saved as a branch. This allows navigating to any past state without data loss. Emacs pioneered this with "undo tree." See [You Don't Know Undo/Redo](https://dev.to/isaachagoel/you-dont-know-undoredo-4hol) for an in-depth exploration.

For a scientific figure app, linear undo is sufficient for v1. History branching can be added later using a tree structure where each node points to its parent (previous state) and branches are created on divergence.

---

## 8. Snapping and Alignment

### Grid Snap

Quantize object positions to the nearest grid point during drag:

```
snappedX = Math.round(x / gridSize) * gridSize
snappedY = Math.round(y / gridSize) * gridSize
```

Grid snap should be toggleable (Ctrl/Cmd + ' in Excalidraw). The grid itself is rendered on a separate background canvas or layer so it does not re-render with every object change. Excalidraw uses 20px minor gridlines and 100px major gridlines.

### Object Snap

Snap to edges, centers, and corners of other objects. During a drag, compute candidate snap points from all visible objects:
- Left, right, top, bottom edges
- Horizontal and vertical centers
- Corners

For each axis, find the closest candidate within a threshold (e.g., 8 screen pixels). If a snap triggers, override the drag position for that axis.

### Smart Guides

When a snap activates, draw a temporary guide line across the canvas showing the alignment. These are rendered on the interactive overlay canvas (not the static scene canvas). Excalidraw renders snap lines through the `InteractiveCanvas` component. tldraw's `SnapManager` handles both object-to-object and grid snapping with visual guides.

### Equal Spacing Guides

Advanced snapping detects when objects are equally spaced. If object B is being dragged between objects A and C, and the gap A-B equals B-C, show a guide indicating equal spacing. This is a Figma-style feature that significantly helps scientific figure layout.

---

## 9. How Existing Engines Are Architected

### Figma

- Custom WebGL (now WebGPU) renderer written in C++ compiled to WASM via Emscripten.
- Custom DOM, compositor, text layout engine -- "a browser inside a browser."
- Document model: `Map<ObjectID, Map<Property, Value>>` tuples. Property-level conflict resolution.
- Fractional indexing for z-order. Tile-based rendering.
- 32-bit floats and pre-allocated typed arrays to avoid GC pauses.
- Performance testing infrastructure gates every PR.
- See [Building a Professional Design Tool on the Web](https://www.figma.com/blog/building-a-professional-design-tool-on-the-web/).

### tldraw

- React-based with framework-agnostic core (`@tldraw/editor`).
- `Editor` class is the central API: state management, history, input, tools.
- `TLStore` (flat record store) with computed reactive derivations via `signia` signals.
- **ShapeUtil pattern**: each shape type has a class defining rendering, geometry (for hit testing), and interaction behavior.
- Tools are a hierarchical state machine (e.g., SelectTool > Idle | Pointing | Dragging).
- `SnapManager` for alignment. `HistoryManager` for undo/redo as diffs.
- See [tldraw DeepWiki](https://deepwiki.com/tldraw/tldraw) and [Editor API](https://tldraw.dev/reference/editor/Editor).

### Excalidraw

- React + Canvas 2D with Rough.js for hand-drawn rendering style.
- Flat `ExcalidrawElement[]` array -- array order = z-order. No scene graph tree.
- **Dual-canvas pattern**: static canvas (elements, throttled redraws) + interactive canvas (selection, cursors, snap lines, per-frame updates).
- Viewport culling: only elements within/near the viewport are rendered.
- `customData` field on every element for arbitrary metadata.
- PNG/SVG embeds scene data for round-trip editing.
- See [Excalidraw Rendering System](https://deepwiki.com/excalidraw/excalidraw/5-rendering-and-export).

### Konva.js

- Hierarchical scene graph: `Stage > Layer > Group > Shape`.
- **Multi-layer architecture**: each `Layer` gets its own `<canvas>` element. Static layers never re-render when interactive layers update.
- **Dual canvas per layer**: scene canvas (visible) + hit graph canvas (hidden, unique colors per shape for pixel-perfect hit detection).
- Shape caching: `node.cache()` renders to offscreen canvas, subsequent frames use `drawImage()` instead of re-rendering.
- Custom attributes auto-serialize in `toJSON()`.
- OffscreenCanvas + Web Worker support for off-main-thread rendering.
- See [Konva Performance Tips](https://konvajs.org/docs/performance/All_Performance_Tips.html).

### Fabric.js

- OOP model: `fabric.Object` base class with subclasses (Rect, Circle, Path, IText, Textbox, Group).
- Flat ordered list (not a tree) with Groups for hierarchy.
- **Object caching**: each object renders to an offscreen canvas; `dirty` flag triggers re-render to cache. `drawImage()` composites cache to main canvas.
- Custom controls API for adding interaction handles.
- SVG round-trip: `canvas.toSVG()` and SVG import.
- Rich text via `Textbox` with per-character styling.
- See [Fabric.js Object Caching](https://fabricjs.com/docs/fabric-object-caching/).

---

## 10. Signal-Based Reactivity for Canvas (SolidJS)

### Why Signals for Canvas

SolidJS signals provide fine-grained reactivity without a virtual DOM diffing step. For canvas rendering, signals replace the traditional "set property then manually request redraw" pattern. When a shape's `x` signal changes, an `effect` automatically schedules a canvas redraw -- no manual dirty flagging needed at the application layer.

### Architecture Pattern

```
[Signal Store]  -->  [Computed Derivations]  -->  [Effects trigger canvas render]
     ^                                                    |
     |                                                    v
[User Input]                                    [Canvas 2D draw calls]
```

Each shape's properties are signals:

```typescript
const [x, setX] = createSignal(100);
const [y, setY] = createSignal(200);
const [fill, setFill] = createSignal("#ff0000");
```

A `createEffect` watches all shape signals and calls the render function when any change:

```typescript
createEffect(() => {
  // Reading signals automatically subscribes to them
  const shapes = store.shapes(); // reactive
  scheduleRender(shapes);
});
```

### Batching and Scheduling

SolidJS batches signal updates within a microtask. When dragging a shape, `setX()` and `setY()` fire in sequence, but the effect runs once after both settle. This naturally coalesces micro-updates into a single render frame.

To avoid rendering faster than the display refresh rate, the effect should schedule a rAF rather than rendering immediately:

```typescript
let renderScheduled = false;
createEffect(() => {
  trackAllShapeSignals();
  if (!renderScheduled) {
    renderScheduled = true;
    requestAnimationFrame(() => {
      renderScene();
      renderScheduled = false;
    });
  }
});
```

### SolidJS Stores for Scene State

`createStore` from SolidJS provides deeply reactive objects. A scene store can hold the entire document tree:

```typescript
const [scene, setScene] = createStore({
  pages: [{ id: "page1", shapes: [...] }],
  selectedIds: new Set(),
  camera: { x: 0, y: 0, zoom: 1 }
});
```

Updates via `setScene("pages", 0, "shapes", idx, "x", newX)` trigger fine-grained updates -- only effects that read that specific shape's `x` re-run. This is far more efficient than React's top-down re-render.

### Separating UI Shell from Canvas Engine

The SolidJS component tree manages the UI shell (toolbars, panels, properties inspector). The canvas engine is a standalone module that reads from the signal store. SolidJS components do not render canvas content -- they update signals, and the canvas engine's effects respond. This separation keeps the canvas engine framework-agnostic in principle while leveraging SolidJS reactivity. See [solid-canvas](https://github.com/bigmistqke/solid-canvas) for a reference implementation and [SolidJS Fine-Grained Reactivity](https://docs.solidjs.com/advanced-concepts/fine-grained-reactivity).

---

## 11. Performance

### Layer Caching

Separate the scene into layers by update frequency:
- **Background layer**: grid, page border (rarely changes)
- **Content layer**: shapes, text, images (changes on edits)
- **Interactive layer**: selection handles, cursors, guides (changes every frame during interaction)

Each layer is a separate `<canvas>` element. Only the affected layer re-renders. This is Konva's core insight.

### Offscreen Canvas

Complex shapes (e.g., images with filters, text with shadows) are expensive to re-render. Render them once to an `OffscreenCanvas`, then composite via `drawImage()`. Fabric.js does this automatically with its caching system. Invalidate the cache only when the object's visual properties change.

Caution: don't cache simple shapes (plain rectangles) -- `drawImage()` from a cached canvas can be slower than direct draw calls for trivial geometry. See [Konva Shape Caching](https://konvajs.org/docs/performance/Shape_Caching.html).

### GPU Acceleration

Canvas 2D is hardware-accelerated in modern browsers, but control is limited. For scenes exceeding ~5,000 shapes, consider:
- **WebGL**: 2x-10x faster for large shape counts. Libraries like PixiJS provide 2D APIs on WebGL. The crossover where WebGL outperforms Canvas 2D is roughly 5,000-10,000 shapes.
- **WebGPU**: Successor to WebGL with compute shaders and explicit memory control. Figma migrated to WebGPU. Not yet universally supported.
- For a scientific figure app, Canvas 2D is sufficient -- typical documents contain <500 objects.

See [WebGL vs Canvas for CAD Tools](https://altersquare.medium.com/webgl-vs-canvas-best-choice-for-browser-based-cad-tools-231097daf063).

### Large Document Handling

- **Viewport culling**: skip rendering objects outside the visible viewport. Check each object's world bounding box against the viewport rectangle. Use the spatial index (RBush) for efficient culling.
- **Level-of-detail (LOD)**: at low zoom levels, replace complex objects with simplified representations (e.g., replace text with a gray rectangle).
- **Virtualization**: for documents with hundreds of pages, only keep the current page's scene graph in memory.
- **Web Workers**: offload expensive computations (spatial index rebuilds, path simplification) to a worker thread. Konva supports rendering via `OffscreenCanvas` in a Web Worker.

---

## 12. Input Handling

### Pointer Events

Use the [Pointer Events API](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events/Using_Pointer_Events) as the unified input model. It consolidates mouse, touch, and stylus into a single event type with properties:
- `pointerId` -- unique per pointer (enables multi-touch)
- `pointerType` -- "mouse", "touch", or "pen"
- `pressure` -- 0.0 (hover) to 1.0 (max force), continuous for stylus
- `tiltX`, `tiltY` -- stylus angle
- `width`, `height` -- contact area (touch)
- `isPrimary` -- distinguishes first touch from additional fingers

Key events: `pointerdown`, `pointermove`, `pointerup`, `pointercancel`, `pointerenter`, `pointerleave`.

### Touch and Multi-Touch

Two-finger pinch-to-zoom: track two `pointerId`s, compute Euclidean distance between them on each move event, derive zoom delta from distance change. Two-finger pan: track the midpoint of both pointers, derive pan delta from midpoint movement.

Call `event.preventDefault()` on touch events to suppress browser default gestures (scroll, back-navigation). Use `touch-action: none` CSS on the canvas element.

### Stylus Pressure

Pressure-sensitive drawing uses `event.pressure` to modulate stroke width or opacity. Values range from 0.0 to 1.0. Apply smoothing (exponential moving average) to avoid jitter:

```
smoothedPressure = smoothedPressure * 0.7 + event.pressure * 0.3
```

### Gesture Recognition

Recognize higher-level gestures from raw pointer events:
- **Click**: pointerdown + pointerup within 300ms and 5px radius
- **Double-click**: two clicks within 500ms
- **Drag**: pointerdown + pointermove beyond 5px threshold
- **Long press**: pointerdown held for >500ms without movement
- **Pinch**: two-pointer distance change
- **Rotate**: two-pointer angle change

tldraw implements this as a hierarchical state machine: the `SelectTool` has states like `Idle`, `Pointing`, `Dragging`, `Rotating`, each responding to specific input events and transitioning between states.

---

## 13. Build Order

The systems described above have dependencies. Recommended implementation order:

### Phase 1: Core Rendering (Weeks 1-2)
1. **Basic canvas setup** -- canvas element, device pixel ratio, clear/fill
2. **Simple shapes** -- rectangles, ellipses, lines with fill/stroke
3. **Rendering loop** -- rAF with full redraw
4. **Coordinate system** -- screen-to-world conversion

### Phase 2: Interaction Foundation (Weeks 3-4)
5. **Pan and zoom** -- viewport transform, scroll wheel zoom at cursor, Space+drag pan
6. **Hit testing** -- geometric hit test for basic shapes, `isPointInPath()` for paths
7. **Single selection** -- click to select, render selection handles on interactive layer
8. **Transform handles** -- drag corners to resize, drag edges to scale, rotation handle

### Phase 3: Scene Graph (Weeks 5-6)
9. **Scene graph tree** -- BaseNode, GroupNode, ShapeNode with parent-child relationships
10. **Transform system** -- local/world transforms, matrix multiplication, parent-child inheritance
11. **Multi-selection** -- Shift+click, marquee selection
12. **Z-ordering** -- bring forward, send backward, fractional indexing

### Phase 4: Editing (Weeks 7-8)
13. **Undo/redo** -- command pattern with coalescing
14. **Snapping** -- grid snap, object snap, smart guides
15. **Group/ungroup** -- compound nodes, click-through to children

### Phase 5: Text and Polish (Weeks 9-10)
16. **Text rendering** -- `fillText()` with font metrics, bounding box calculation
17. **Inline text editing** -- overlay `<textarea>` or custom cursor/selection rendering
18. **Spatial index** -- RBush for hit testing and viewport culling
19. **Layer caching** -- offscreen canvas for complex shapes

### Phase 6: Advanced (Weeks 11+)
20. **Lasso selection** -- freeform polygon selection
21. **History branching** -- tree-based undo
22. **Pressure-sensitive drawing** -- stylus support
23. **Performance optimization** -- dirty-rect rendering, LOD, virtualization

### Dependency Graph

```
Canvas Setup --> Shapes --> Render Loop --> Coordinate System
                                |
                                v
                        Pan/Zoom --> Hit Testing --> Selection --> Transform Handles
                                                       |
                                                       v
                                    Scene Graph --> Multi-Select --> Z-Ordering
                                        |
                                        v
                                  Undo/Redo --> Snapping --> Groups
                                                  |
                                                  v
                                           Text --> Spatial Index --> Layer Caching
```

---

## 14. Text Editing on Canvas

Text editing on canvas is the single hardest subsystem in a drawing editor. Canvas provides `fillText()` and `measureText()` but no cursor positioning, selection, wrapping, or editing.

### Approaches

**Approach A: Overlay DOM element.** When the user double-clicks a text node, overlay an HTML `<textarea>` or `contentEditable` div precisely positioned and styled to match the canvas text. Edit in the DOM, then sync back to the canvas on blur. This is Konva's recommended approach -- see [Konva Editable Text](https://konvajs.org/docs/sandbox/Editable_Text.html). Advantages: native cursor, selection, IME, accessibility, spell-check. Disadvantages: imperfect alignment at non-trivial zoom/rotation, does not work inside transformed groups.

**Approach B: Custom canvas text engine.** Render the cursor (blinking rectangle), selection highlights (blue rectangles behind text), and handle all keyboard input manually. This is what Figma does -- they built their own text layout engine in C++/WASM. See [grassator/canvas-text-editor-tutorial](https://github.com/grassator/canvas-text-editor-tutorial) for a minimal implementation and [Carota](https://github.com/danielearwicker/carota) for a rich-text canvas editor.

**Approach C: Hybrid.** Use Approach A for editing, Approach B for display. This is the recommended approach for a v1 scientific figure app: render text natively on canvas, but switch to a positioned DOM overlay for editing.

### Cursor Positioning

To position a cursor within canvas text:
1. Split the text into characters (or grapheme clusters for Unicode correctness).
2. Use `context.measureText(text.substring(0, i)).width` to compute the x-offset of each character boundary.
3. On click, find the character boundary closest to the pointer x-coordinate.
4. Render the cursor as a 1-2px wide rectangle at that x-offset, toggled visible/invisible every 530ms.

### Selection Rendering

A text selection is a range `[start, end]` of character indices. Render a semi-transparent rectangle behind each line of selected text, from the start character's x-offset to the end character's x-offset. For multi-line selections, render a rectangle per line.

### Font Metrics

`context.measureText()` returns `TextMetrics` with `width`, `actualBoundingBoxAscent`, `actualBoundingBoxDescent`, `fontBoundingBoxAscent`, `fontBoundingBoxDescent`. Use these for accurate vertical positioning and line height calculation. Note: `measureText()` was significantly expanded in modern browsers -- check for support of the bounding box properties.

### Scientific Text Considerations

Scientific figures need LaTeX math rendering. Rather than implementing math layout in the canvas text engine, render LaTeX to SVG (via MathJax `tex2svg()`) and embed the SVG as an image node on the canvas. Store the LaTeX source as metadata on the node for round-trip editing.

---

## Sources

- [Game Programming Patterns: Dirty Flag](https://gameprogrammingpatterns.com/dirty-flag.html)
- [Fabric.js Object Caching](https://fabricjs.com/docs/fabric-object-caching/)
- [Konva Layer Management](https://konvajs.org/docs/performance/Layer_Management.html)
- [Konva Shape Caching](https://konvajs.org/docs/performance/Shape_Caching.html)
- [Konva Custom Hit Region](https://konvajs.org/docs/events/Custom_Hit_Region.html)
- [Konva Editable Text](https://konvajs.org/docs/sandbox/Editable_Text.html)
- [Konva Performance Tips](https://konvajs.org/docs/performance/All_Performance_Tips.html)
- [RBush -- R-tree Spatial Index](https://github.com/mourner/rbush)
- [Flatbush -- Static Spatial Index](https://github.com/mourner/flatbush)
- [Excalidraw Rendering System](https://deepwiki.com/excalidraw/excalidraw/5-rendering-and-export)
- [Excalidraw Canvas Rendering Pipeline](https://deepwiki.com/excalidraw/excalidraw/5.1-canvas-rendering-pipeline)
- [tldraw DeepWiki](https://deepwiki.com/tldraw/tldraw)
- [tldraw Editor API](https://tldraw.dev/reference/editor/Editor)
- [tldraw ShapeUtil](https://tldraw.dev/reference/editor/ShapeUtil)
- [Figma: Building a Professional Design Tool on the Web](https://www.figma.com/blog/building-a-professional-design-tool-on-the-web/)
- [Figma Rendering Powered by WebGPU](https://www.figma.com/blog/figma-rendering-powered-by-webgpu/)
- [Infinite Canvas Tutorial](https://infinitecanvas.cc/)
- [Infinite Canvas Tutorial -- Lesson 3: Scene Graph and Transform](https://infinitecanvas.cc/guide/lesson-003)
- [Zooming at Mouse Coordinates with Affine Transformations](https://medium.com/@benjamin.botto/zooming-at-the-mouse-coordinates-with-affine-transformations-86e7312fd50b)
- [Steve Ruiz: Zoom UI](https://www.steveruiz.me/posts/zoom-ui)
- [You Don't Know Undo/Redo](https://dev.to/isaachagoel/you-dont-know-undoredo-4hol)
- [Esveo: Undo, Redo, and the Command Pattern](https://www.esveo.com/en/blog/undo-redo-and-the-command-pattern/)
- [Liveblocks: How to Build Undo/Redo in a Multiplayer Environment](https://liveblocks.io/blog/how-to-build-undo-redo-in-a-multiplayer-environment)
- [Apache ECharts Dirty Rectangle Rendering](https://apachecon.com/acasia2021/sessions/1087.html)
- [MDN: Optimizing Canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas)
- [MDN: Using Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events/Using_Pointer_Events)
- [WebGL vs Canvas for CAD Tools](https://altersquare.medium.com/webgl-vs-canvas-best-choice-for-browser-based-cad-tools-231097daf063)
- [SolidJS Fine-Grained Reactivity](https://docs.solidjs.com/advanced-concepts/fine-grained-reactivity)
- [solid-canvas](https://github.com/bigmistqke/solid-canvas)
- [Carota: Rich Text on Canvas](https://github.com/danielearwicker/carota)
- [Canvas Text Editor Tutorial](https://github.com/grassator/canvas-text-editor-tutorial)
- [UiB: Effective Generic Lasso Selection](https://bora.uib.no/bora-xmlui/bitstream/handle/1956/22873/report.pdf)
- [Optimising HTML5 Canvas Rendering (AG Grid)](https://blog.ag-grid.com/optimising-html5-canvas-rendering-best-practices-and-techniques/)
- [Konva Objects Snapping](https://konvajs.org/docs/sandbox/Objects_Snapping.html)
