# Hosting Infrastructure

## Decision: Static SPA on Cloudflare Pages + Worker

### Architecture
```
User Browser (SPA)
  ├── Drawing app (Canvas rendering, all logic client-side)
  ├── File save/load (IndexedDB / File System API)
  ├── LaTeX rendering (MathJax in-browser)
  ├── Export (Canvas.toBlob, SVG serialize -- all client)
  │
  └── LLM calls ──> Cloudflare Worker (proxy)
                      ├── Auth check (session cookie)
                      ├── Rate limit
                      └── Forward to Anthropic/OpenAI API
```

### Why Cloudflare Pages over Vercel
| Factor | Cloudflare Pages | Vercel |
|---|---|---|
| Static delivery | Global edge, fastest CDN | Good but optimized for SSR |
| Cold starts | None (Workers are V8 isolates) | ~250ms on serverless |
| Free tier | Unlimited bandwidth, 500 builds/mo | 100GB bandwidth |
| Workers (compute) | Same platform, 0ms routing | Separate serverless functions |
| Cost at scale | $5/mo flat | $20/mo + usage |
| SSR support | Not needed | Over-engineered for SPA |

### Why NOT a server
- Canvas rendering: must be client (60fps, can't round-trip)
- Hit testing: must be client (<1ms with rbush)
- LaTeX rendering: MathJax in-browser, ~5ms
- File operations: browser APIs (IndexedDB, File System Access API)
- Export: client-side Canvas/SVG serialization
- Only server need: LLM API key proxy (~30 lines of code)

### Deployment
- `main` branch -> Cloudflare Pages auto-deploy
- Worker deployed alongside via `wrangler`
- Environment variables for API keys in Cloudflare dashboard
- Custom domain via Cloudflare DNS (free)

### Future Scaling Path
| Need | Solution |
|---|---|
| User accounts / persistence | Cloudflare D1 (SQLite at edge) or Supabase |
| Real-time collaboration | Yjs + Cloudflare Durable Objects (or separate signaling server) |
| Heavy compute (PDF export) | Cloudflare Worker with WASM module |
| File storage (large assets) | Cloudflare R2 (S3-compatible, no egress fees) |

## Resolved Decisions
- **Domain:** slashfigure.com (see `docs/brand.md`)
- **CI/CD:** GitHub Actions → Cloudflare Pages. More control, lets us run export consistency tests before deploy.
- **Error monitoring:** Bug report page in-app for MVP. Sentry free tier (5K events/mo) when needed. Cloudflare Analytics for traffic.
- **Staging:** Yes, via Cloudflare preview deployments (free, automatic on every PR).
- **Why Cloudflare over AWS:** For a static SPA + one LLM proxy function, Cloudflare is simpler (1 config vs 4+ services), cheaper (free tier vs billing surprises), faster (0ms cold start Workers vs 250ms+ Lambda@Edge), and has unlimited free bandwidth. AWS wins only when you need persistent containers, RDS, SQS -- we don't.
