# MathJax

- **Full Name:** MathJax -- Beautiful and accessible math in all browsers
- **URL:** https://github.com/mathjax/MathJax
- **Stars:** ~10,803
- **License:** Apache-2.0

## What It Does
Full-featured math rendering: LaTeX, MathML, AsciiMath input -> HTML (CHTML), SVG, or MathML output.

## Key APIs
```javascript
MathJax.tex2svg('E=mc^2');   // Returns SVG DOM element -- compositable into SVG canvas!
MathJax.tex2chtml('E=mc^2'); // Returns CHTML DOM
MathJax.startup.toMML();     // Serialize to MathML
```

## Key for Our Project
**`tex2svg()` is critical:** produces native SVG that can be directly composited into an SVG scene graph without `<foreignObject>`. This is the primary advantage over KaTeX.

Use MathJax as the primary renderer (SVG output), KaTeX as fast-preview fallback for live typing.

## Pattern
Store equations as: `{latex: "E=mc^2", renderedSvg: "<svg>...</svg>"}`. The dual storage (source + rendered) means annotations display without re-rendering (PDF annotation `/AP` pattern).
