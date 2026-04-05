# Mermaid

- **Full Name:** Mermaid.js
- **URL:** https://github.com/mermaid-js/mermaid
- **Stars:** ~87,100
- **License:** MIT

## What It Does
Text-to-SVG diagram renderer. Flowcharts, sequence diagrams, Gantt, class, state, ER diagrams from Markdown-like syntax.

## Key for Our Project
**Mermaid is the clear winner for LLM token efficiency:** ~50 tokens for a simple diagram vs ~1,200 for draw.io XML vs ~500 for Excalidraw JSON. LLMs already know Mermaid syntax well.

Should be a **primary export format** from the drawing app -- every canvas state should be convertible to Mermaid where applicable (flowcharts, sequence diagrams, etc.).

## Key Insight
Mermaid is a target output format for our metadata, not a rendering engine for the app itself. When the user draws a box-and-arrow diagram, the metadata layer should be able to export Mermaid syntax that an LLM can read/edit.
