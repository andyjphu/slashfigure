# VisText

- **Full Name:** VisText -- Benchmark for Semantically Rich Chart Captions
- **URL:** https://github.com/mitvis/vistext
- **Paper:** ACM 2023 (vis.csail.mit.edu/pubs/vistext/)
- **Stars:** ~96
- **License:** GPL-3.0

## What It Does
Benchmark dataset of 12,441 charts with semantically rich captions. Each chart has three representations: rasterized image, backing data table, and **scene graph** (hierarchical representation of visual elements).

## Scene Graph Approach
Scene graphs extracted from Vega-Lite rendering API. Reduced scene graphs preserve:
- Title, axis labels, axis label coordinates
- Tick coordinates, mark coordinates, mark sizes
- Flattened via depth-first traversal for LLM input

## Key for Our Project
**The scene graph approach is directly transferable.** Our canvas already has a DOM-like structure. Extract a "scene graph" of visual elements with types, positions, labels, relationships, then flatten for LLM input.

The "reduced scene graph" concept is critical for token efficiency -- keep only elements essential for description, drop visual-only details.

## Key Insight
The canvas scene graph IS the metadata. Don't build a separate metadata system -- extract the metadata FROM the scene graph. Filter for semantic elements, flatten via DFS, and you have an LLM-ready description.
