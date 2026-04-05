# LLM Integration

## Overview
The drawing app generates structured metadata as the user draws. LLMs consume this metadata to understand, describe, and reason about scientific figures. The LLM does NOT modify the drawing -- it reads it.

## Metadata Generation (Core)

Every drawing action produces metadata at three levels of fidelity:

### 1. Structured JSON (internal, full fidelity)
Complete scene graph: element types, positions, dimensions, styles, relationships, grouping. Used for persistence and rendering.

### 2. Compact Text Summary (LLM-facing, ~50 tokens)
Mermaid-like or DiagrammerGPT-plan-like format for token-efficient LLM consumption:
```
Figure: 2-panel layout
Panel A (left): scatter plot, x="Time (s)", y="Voltage (mV)", n=50 points
  - Annotation: "Peak" label at (3.2, 45.1) with arrow
Panel B (right): bar chart, categories=["Control", "Treatment"], y="Response Rate"
  - Table below: 2x3, headers=["Group", "Mean", "SD"]
```

### 3. ASCII Approximation (spatial, ~200 tokens)
Text-art representation preserving spatial layout:
```
+------------------+  +------------------+
|   Panel A        |  |   Panel B        |
|      .  *Peak    |  |  ___             |
|    . .           |  | |   | ___        |
|   .    .         |  | |   ||   |       |
|  .      .        |  | |___||___|       |
|  Time (s) ->     |  |  Ctrl  Treat     |
+------------------+  +------------------+
         |  Group | Mean | SD  |
         |--------|------|-----|
         | Ctrl   | 3.2  | 0.4 |
         | Treat  | 5.1  | 0.6 |
```

## LLM Access Modes

### Mode 1: BYOK (Bring Your Own Key)
- User pastes their API key (OpenAI, Anthropic, etc.) into settings
- Stored in `localStorage`, never leaves browser
- Client calls API directly
- **No server needed. Zero cost.**
- Best for: technical users, researchers with institutional API access

### Mode 2: Hosted Proxy (Authenticated)
- User logs in (Google/GitHub OAuth)
- Client sends metadata to Cloudflare Worker
- Worker attaches our API key, forwards to LLM provider
- Per-user rate limiting (N calls/day)
- **Requires auth + thin server**

### Mode 3: Local Inference (Future)
- Small model (Llama 3.2 3B / Phi-3 Mini) runs in-browser via WebGPU
- Libraries: WebLLM or Transformers.js
- ~2-4GB model download (cached after first load)
- **Zero server, zero key, works offline**
- Best for: privacy-sensitive users, offline use, simple tasks

## LLM Features (Read-Only)

### Figure Description
- "Describe this figure" -> natural language description suitable for alt text, paper methods section, or slide notes
- Uses all three metadata levels for best output
- Validated by research: structured metadata outperforms GPT-4o vision by 29.4% (DePlot) and catches entities/relationships that vision misses (arXiv:2502.04389)

### Figure Q&A
- "What does Panel B show?" -> answers using metadata context
- "How many data points are in the scatter plot?" -> answers from element metadata

### Export Assistance
- "Generate a LaTeX caption for this figure"
- "Write alt text for accessibility compliance"
- "Summarize this figure for a poster abstract"

### Metadata Verification (Future)
- LLM audits metadata against rendered figure: "The metadata says there are 3 bars but I see 4"
- DiagrammerGPT planner-auditor pattern

## Auth & Abuse Prevention (for Hosted Proxy)

| Layer | What | Effort |
|---|---|---|
| CORS origin check | Only accept requests from our domain | 1 line |
| Cloudflare rate limiting | N requests/min per IP | Built-in, 2 min |
| Auth gate | Login required for LLM features | OAuth setup |
| Per-user rate limit | N calls/day per authenticated user | Worker logic |
| Spending cap | Hard $ limit on Anthropic dashboard | 1 min |
| Turnstile (optional) | Prove human before session token | If abuse seen |

## Freemium Model (Potential)

| Tier | Drawing App | LLM Features |
|---|---|---|
| Free (no login) | Full access | None (or BYOK) |
| Free (logged in) | Full access | N calls/day on our key |
| Paid | Full access | Unlimited calls on our key |

## Non-Goals
- LLM does NOT modify the canvas directly
- LLM does NOT generate figures from text prompts (out of scope for v1)
- No fine-tuned models -- use general-purpose LLMs with structured metadata
- No training on user data

## Resolved Decisions
- **Metadata panel:** Visible in right sidebar. See `docs/features/metadata-panel.md`.
- **LLM providers:** Provider-agnostic (Anthropic, OpenAI, local). BYOK sends to user's chosen provider.
- **Default:** BYOK as default. Hosted proxy as opt-in for logged-in users.
- **Rate limit:** 20 calls/day free for logged-in users on our key.
- **IMPORTANT: Entire LLM integration is deferred to post-MVP.** Metadata panel and generation ship with MVP, but LLM features (describe, Q&A, export assist) are post-MVP. See `docs/deferred.md`.
