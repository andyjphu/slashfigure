# Project Creation Flow

## Two Modes

When a user creates a new project, they choose between two modes via a visual selector (side-by-side cards with illustrations):

### 1. Single File
- **Recommended for:** Quick projects, one-off figures, sharing via email/Slack
- **What it creates:** `my-figure.sf` (one zip file containing everything)
- **Visual indicator:** Single document icon
- **Explanation text:** "Everything in one file. Easy to share and move around."

### 2. Working Directory
- **Recommended for:** Projects tracked by git, monorepos, LLM-readable workflows
- **What it creates:**
  ```
  slashfigure/                     # directory (default name)
  ├── manifest.json                # version, page list, settings
  ├── metadata.md                  # auto-generated text metadata (git-tracked)
  ├── .gitignore                   # ignores assets/, snapshots/
  ├── pages/
  │   └── page-1.json             # scene graph per page
  ├── assets/                      # embedded images
  └── snapshots/                   # version snapshots
  ```
- **Visual indicator:** Folder icon with visible sub-files
- **Explanation text:** "Your LLM can read your figures directly. Best for git repos."
- **Git integration:** `metadata.md` and `pages/*.json` produce meaningful diffs in PRs. Assets and snapshots are gitignored by default.

### Save Dialog Behavior (Working Directory)
- Default folder name: `slashfigure`
- In the OS save dialog, place the cursor/selection BEFORE `slashfigure` so the user can easily prepend their project name (e.g., `my-experiment.slashfigure`)

### Conversion
- Users can convert between modes at any time via File > Convert Project Format
- Single File → Working Directory: unzips `.sf` into directory structure, generates `metadata.md` and `.gitignore`
- Working Directory → Single File: zips into `.sf` file (excludes `metadata.md` and `.gitignore`)

## UX Principles Applied
- The choice is presented ONCE at project creation. No subsequent nagging.
- Default selection: Single File (lower cognitive load for new users).
- The visual cards should make the difference obvious without reading text.
- No jargon. "Working Directory" not "git-compatible multi-file workspace."
