# Vega / Vega-Lite

- **Full Name:** Vega-Lite -- A Grammar of Interactive Graphics
- **URL:** https://github.com/vega/vega-lite
- **Stars:** ~5,300 (Vega-Lite), ~11,800 (Vega)
- **License:** BSD-3-Clause

## What It Does
Declarative JSON grammar for visualization. Vega-Lite compiles to Vega specs which compile to reactive dataflow graphs.

## Key for Our Project
**Gold standard for declarative chart description.** Specs are simultaneously human-readable, machine-parseable, and directly renderable:
```json
{
  "mark": "bar",
  "encoding": {
    "x": {"field": "category", "type": "nominal"},
    "y": {"field": "value", "type": "quantitative"}
  }
}
```

Used by VisText for scene graph extraction. For chart-type figure elements, our metadata should aspire to Vega-Lite-level semantic clarity.
