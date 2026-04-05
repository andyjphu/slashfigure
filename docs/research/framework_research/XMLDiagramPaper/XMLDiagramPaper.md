# XML-Driven LLM Diagram Understanding

- **Full Name:** Bypassing Vision Models with XML Source Metadata
- **Paper:** arXiv:2502.04389 (Feb 2025)
- **Type:** Research Paper

## What It Does
Bypasses vision models entirely by extracting diagram metadata from XML source files (XLSX, PPTX, DOCX). Converts shape data to JSON with coordinates, colors, connectors, text.

## Key Finding
**Text-based metadata outperforms GPT-4o's visual recognition** for diagram understanding. The XML/JSON approach correctly identified all entities and relationships while GPT-4o hallucinated and missed connectors.

## Key for Our Project
**Strongest validation for our entire approach.** If extracted metadata beats vision models, then metadata generated AT DRAW TIME (which is even richer and more accurate than post-hoc extraction) will be strictly superior.

Our app doesn't need to "understand" figures visually -- it builds the understanding as the user draws.
