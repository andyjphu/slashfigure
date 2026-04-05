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
- Curved paths (Bezier) -- includes arrow midpoint insertion (hover mid-section to add vertex, drag to curve)
- Groups / frames
- Chart elements (embedded Plotly/Vega-Lite)
- Matplotlib SVG import with GID convention
- **Icon library (solid-icons)** -- expose solid-icons (15,000+ icons from 20+ packs) as draggable elements users can place on canvas. solid-icons is for user content; Lucide is for UI chrome.
