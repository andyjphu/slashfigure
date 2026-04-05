# W3C Web Annotation Data Model

- **Full Name:** W3C Web Annotation Data Model (W3C Recommendation)
- **URL:** https://www.w3.org/TR/annotation-model/
- **GitHub:** https://github.com/w3c/web-annotation
- **License:** W3C Document License

## What It Does
Defines a standard JSON-LD data model for annotations. An annotation links a "body" (content) to a "target" (thing being annotated) via selectors.

## Data Model
```json
{
  "@context": "http://www.w3.org/ns/anno.jsonld",
  "type": "Annotation",
  "body": { "type": "TextualBody", "value": "Peak value" },
  "target": {
    "source": "figure.svg",
    "selector": {
      "type": "SvgSelector",
      "value": "<svg><polygon points='100,200 300,200 300,400 100,400'/></svg>"
    }
  }
}
```

## Selector Types Relevant for Drawing App
- **SvgSelector** -- arbitrary SVG shape as region. Maps directly to drawing primitives.
- **FragmentSelector** -- `xywh=100,200,300,400` for rectangles.
- **PointSelector** -- single point.
- **RangeSelector** -- start/end pair.

## Key for Our Project
This is THE standard for interoperable annotations. Using it means:
- Annotations can be consumed by Hypothes.is, Annotorious, IIIF tools
- The `SvgSelector` type maps directly to canvas drawing primitives
- Body can be any content type (LaTeX, table data, text)
- Proven schema adopted by digital humanities, libraries, publishers

## Key Insight
Model each drawing element as a W3C annotation: body = the content (LaTeX equation, label text, table data), target = spatial region on the canvas. The canvas IS the annotation target.
