# FigurA11y

- **Full Name:** FigurA11y -- AI-powered Alt Text for Scientific Figures
- **URL:** https://github.com/allenai/figura11y
- **Paper:** ACM IUI 2024
- **Stars:** ~14
- **License:** Apache-2.0

## What It Does
Generates alt text for scientific figures via a pipeline: extract figure metadata (type classification, data tables, OCR text), assemble prompts with guidelines, use LLMs to generate descriptions.

## Pipeline
1. Figure type classification
2. Data table extraction via pretrained models
3. OCR text extraction
4. Caption and paragraph context
5. Structured prompt assembly
6. LLM generates draft description

## Key for Our Project
**FigurA11y's pipeline is the closest published system to our metadata approach.** The key difference: our app has the ADVANTAGE of generating metadata during drawing (not post-hoc from an image), eliminating OCR and figure classification entirely. We know what every element is because the user placed it.

## Key Insight
Our app solves FigurA11y's hardest problems for free: we don't need to classify figure types, OCR text, or extract data tables -- the user provides all of this through their drawing actions. The metadata is a byproduct of creation, not a reconstruction from pixels.
