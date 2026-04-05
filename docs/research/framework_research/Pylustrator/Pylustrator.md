# Pylustrator

- **Full Name:** Pylustrator -- Code Generation for Reproducible Figures
- **URL:** arXiv:1910.00279
- **License:** Check paper

## What It Does
GUI where users compose Matplotlib figures interactively, with all changes tracked and converted to Python/Matplotlib code automatically integrated into the calling script.

## Key for Our Project
This is the hybrid model our app should target: **visual editing that generates reproducible code.** "Layout-first" approach where visual arrangement drives code generation.

## Key Insight
The bidirectional flow (visual edit -> code, code -> visual) is what makes scientific figures reproducible. Our metadata layer should enable the same: draw visually, export as code (TikZ, Matplotlib, Typst).
