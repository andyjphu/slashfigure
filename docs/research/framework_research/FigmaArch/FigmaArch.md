# Figma Architecture

- **Full Name:** Figma Engineering Blog (Multiple Posts)
- **URLs:**
  - https://madebyevan.com/figma/how-figmas-multiplayer-technology-works/
  - https://madebyevan.com/figma/realtime-editing-of-ordered-sequences/
  - https://madebyevan.com/figma/building-a-professional-design-tool-on-the-web/
  - https://madebyevan.com/figma/webassembly-cut-figmas-load-time-by-3x/
  - https://madebyevan.com/figma/rust-in-production-at-figma/
  - https://madebyevan.com/figma/introducing-vector-networks/
  - https://www.figma.com/blog/figma-rendering-powered-by-webgpu/
  - https://www.figma.com/blog/keeping-figma-fast/
  - https://andrewkchan.dev/posts/figma2.html
- **License:** N/A (blog posts)

## Document Model
Tree of objects stored as `Map<ObjectID, Map<Property, Value>>` tuples. Parent-child stored as property on child (not bidirectional). **Last-writer-wins at property level** -- not full CRDT or OT. Server is central authority.

## Fractional Indexing
Child ordering uses fractions between 0 and 1, encoded as **base-95 strings** for arbitrary precision. Insertion between two objects = average of their indices. Avoids float precision loss.

## Rendering
Custom WebGL rendering engine in C++ compiled to WASM via Emscripten. "A browser inside a browser" with custom DOM, compositor, and text layout engine. Tile-based rendering. Now migrated to WebGPU with WebGL fallback.
- 32-bit floats/bytes instead of JS 64-bit doubles for memory efficiency
- Pre-allocated typed arrays to avoid GC pauses
- Within 2x native performance

## WASM
Switching from asm.js to WASM gave **3x load time improvement**. 32-bit addressing limits to 4GB memory with grow-only semantics.

## Rust Server
Migrated multiplayer server from TypeScript to Rust. 10x+ faster serialization, eliminated GC latency spikes. Architecture: Node.js parent process for network ops, Rust child processes per document via stdin/stdout.

## Vector Networks
Graph structure replacing sequential paths. Lines between any two points without forming chains. Junction points with 3+ connections. Region-based fill toggling instead of winding numbers.

## Key Lessons
1. Implementation quality > API sophistication (Sketch lost despite native perf)
2. Property-level conflict resolution is sufficient with central server
3. Build perf testing infrastructure early -- automated regression gates on every PR
4. Don't build two layout engines simultaneously
5. WebGL 2.0 (OpenGL ES 3.0 from 2012) was "fast enough" -- pragmatic > cutting-edge
