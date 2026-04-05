# Matplotlib Import (Future)

## The Situation

### SVG Import (Best Path)
Matplotlib can export to SVG: `plt.savefig('fig.svg')`. However:
- **By default, the SVG is poorly structured** -- elements lack meaningful IDs or semantic groupings. You can't tell "this is the x-axis label" from just the SVG.
- **With `set_gid()`, it improves:** Users can assign IDs to individual patches, legend entries, text. Then the SVG is parseable into semantic components.
- **Our approach:** Provide a helper function / matplotlib plugin that auto-assigns meaningful GIDs before export. Users run our function, save SVG, import into our app with structure preserved.

### PDF Import (Worst Path)
- PDF is a flat rendering format. A matplotlib PDF contains raw paths and glyphs with NO semantic structure.
- PyMuPDF can extract vector paths (`page.get_drawings()`) but you can't tell axis from data line -- they're all just paths.
- **Verdict: PDF import gives you a bag of paths, not a structured figure. Avoid.**

### Pickle Import (Fragile)
- Matplotlib figures can be pickled: `pickle.dump(fig, file)`. Full object tree access.
- **No cross-version compatibility.** Pickle from matplotlib 3.8 may fail on 3.9.
- Not a reliable interchange format.

### PGF Backend
- Matplotlib has a PGF backend that outputs TikZ-compatible commands.
- **The output is NOT human-readable.** Low-level `\pgfpath` coordinate dumps, not semantic pgfplots code.
- For editable TikZ output, use matplot2tikz (fork of tikzplotlib, actively maintained).

## Recommendation
1. **MVP:** Import matplotlib SVG as-is (flat, unstructured). User manually groups/labels elements.
2. **v2:** Provide a Python helper (`pip install our-tool`) that instruments a matplotlib figure with GIDs, exports structured SVG, and generates our metadata format.
3. **Future:** Direct matplotlib integration where users can open `.pkl` or run Python code to generate figures in-app.

## Resolved Decisions
- **SVG import for v1.** PDF import as editable vectors is not feasible (PDF is semantically flat -- raw paths with no structure, axis and data lines are indistinguishable). Accept PDF as a placed image only.
- **Matplotlib helper PyPI package:** Deferred to post-MVP. See `docs/deferred.md`.
- **Jupyter integration:** Deferred to v2+. See `docs/deferred.md`.
