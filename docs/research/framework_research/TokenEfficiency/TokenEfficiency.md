# Token Efficiency Analysis

- **Full Name:** Analyzing Diagramming Tools for the LLM Age
- **URL:** https://dev.to/akari_iku/analyzing-the-best-diagramming-tools-for-the-llm-age-based-on-token-efficiency-5891
- **Type:** Blog Post

## Key Findings
| Format | Tokens (simple diagram) |
|--------|------------------------|
| Mermaid | ~50 |
| PlantUML | ~80 |
| Excalidraw JSON | ~500 |
| draw.io XML | ~1,200 |

XML/JSON is up to **24x more token-expensive** than Markdown-like formats.

## Key for Our Project
**This directly informs our metadata format design.** Maintain two representations:
1. **Internal:** Rich JSON for rendering/persistence (positions, styles, full fidelity)
2. **LLM-facing:** Compact Mermaid-like text for LLM consumption (~50 tokens)

Never send the full JSON to an LLM when a compact text summary would suffice.
