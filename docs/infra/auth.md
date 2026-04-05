# Authentication Infrastructure

## Decision: Deferred to post-MVP (see docs/deferred.md)

## Context
Auth is only needed for the LLM proxy feature (gating API usage). The drawing app itself works without login.

## Options

### Option A: Clerk (Hosted)
- **Pros:** Fastest to implement, UI components included, free 10K MAU, Google/GitHub/email out of box
- **Cons:** Vendor lock-in, hosted dependency, pricing at scale
- **Effort:** ~1 hour

### Option B: Auth.js (Self-hosted)
- **Pros:** Open source, framework-agnostic, many providers, no vendor lock-in
- **Cons:** More setup, need session storage (Cloudflare KV or D1)
- **Effort:** ~4 hours

### Option C: Lucia (Lightweight)
- **Pros:** Minimal, self-hosted, designed for edge runtimes
- **Cons:** Lower-level, more manual work
- **Effort:** ~6 hours

### Option D: Cloudflare Access (Zero Trust)
- **Pros:** Built into Cloudflare, no code needed, SSO support
- **Cons:** Gates entire pages (not fine-grained per-feature), enterprise-oriented UX
- **Effort:** ~30 min but coarse control

## Recommendation
**Clerk for MVP** (ship fast, free tier generous). Migrate to Auth.js if/when vendor lock-in becomes a concern or costs rise past 10K MAU.

## Resolved Decisions
- **Deferred to post-MVP.** Auth is only needed for the LLM proxy, which is post-MVP. App is client-side only, saves to browser (IndexedDB / File System API).
- **When implemented:** Google + GitHub OAuth, social only (no email/password), 30-day sessions refreshed on activity.
- See `docs/deferred.md` for full deferral context.
