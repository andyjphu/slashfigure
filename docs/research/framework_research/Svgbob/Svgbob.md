# Svgbob

- **Full Name:** Svgbob
- **URL:** https://github.com/ivanceras/svgbob
- **Stars:** ~4,168
- **License:** Apache-2.0
- **Language:** Rust

## What It Does
Converts ASCII art diagrams into clean SVG. Recognizes lines (`|`, `-`, `/`), arrows (`>`), boxes, and curves from plain text.

## Key for Our Project
The Svgbob ASCII dialect is a compact, LLM-friendly way to represent diagrams. The app could EXPORT canvas state as Svgbob-compatible ASCII:
```
+----------+     +----------+
|  Cell A  |---->|  Cell B  |
+----------+     +----------+
      |
      v
+----------+
|  Cell C  |
+----------+
```

This gives LLMs a spatial text representation they can both read and generate. Combined with our metadata system, this becomes the "ASCII approximation" of the drawing.

## Key Insight
Svgbob is the bridge between our "ASCII approximation" metadata requirement and renderable SVG. Export canvas -> ASCII -> LLM reads it. LLM generates ASCII -> Svgbob -> import to canvas.
