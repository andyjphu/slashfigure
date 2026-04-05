# DiagrammerGPT

- **Full Name:** DiagrammerGPT
- **URL:** https://diagrammergpt.github.io/
- **Paper:** COLM 2024 (arXiv:2310.12128)
- **License:** Research

## What It Does
Two-stage framework using LLMs to generate diagrams. Stage 1: LLM creates "diagram plans" describing entities, relationships, and bounding box layouts. Stage 2: diagram generator renders the plan.

## Diagram Plan Format
```
Entities: [obj 0: "Server", bbox: [10, 20, 30, 15]]
Relationships: [obj 0] has an arrow to [obj 1]
Labels: [text label 0] labels [obj 0]
```
Normalized coordinates (0-100), entity lists with bounding boxes, explicit relationship descriptions.

## Key for Our Project
**The "diagram plan" format is a strong candidate for our metadata format.** It is:
- Compact (token-efficient)
- LLM-readable and LLM-writable
- Contains spatial information via normalized coordinates
- Describes relationships explicitly
- Includes a planner-auditor feedback loop

## Key Insight
The planner-auditor pattern: LLM generates a plan, a separate auditor LLM reviews and corrects it. This could be adapted for our "LLM understands the figure" use case -- generate metadata, then have an LLM verify it matches the visual.
