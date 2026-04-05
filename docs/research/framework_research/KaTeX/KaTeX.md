# KaTeX

- **Full Name:** KaTeX -- Fast math typesetting for the web
- **URL:** https://github.com/KaTeX/KaTeX
- **Stars:** ~19,946
- **License:** MIT

## What It Does
Renders LaTeX math to HTML+MathML synchronously. Extremely fast, no reflow. Math typesetting only (not full LaTeX).

## Key APIs
```javascript
katex.renderToString('E=mc^2', {displayMode: true, output: 'htmlAndMathml'});
katex.render('\\frac{a}{b}', element, {throwOnError: false});
```

## Key for Our Project
- **Input IS LaTeX** -- store the LaTeX source string as metadata, re-render on demand
- **Embedded MathML** output is machine-readable semantic math
- Use `<foreignObject>` to embed in SVG canvas
- **Fast preview** for live typing -- renders synchronously without layout thrashing

## Limitation
No SVG output. Must use `<foreignObject>` for SVG embedding. Compare with MathJax which can output native SVG.
