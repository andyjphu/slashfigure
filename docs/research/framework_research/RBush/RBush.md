# RBush

- **Full Name:** RBush -- High-performance JavaScript R-tree-based 2D spatial index
- **URL:** https://github.com/mourner/rbush
- **Stars:** ~2,724
- **License:** MIT

## What It Does
R-tree spatial index for fast bounding-box queries. Dynamic insert/remove. Used by tldraw for hit testing.

## Key APIs
```javascript
tree.insert({minX: 0, minY: 0, maxX: 100, maxY: 50, id: 'rect1', type: 'equation'});
tree.search({minX: 45, minY: 20, maxX: 55, maxY: 30}); // find intersecting elements
tree.collides({minX, minY, maxX, maxY}); // fast boolean collision check
tree.remove(item);
tree.load(items); // bulk insert (2-3x faster)
tree.toJSON() / tree.fromJSON(); // serialize/deserialize
```

## Key for Our Project
Essential infrastructure for:
- **Hit-testing:** Which element did the user click?
- **Viewport culling:** Which elements are visible?
- **Snap/alignment:** Find nearby elements
- **Overlap detection:** Warn about overlapping labels
- **Spatial metadata queries:** "What elements are in the upper-right quadrant?"

The serializable tree can be stored as part of figure metadata. Pairs naturally with W3C annotation model.

## See Also
- **Flatbush** (https://github.com/mourner/flatbush) -- static packed Hilbert R-tree. Faster than RBush for static datasets. Single `ArrayBuffer` serialization. Use for read-heavy export/query scenarios.
