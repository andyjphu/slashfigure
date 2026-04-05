# Typograms

- **Full Name:** Typograms (by Google)
- **URL:** https://github.com/google/typograms
- **Stars:** ~1,304
- **License:** Apache-2.0

## What It Does
Lightweight ASCII diagram format for technical documentation. Strict grammar with defined connection rules. JS renderer for browsers.

## Key for Our Project
The most "parseable" ASCII diagram format due to strict grammar. Ideal for round-tripping:
1. Canvas -> typogram text
2. LLM reads typogram
3. LLM edits typogram
4. Render back to canvas

Stricter than Svgbob = fewer ambiguities = more reliable LLM generation.
