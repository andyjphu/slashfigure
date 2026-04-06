# Arrow and Connector Anchoring: Implementation Research

Research into how draw.io (mxGraph), tldraw, and Excalidraw implement arrow/connector
binding to shapes. Focused on actual algorithms extracted from source code.

Sources:
- mxGraph: https://github.com/jgraph/mxgraph (javascript/src/js/view/)
- tldraw: https://github.com/tldraw/tldraw (packages/tldraw/src/lib/shapes/arrow/)
- Excalidraw: https://github.com/excalidraw/excalidraw (packages/element/src/binding.ts)

---

## 1. Terminology

**Floating connector**: The connection point is not fixed to a specific location on the shape.
The arrow "aims at" the other endpoint and the library computes where the ray from the
opposite end intersects the target shape's perimeter. Moving the opposite end changes where
this arrow meets the shape.

**Fixed connector (constraint-based)**: The connection point is pinned to a specific normalized
position on the shape (e.g., top-center = (0.5, 0), right-middle = (1.0, 0.5)). Moving the
opposite end does not change the attachment point.

**Binding**: The association between an arrow endpoint and a target shape. Stored as metadata
so the arrow "sticks" to the shape when the shape moves.

---

## 2. draw.io / mxGraph

### 2.1 Data Model

mxGraph stores connection info in **edge styles**, not in a separate binding object:

- `exitX`, `exitY`: normalized (0-1) position on source shape where the edge leaves
- `entryX`, `entryY`: normalized (0-1) position on target shape where the edge enters
- `exitPerimeter`, `entryPerimeter`: boolean -- if true, the (exitX, exitY) point is
  projected onto the shape's perimeter using the perimeter function. If false, the point
  is used as-is (an interior point)
- `exitDx`, `exitDy`, `entryDx`, `entryDy`: pixel offsets applied after the constraint
  point is resolved

When these style properties are **null**, the connector is floating (no fixed constraint).
When they have values, the connector is fixed.

Source: `mxGraph.getConnectionConstraint()` reads `STYLE_EXIT_X/Y` and `STYLE_ENTRY_X/Y`
from the edge style. `mxGraph.setConnectionConstraint()` writes them back.

### 2.2 The Edge Update Pipeline

When a graph revalidates, each edge goes through this pipeline in `updateEdgeState()`:

```
1. updateFixedTerminalPoints(state, source, target)
   -- resolves any fixed constraints to absolute coordinates
   -- if constraint is null (floating), leaves the point as null

2. updatePoints(state, geo.points, source, target)
   -- applies edge routing style (orthogonal, curved, etc.)
   -- inserts intermediate waypoints

3. updateFloatingTerminalPoints(state, source, target)
   -- for any terminal that is STILL null after step 1 (i.e., floating),
      computes the perimeter intersection point
```

This order matters: fixed points are resolved first, then routing, then floating points.
Floating points depend on the routed path because they use the "next point" in the path
to determine the direction of approach.

### 2.3 Floating Connector Algorithm

The core function is `getFloatingTerminalPoint()`:

```
function getFloatingTerminalPoint(edge, start, end, source):
    // "start" = the terminal shape state we are connecting TO
    // "end"   = the opposite terminal shape state
    
    next = getNextPoint(edge, end, source)
    // next = the nearest waypoint or the opposite terminal's center
    
    // Handle rotated shapes: un-rotate the "next" point into the shape's
    // local coordinate system before perimeter calculation
    if shape is rotated:
        next = rotatePoint(next, -angle, shapeCenter)
    
    // Core: call the perimeter function with the "next" point as direction
    point = getPerimeterPoint(start, next, isOrthogonal, border)
    
    // Re-rotate result back to global coordinates
    if shape is rotated:
        point = rotatePoint(point, +angle, shapeCenter)
    
    return point
```

The key insight: **the floating connection point is where a ray from the "next point"
(opposite end or nearest waypoint) to the shape's center intersects the shape's perimeter**.
The perimeter function receives the external point and computes the intersection.

### 2.4 Perimeter Functions (the Actual Intersection Math)

Each shape type has a perimeter function. Signature:
`perimeter(bounds, terminal, next, orthogonal) -> Point`

**RectanglePerimeter** -- the most common:
```
1. Compute angle alpha = atan2(next.y - center.y, next.x - center.x)
2. Compute threshold angle t = atan2(height, width)
3. Use alpha vs t to determine which edge is hit:
   - alpha in [-pi+t, -t]         -> top edge
   - alpha in [-t, t]             -> right edge  
   - alpha in [t, pi-t]           -> bottom edge
   - alpha in [pi-t, pi] or [-pi, -pi+t] -> left edge
4. For the chosen edge, solve for the intersection point using tan(alpha)
   Example for right edge: y = center.y + (width/2) * tan(alpha)
```

This is NOT a line-segment intersection test. It uses the angle from center to the
external point to classify which edge is crossed, then uses trigonometry to find the
exact point. This is faster than a general line-rectangle intersection.

**EllipsePerimeter**:
```
1. Derive line equation from center to external point: y = d*x + h
   where d = dy/dx, h = center.y - d * center.x
2. Substitute into ellipse equation: x^2/a^2 + y^2/b^2 = 1
3. Solve resulting quadratic: e*x^2 + f*x + g = 0
4. Two solutions correspond to two intersection points
5. Return the one closest to the external point
```

**RhombusPerimeter**:
```
1. Determine which quadrant the external point is in relative to center
2. Compute line-segment intersection between the ray (center -> external)
   and the corresponding diamond edge using mxUtils.intersection()
```

**Orthogonal mode**: When `orthogonal=true`, the perimeter functions adjust behavior.
Instead of finding the point where a ray from the external point hits the perimeter,
they find the closest point on the perimeter that is either horizontally or vertically
aligned with the external point. This gives cleaner right-angle connections.

### 2.5 Fixed Connector Algorithm

`getConnectionPoint(vertex, constraint)`:
```
1. Start with the constraint's normalized point (0-1 range)
2. Convert to absolute coordinates:
   point = (bounds.x + constraint.x * bounds.width,
            bounds.y + constraint.y * bounds.height)
3. Add pixel offset: point += (constraint.dx, constraint.dy)

4. If constraint.perimeter == true:
   -- Project the point onto the shape perimeter
   -- This means the normalized point is treated as a DIRECTION hint,
      and the actual connection is at the perimeter along that direction
   
   If constraint.perimeter == false:
   -- Use the point directly (can be inside the shape)
   -- Apply flip corrections for FLIPH/FLIPV styles
   
5. Apply shape rotation to get final global coordinates
```

The `perimeter` flag is the key distinction: with it ON (default), a constraint at (0.3, 0.3)
does not mean "30% from left, 30% from top" literally. It means "the perimeter point in the
direction of (0.3, 0.3) from center." With it OFF, the point is used literally.

### 2.6 Snap Zone (Connection Detection)

mxGraph uses two systems:

**Hotspot-based**: `mxConstants.DEFAULT_HOTSPOT = 0.3` (30% of shape size). When the cursor
is within the central 30% of a shape, it triggers a "connect to center" action. Controlled by
`MIN_HOTSPOT_SIZE` (minimum 8px) and `MAX_HOTSPOT_SIZE`.

**Constraint handler**: On hover, creates a tolerance rectangle around the cursor
(`getTolerance()` pixels in each direction). Iterates all registered constraint points
(displayed as blue dots in draw.io), computes squared distance from cursor to each,
selects the nearest one within tolerance.

---

## 3. tldraw

### 3.1 Data Model

tldraw uses a **binding** system separate from the arrow shape. An arrow binding is:

```typescript
TLArrowBinding {
    fromId: string        // the arrow shape ID
    toId: string          // the target shape ID
    props: {
        terminal: 'start' | 'end'
        normalizedAnchor: { x: number, y: number }  // 0-1 on target bounds
        isPrecise: boolean
        isExact: boolean
        snap: { ... }
    }
}
```

Bindings are stored as separate records, not embedded in the arrow shape. The arrow shape
itself stores fallback `start` and `end` coordinates (used when not bound).

### 3.2 isPrecise vs Non-Precise (Center Connection)

This is the core design decision in tldraw:

**Non-precise (isPrecise = false)**:
- The `normalizedAnchor` is ignored for terminal position calculation
- The arrow points toward `{ x: 0.5, y: 0.5 }` (center of target shape)
- The visible endpoint is where the line from the opposite end intersects the shape edge
- Moving the opposite end changes which edge the arrow connects to
- This is the default when the user drags quickly or drops near the center

**Precise (isPrecise = true)**:
- The `normalizedAnchor` is used as the target point within the shape
- The arrow points toward that specific location
- The normalizedAnchor is clamped to avoid degenerate edge cases (not exactly 0 or 1)
- Moving the opposite end does NOT change the attachment point direction
- Activated when the user moves slowly or deliberately positions the endpoint

The implementation in `getArrowTerminalInArrowSpace()`:

```typescript
const shouldUsePreciseAnchor = binding.props.isPrecise || forceImprecise
const normalizedAnchor = shouldUsePreciseAnchor
    ? clampNormalizedAnchor(binding.props.normalizedAnchor)
    : { x: 0.5, y: 0.5 }

const shapePoint = Vec.Add(point, Vec.MulV(normalizedAnchor, size))
const pagePoint = Mat.applyToPoint(shapePageTransform, shapePoint)
const arrowPoint = Mat.applyToPoint(Mat.Inverse(arrowPageTransform), pagePoint)
```

Note: `forceImprecise` is set to true when both ends are bound to the same shape or when
one shape contains the other. This prevents degenerate arrows where both ends point to the
same center.

### 3.3 isExact (Arrow Through Shape vs Stopping at Edge)

**isExact = false** (default): The arrow stops at the shape's edge. The library computes
the intersection of the arrow line with the shape boundary and clips there.

**isExact = true** (activated by holding Alt): The arrow passes through the shape to reach
the actual normalizedAnchor point. No clipping at the edge. Useful for annotating specific
interior points.

### 3.4 Edge Intersection Algorithm

In `straight-arrow.ts`, the function `updateArrowheadPointWithBoundShape()`:

```
1. Transform both the arrow start and end points into the target shape's
   local coordinate space using inverse matrix transforms

2. Call targetShapeInfo.geometry.intersectLineSegment(startLocal, endLocal)
   -- Each shape geometry knows how to intersect a line segment with itself
   -- Returns array of intersection points

3. Sort intersections by distance to the approaching point (the "from" end)

4. Take the NEAREST intersection as the connection point

5. If isExact is true, skip this entire calculation and use the raw point
```

Each shape geometry implements `intersectLineSegment()` -- rectangles test against 4 edges,
ellipses solve the quadratic, polygons test each edge segment.

### 3.5 Double-Bound Arrows

When both ends of an arrow are bound to shapes:

```typescript
const boundShapeRelationships = getBoundShapeRelationships(
    editor, bindings.start?.toId, bindings.end?.toId
)
```

Returns one of: `'double-bound'`, `'start-contains-end'`, `'end-contains-start'`, or `null`.

When double-bound or one contains the other, `forceImprecise` is set to true for the
containing shape. This forces that end to use the center anchor, preventing visual
artifacts from both arrows pointing to the same normalized position.

Also, when both ends bind to the same shape and have identical normalizedAnchors, tldraw
nudges one anchor by 0.05 to prevent a zero-length arrow.

### 3.6 Snap Zone

When dragging an arrow handle, `updateArrowTargetState()` performs hit testing:

1. Convert the handle position to page space
2. Find shapes at that point using `editor.getShapeAtPoint()`
3. If a shape is found and is bindable (not another arrow), create a binding
4. The `normalizedAnchor` is computed by projecting the cursor position into the target
   shape's local bounds and normalizing: `x = (localX - bounds.minX) / bounds.width`
5. If no shape is found, remove the binding

There is no explicit "snap distance" -- the hit test is based on whether the cursor is
over the shape's visible area. The binding activates when the cursor enters the shape
and deactivates when it leaves.

### 3.7 Real-Time Updates

Binding updates happen in real-time during drag (every pointer move event). The
`onTerminalHandleDrag()` handler recalculates `updateArrowTargetState()` on each move,
creating/updating/removing bindings immediately. There is no "only on release" behavior.

---

## 4. Excalidraw

### 4.1 Data Model

Excalidraw stores bindings on both sides:

**On the arrow** (ExcalidrawArrowElement):
```typescript
startBinding: FixedPointBinding | null
endBinding: FixedPointBinding | null
```

**On the target shape** (any bindable element):
```typescript
boundElements: Array<{ id: string, type: 'arrow' | 'text' }>
```

The `FixedPointBinding` type:
```typescript
{
    elementId: string              // target shape ID
    mode: 'inside' | 'orbit'      // inside = endpoint inside shape, orbit = on outline
    fixedPoint: [number, number]   // normalized [0-1] position on shape bounds
}
```

The `fixedPoint` is rotation-invariant: it is computed in the shape's un-rotated local
coordinate space, so rotating the shape does not invalidate the stored value.

### 4.2 The Intersection Algorithm: bindPointToSnapToElementOutline()

This is the core function that computes where an arrow meets a shape boundary:

```
function bindPointToSnapToElementOutline(arrow, shape, startOrEnd, elementsMap):

    1. Get the arrow's current endpoint in global coordinates
       point = getPointAtIndexGlobalCoordinates(arrow, startOrEnd)
    
    2. Get the adjacent point on the arrow (the next vertex)
       adjacentPoint = getPointAtIndexGlobalCoordinates(arrow, adjacent index)
    
    3. Compute the binding gap (small offset outside the shape stroke)
       bindingGap = getBindingGap(shape, arrow)
    
    4. Create an extended ray through both points:
       -- Compute direction vector from adjacentPoint to point
       -- Extend it far beyond the shape in both directions
       -- This creates a long line segment that is guaranteed to cross the shape
       
       halfVector = normalize(point - adjacentPoint) * 
                    (distance + max(width, height) + gap * 2)
       intersector = lineSegment(
           adjacentPoint + halfVector,
           adjacentPoint - halfVector
       )
    
    5. Find all intersections of this ray with the shape boundary
       intersections = intersectElementWithLineSegment(shape, intersector, gap)
    
    6. Sort intersections by distance to the adjacent point (nearest first)
    
    7. Return the nearest intersection point
```

The key insight: Excalidraw does NOT cast a ray from center outward. It creates a ray
along the arrow's own direction (from the second-to-last point through the endpoint)
and finds where that ray crosses the shape boundary. This means the arrow's approach
angle determines the connection point, not the center of the target shape.

The `bindingGap` adds a small buffer (default `BASE_BINDING_GAP = 5px`) so the arrow
visually stops slightly outside the shape's stroke rather than touching it.

### 4.3 Fixed Point Calculation: calculateFixedPointForNonElbowArrowBinding()

When a binding is created, the intersection point is converted to a normalized fixed point:

```
function calculateFixedPointForNonElbowArrowBinding(arrow, shape, startOrEnd):

    1. Get the edge point (global intersection position)
    2. Get the shape's center
    3. Un-rotate the point by -shape.angle around the center
       (so the fixed point is rotation-invariant)
    4. Normalize to [0, 1]:
       fixedPointX = (unrotatedPoint.x - shape.x) / shape.width
       fixedPointY = (unrotatedPoint.y - shape.y) / shape.height
    5. Clamp to valid range via normalizeFixedPoint()
```

This stored `fixedPoint` is used when the shape moves/resizes to recompute the arrow
endpoint without needing the original intersection calculation.

### 4.4 Binding Detection (Snap Zone)

`getHoveredElementForBinding()`:
- Computes an adaptive snap distance: `max(BASE_BINDING_GAP, 15px)` adjusted by zoom
- Clamped between 1x and 2x of the base distance depending on zoom level
- At high zoom, the snap zone shrinks; at low zoom, it grows
- Tests if the arrow endpoint is within this distance of any bindable shape
- Returns the nearest bindable element or null

Bindable element types: rectangle, diamond, ellipse, text, image, frame, embeddable.

### 4.5 Updates During Drag and Shape Movement

**During arrow drag**: Binding updates happen in real-time. On each pointer move, the
system checks for hovered bindable elements and creates/updates/removes bindings.

**When a bound shape moves**: `updateBoundElements()` is called:
```
1. Iterate all arrows referencing the moved shape (via boundElements[])
2. For each arrow, retrieve the stored fixedPoint
3. Convert fixedPoint back to global coordinates:
   getGlobalFixedPointForBindableElement() un-normalizes and re-rotates
4. Use bindPointToSnapToElementOutline() to compute the new edge intersection
5. Update the arrow endpoint via LinearElementEditor.movePoints()
```

This ensures arrows "follow" their bound shapes through translation, rotation, and resize.

### 4.6 The "orbit" vs "inside" Binding Modes

- **orbit**: The arrow endpoint snaps to the shape's outline (with binding gap). This is
  the standard connection behavior.
- **inside**: The arrow endpoint is inside the shape. Used for text labels bound to arrows
  and potentially for arrows that pass through shapes.

---

## 5. Comparison Table

| Aspect | mxGraph (draw.io) | tldraw | Excalidraw |
|--------|-------------------|--------|------------|
| **Binding storage** | Edge style properties (exitX/Y, entryX/Y) | Separate binding records | On arrow (startBinding/endBinding) + on shape (boundElements) |
| **Floating connection** | Ray from opposite end to center, intersect perimeter | isPrecise=false: target center, intersect geometry | Ray along arrow direction, intersect shape boundary |
| **Fixed connection** | Normalized point (0-1) + perimeter projection | normalizedAnchor (0-1) + isPrecise=true | fixedPoint [0-1] + rotation invariant |
| **Perimeter algorithm** | Angle-based classification (atan2), shape-specific math | geometry.intersectLineSegment() per shape type | intersectElementWithLineSegment() with extended ray |
| **Snap zone** | Hotspot (30% of shape) + constraint tolerance rect | Over the shape's area (no distance threshold) | Adaptive: max(5, 15px) scaled by zoom |
| **Arrow at edge vs through** | perimeter flag on constraint | isExact flag on binding | binding mode: orbit vs inside |
| **Real-time during drag** | Yes, updates on mouse move | Yes, updates on pointer move | Yes, updates on pointer move |
| **Double-bound handling** | No special case | forceImprecise + anchor nudge | fixedPoint recalculated for both ends |

---

## 6. Key Algorithmic Insights for Our Implementation

### 6.1 The Ray Direction Question

The three libraries answer "where does the arrow meet the shape?" differently:

- **mxGraph**: Ray from the OPPOSITE endpoint (or nearest waypoint) toward the shape center.
  The perimeter function intersects this ray. Simple and predictable.
- **tldraw**: When non-precise, same as mxGraph (center-directed). When precise, ray from
  arrow endpoint through the normalizedAnchor position.
- **Excalidraw**: Ray along the arrow's own path (from second-to-last point through endpoint).
  No concept of "center" -- the arrow's geometry determines the intersection.

For a scientific figure tool, the mxGraph / tldraw-non-precise approach (center-directed) is
likely the right default. Excalidraw's approach is more complex and is designed for
hand-drawn style arrows that may curve.

### 6.2 What to Store in a Binding

Minimum viable binding:
```typescript
{
    targetShapeId: string
    normalizedAnchor: { x: number, y: number }  // 0-1, rotation-invariant
    isFloating: boolean   // true = recompute from center, false = use anchor
}
```

Following Excalidraw's lead, store the normalizedAnchor in the shape's un-rotated coordinate
space so it survives rotation transforms without recalculation.

### 6.3 The Perimeter Function Pattern

mxGraph's approach is worth adopting: each shape type registers a perimeter function.
The function signature is `(bounds, terminal, externalPoint, orthogonal) -> Point`.

For rectangles, the atan2-based edge classification is faster and simpler than a full
line-segment intersection test against 4 edges. For ellipses, the quadratic solution
is standard. For arbitrary polygons, iterate edges and find the nearest intersection.

### 6.4 Fixed vs Floating Decision

mxGraph's approach is cleanest: null constraint = floating, non-null = fixed. The
`perimeter` flag on fixed constraints is a powerful feature -- it means you can specify
"connect at the right side" as (1.0, 0.5) with perimeter=true, and the system finds the
actual edge point. Without the perimeter flag, (1.0, 0.5) means literally "the midpoint
of the right edge" which may not lie on the perimeter for non-rectangular shapes.

### 6.5 Binding Gap

Excalidraw's binding gap (5px outside the shape stroke) is a nice visual touch. The arrow
stops slightly before the shape boundary, preventing visual overlap with the shape's stroke.
This should be configurable per arrow style.

---

## 7. Source Links

- mxPerimeter.js (perimeter algorithms): https://github.com/jgraph/mxgraph/blob/master/javascript/src/js/view/mxPerimeter.js
- mxGraphView.js (edge update pipeline): https://github.com/jgraph/mxgraph/blob/master/javascript/src/js/view/mxGraphView.js
- mxConnectionHandler.js (connection creation): https://github.com/jgraph/mxgraph/blob/master/javascript/src/js/handler/mxConnectionHandler.js
- mxConstraintHandler.js (snap detection): https://github.com/jgraph/mxgraph/blob/master/javascript/src/js/handler/mxConstraintHandler.js
- mxGraph.js (getConnectionPoint): https://github.com/jgraph/mxgraph/blob/master/javascript/src/js/view/mxGraph.js#L6885
- tldraw ArrowShapeUtil: https://github.com/tldraw/tldraw/blob/main/packages/tldraw/src/lib/shapes/arrow/ArrowShapeUtil.tsx
- tldraw shared.ts (getArrowTerminalsInArrowSpace): https://github.com/tldraw/tldraw/blob/main/packages/tldraw/src/lib/shapes/arrow/shared.ts
- tldraw straight-arrow.ts: https://github.com/tldraw/tldraw/blob/main/packages/tldraw/src/lib/shapes/arrow/straight-arrow.ts
- tldraw ArrowBindingUtil: https://github.com/tldraw/tldraw/blob/main/packages/tldraw/src/lib/bindings/arrow/ArrowBindingUtil.ts
- tldraw binding docs: https://tldraw.dev/reference/tlschema/TLArrowBindingProps
- Excalidraw binding.ts: https://github.com/excalidraw/excalidraw/blob/master/packages/element/src/binding.ts
- Excalidraw DeepWiki overview: https://deepwiki.com/excalidraw/excalidraw/3.1-element-binding-and-geometry
