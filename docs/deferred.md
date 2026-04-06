# Deferred Decisions

Features and decisions explicitly deferred to post-MVP. Review after MVP launch.

## Deferred Features

### Tables
- **Colored cells / row highlighting** -- Adds LaTeX export complexity (`\cellcolor`, `\rowcolor` require `colortbl`). Revisit when table feature is stable.
- **Merged cells (multicolumn/multirow)** -- Deferred to v1.1. Touches every part of the table system (layout, rendering, selection, export, metadata). Build on stable table foundation first.

### LLM Integration
- **Entire LLM integration is post-MVP.** The metadata panel and metadata generation ship with MVP, but LLM features (describe figure, Q&A, export assistance) are deferred.
- **Authentication (OAuth)** -- Only needed for LLM proxy. Defer until LLM integration begins.
- **Hosted LLM proxy** -- Defer until LLM integration.
- **BYOK settings UI** -- Defer until LLM integration.
- **Rate limiting** -- 20 calls/day free for logged-in users. Implement when LLM ships.

### Matplotlib
- **Matplotlib helper PyPI package** -- Defer until SVG import is stable and user demand is validated.
- **Jupyter notebook integration** -- Large scope. v2+ project.
- **PDF import as editable vectors** -- PDF is semantically flat (paths only, no structure). Accept PDF as image only for now.

### Export
- **TikZ export** -- Not in MVP. Add for structured diagrams (flowcharts, node-edge) in v2. Use svg2tikz pipeline.
- **Text-to-paths vectorization** -- Ship as advanced export option post-MVP.

### Drawing Primitives (post-MVP)
- Ellipse, circle, triangle, polygon, star
- **Arrow anchor binding to shapes** -- Attempted 3 times, each with different algorithms. Issues encountered:
  1. Fixed 16-point grid: unnatural snapping, too many visual indicators, couldn't pull arrows off shapes
  2. Nearest-edge-point (perpendicular projection): wrong algorithm entirely -- gives perpendicular closest point, not directional intersection
  3. Center-directed ray intersection (mxGraph atan2 approach): correct algorithm per research, but binding update logic still caused arrows to fight user drags and jump unpredictably when shapes moved
  Root cause: the interaction between binding updates in syncStore (runs every frame), vertex dragging in SelectTool, and the arrow creation tool creates complex state conflicts that need careful sequencing. The research document at `docs/research/arrow-anchoring/arrow-anchoring.md` has the correct algorithms from draw.io (mxGraph), tldraw, and Excalidraw. Key insight: tldraw's approach (binding activates when cursor is OVER the shape, not near it; `normalizedAnchor` stored per binding; `isPrecise` flag) is likely the cleanest model. Needs a dedicated implementation sprint with proper state machine for binding lifecycle (unbound → hovering → snapping → bound → dragging → unbound).
- Curved paths (Bezier) -- includes arrow midpoint insertion (hover mid-section to add vertex, drag to curve)
- **Flip via resize drag-through** -- drag an edge past the opposite edge to mirror the shape (PowerPoint-style). Attempted and reverted. Approaches tried and their failure modes:
  1. **Normalize in `applyResize` + scaleX/scaleY toggle**: Handle names ("top", "left") no longer match visual positions after flip. Remapping handle names by scale sign partially worked but broke when combined with rotation. Resize on flipped+rotated shapes moved the wrong edge.
  2. **Excalidraw pattern (negative dimensions during drag, normalize on mouseup)**: Rendering with negative width/height works for `fillRect`/`strokeRect` but not for `drawImage` or `roundRect`. Added flip-aware render in ImageNode but the persisted scaleX/scaleY conflicted with the world transform (double-flipping). Normalization on mouseup lost the flip state.
  3. **Correct approach (not yet implemented)**: Likely needs a dedicated `scaleX`/`scaleY` that is baked into the world transform from the start, with all hit testing, handle positioning, and resize delta projection fully aware of scale sign. Fabric.js uses `lockScalingFlip` to avoid the problem entirely. Excalidraw defers normalization. Worth studying Fabric.js `_setObjectScale` and Excalidraw's `resizeElement` in depth before reattempting.
- **Groups / frames (Figma-style)** -- Ctrl+G to group selected elements. Groups appear as collapsible nodes in the layers panel with indented children. Double-click a group to "enter" it (edit children directly). Click outside to exit. Groups propagate transforms to children. Research Figma's group vs frame distinction before implementing.
- Chart elements (embedded Plotly/Vega-Lite)
- Matplotlib SVG import with GID convention
- **Icon library (solid-icons)** -- expose solid-icons (15,000+ icons from 20+ packs) as draggable elements users can place on canvas. solid-icons is for user content; Lucide is for UI chrome.
