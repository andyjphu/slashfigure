# Project Format

## File Formats

### Single File Mode: `.sf`
A zip archive containing:
```
experiment.sf (zip)
├── manifest.json              # lightweight: version, page list, settings (~50 lines)
├── pages/
│   ├── page-1.json            # scene graph for page 1 only
│   └── page-2.json            # scene graph for page 2 only
├── assets/
│   ├── img-abc123.png
│   └── img-def456.svg
└── snapshots/
    ├── 2026-04-03T14-30.json
    └── 2026-04-03T14-30.preview.png   # minified blobby greyed-out thumbnail
```

### Working Directory Mode: `slashfigure/`
Same structure as a real directory on disk. Additionally includes `metadata.md` and `.gitignore`:
```
experiment.slashfigure/
├── manifest.json              # lightweight: version, page list, settings
├── metadata.md                # auto-generated, git-tracked text metadata
├── .gitignore                 # ignores assets/, snapshots/, *.preview.png
├── pages/
│   ├── page-1.json            # scene graph for page 1 only
│   └── page-2.json            # scene graph for page 2 only
├── assets/
│   ├── img-abc123.png
│   └── img-def456.svg
└── snapshots/
    ├── 2026-04-03T14-30.json
    └── 2026-04-03T14-30.preview.png
```

### Why Pages Are Split From Manifest
- Each page file stays small (150-500 lines, LLM-friendly)
- Loading page 2 doesn't require parsing page 1
- Git diffs are per-page, not one giant diff

### Default `.gitignore`
```gitignore
# Binary assets (use Git LFS if needed)
assets/

# Snapshots are local history, not shared
snapshots/

# Preview thumbnails
*.preview.png
```

Git tracks: `manifest.json`, `metadata.md`, `pages/*.json`, `.gitignore`. The meaningful, diffable parts.

### Importability
The \figure website can open both formats:
- `.sf` files: unzipped in memory
- `slashfigure/` directories: read via File System Access API (Chrome)

## Multi-Page Support
- Each project can contain multiple pages (tabs at the top of the canvas)
- Each page is a separate JSON file in `pages/`
- Pages are ordered by `manifest.json`

## Saving Behavior
- **Autosave:** Aggressive -- 1.5 seconds after the last change (debounced). Saves on page close via `beforeunload`. Restores last session on app load. Stored in IndexedDB (async, off main thread, no permission prompts). Serialization is lazy -- only runs when the debounce fires, not on every render frame. No performance concern at current project sizes (<1MB JSON). Toggle on/off via File > Autosave.
- **Why aggressive over periodic:** The old spec said every 10 minutes, but losing 10 minutes of work is unacceptable. 1.5s debounce means you never lose more than the last action. IndexedDB writes for small JSON are <1ms so there's no reason to be conservative. If projects grow to multi-MB (large embedded images), we can increase the debounce or move serialization to a Web Worker.
- **Manual save:** Ctrl+S / Cmd+S downloads a `.sf` file.
- **Storage:** IndexedDB for autosave (automatic, no prompts). File System Access API for explicit save (user picks location).
- **Preferences:** Stored in localStorage (e.g., whether to embed metadata in exports, default project mode)

## Snapshots / Version History
See `docs/features/version-history.md`.

## Export Embedding (Opt-in)
- **Metadata in exports:** Opt-in toggle. Embeds text metadata in PNG (iTXt), SVG (`<metadata>`), PDF (XMP).
- **Full project in exports:** Opt-in toggle. Embeds the full `.sf` data in exported images (only feasible for small projects).
- Both preferences persisted in localStorage.

## Naming Convention
- `.sf` = single file extension (short, conventional)
- `slashfigure/` = default working directory name (branded, readable in repos)
- See `docs/brand.md` for full naming rules
