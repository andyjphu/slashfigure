# Penrose

- **Full Name:** Penrose
- **URL:** https://github.com/penrose/penrose
- **Stars:** ~7,931
- **License:** MIT
- **Paper:** SIGGRAPH 2020 (CMU)

## What It Does
Create beautiful diagrams by typing mathematical notation. Uses constraint optimization for automatic layout. Three-file system:
- `.domain` -- abstract types
- `.substance` -- mathematical content (`Set A, B; Subset(A, B)`)
- `.style` -- visual mapping rules

## Key for Our Project
**Gold-standard design pattern:** separation of mathematical semantics from visual representation. Three independent layers:
1. **Semantic layer** -- what the figure means (substance)
2. **Style layer** -- how things look (style)
3. **Type layer** -- what kinds of things exist (domain)

Each layer is independently describable as text.

## Key Insight
Our app should maintain similar separation: a semantic layer (annotations, relationships, data), a spatial layer (positions, sizes), and a style layer (colors, fonts, strokes). The metadata system should be able to export each independently.
