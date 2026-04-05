# Table of Contents

## Project
- [Brand](brand.md) -- Product name (\figure / slashfigure), domain (slashfigure.com)
- [Deferred Decisions](deferred.md) -- Features and decisions explicitly deferred to post-MVP

## Features
- [Drawing Primitives](features/drawing-primitives.md) -- MVP shapes, arrows, text, equations, tables, images; element architecture
- [Tables](features/tables.md) -- Table element with live LaTeX preview and copy-as-LaTeX
- [Metadata Panel](features/metadata-panel.md) -- Visible auto-generated metadata, pinned user edits, display modes
- [LLM Integration](features/LLM-integ.md) -- BYOK, hosted proxy, local inference (post-MVP)
- [Matplotlib Import](features/matplotlib-import.md) -- SVG import path, PDF limitations, future Python helper
- [Project Format](features/project-format.md) -- .slashfigure zip vs working directory, multi-page, autosave
- [Version History](features/version-history.md) -- Snapshots, branching, git-trackable metadata.md

## Infrastructure
- [Hosting](infra/hosting.md) -- Cloudflare Pages + Worker architecture, why not Vercel
- [Auth](infra/auth.md) -- OAuth options (Clerk vs Auth.js vs Lucia) for LLM proxy gating
- [Tech Stack](infra/tech-stack.md) -- Framework, rendering, libraries, build tools
- [Framework Decision](infra/framework.md) -- SolidJS vs vanilla signals tradeoffs, recommendation
- [Export Architecture](infra/export.md) -- SVG-first pipeline, PDF-primary, pixel-perfect cross-format, TikZ assessment
- [Code Quality](infra/code-quality.md) -- LLM-friendly coding practices, file structure, naming, comments, patterns

## UX
- [Project Creation](UX/project-creation.md) -- Two-mode selector (single file vs working directory), save dialog behavior

## Research
- [Research Table of Contents](research/research_table_of_contents.md) -- 76 sources from initial exploration
