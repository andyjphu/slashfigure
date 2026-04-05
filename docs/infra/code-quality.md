# Code Quality: LLM-Friendly Practices

## Guiding Principle
All code must be understood, maintained, updated, and generated well by LLMs. This is a first-class design constraint, not an afterthought.

## File Structure

### Size
- **Target: 150-500 lines per file.** Academic research shows LLM code comprehension degrades above 500 lines. GitHub Copilot pulls only ~60 relevant lines from each open file.
- **One responsibility per file.** If you can't describe the file's purpose in one sentence, split it.
- **Lint enforcement at ~550 lines** to catch violations before merge.

### Organization
- **Flat over deep.** Max 3-4 directory levels. Group by feature, not by technical layer.
- **Feature co-location:** `src/shapes/rectangle.ts`, `src/shapes/rectangle.test.ts`, `src/shapes/rectangle.types.ts` -- not separate `models/`, `services/`, `tests/` trees.

## Naming

**This is the single biggest factor in LLM code understanding** (academic: code search accuracy drops from ~70% to ~17% with poor names).

- **Functions:** Descriptive verbs. `calculateBoundingBox()` not `calcBB()`.
- **Variables:** Full words. `selectedElements` not `selElems`.
- **Booleans:** `is_`, `has_`, `should_` prefixes. `isSelected`, `hasOverlap`.
- **Constants:** Descriptive ALL_CAPS. `MAX_CANVAS_ZOOM` not `MAX_Z`.
- **Parameters:** Self-documenting. `timeoutMilliseconds` not `ms`.
- **No single-letter variables** except trivial loop counters.
- **Never use misleading names.** LLMs trust that `userList` is a list.

## Type Annotations

- **TypeScript strict mode** (`strict: true` in tsconfig). Enables `noImplicitAny`, `strictNullChecks`, etc.
- **Annotate non-obvious types** even when inference works. `const shapes: Shape[] = []` is better than `const shapes = []` for LLM comprehension.
- Types serve as machine-readable documentation of contracts.

## Comments

### Write "why" comments, not "what" comments
LLMs can read code. They cannot read your mind.

```typescript
// Good: explains WHY
// Using Map instead of plain object because keys can be arbitrary
// user strings including "__proto__" (prototype pollution risk)
const sessions = new Map<string, Session>();

// Bad: restates the code
// Create a new map
const sessions = new Map<string, Session>();
```

### Module-level documentation
Open files with a 10-20 line comment explaining:
1. What this module does
2. Why this approach was chosen
3. What alternatives were considered

### Intent comments on conditionals and magic values
If future-you (or future-LLM) won't understand why a condition exists, explain it.

## Patterns

### DO
- **Explicit over implicit** -- no metaprogramming, no eval, no magic
- **Composition over inheritance** -- keep behavior visible and local
- **Consistent patterns everywhere** -- if you fetch data one way, do it that way everywhere
- **Functions: 20-40 lines** doing one testable thing
- **Async/await** over promise chains
- **Early returns** over nested if/else
- **Specific error handling** -- catch specific types, document expected errors
- **Explicit imports** -- `import { Shape } from './types'` not `import * from './types'`

### DON'T
- **No dynamic dispatch / eval / exec**
- **No complex decorator stacks** that transform function signatures
- **No implicit global state** -- pass dependencies as parameters
- **No monkey-patching** or runtime module modification
- **No deep inheritance hierarchies** (max 1-2 levels)
- **No circular imports**
- **No framework "magic"** where behavior depends on file naming conventions

## Documentation Architecture

### CLAUDE.md
- Under 200 lines. Only things LLMs can't infer from code.
- Build/test/lint commands, project-specific conventions, architectural decisions, gotchas.
- References `docs/TABLE_OF_CONTENTS.md` for navigation.

### Architecture Decision Records (ADRs)
Stored in `docs/adr/`. Capture decisions with context:
```markdown
# ADR-001: SVG-First Export Pipeline
## Status: Accepted
## Context: [why we needed to decide]
## Decision: [what we chose]
## Consequences: [what this means going forward]
```

### Feature Docs
Each feature gets `docs/features/<feature>.md`. One purpose per doc.

### Infrastructure Docs
Each infra decision gets `docs/infra/<topic>.md`.

## Verification
- **TypeScript strict mode** catches type errors
- **ESLint** enforces consistent patterns
- **Prettier** handles formatting (no debates)
- **File size lint** warns above 550 lines
- **Tests** validate behavior (unit for core engine, integration for features)

## Sources
- Anthropic: Best Practices for Claude Code
- Academic: "How Does Naming Affect LLMs?" (arXiv:2307.12488v5)
- Addy Osmani: "My LLM Coding Workflow Going into 2026"
- antirez: "Coding with LLMs in the Summer of 2025"
