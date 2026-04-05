# Version History / Snapshots

## Undo/Redo
- In-memory unlimited undo/redo via command pattern
- Lost on close (not persisted)

### Granularity Rules
- **Drag/resize:** Each drag or resize operation is one undo step (snap back to original position/size)
- **Text editing:** Group by word boundary (Figma-style). Typing "hello world" = 2 undo steps. Pause (~500ms) mid-word also starts a new group.
- **Multi-object operations:** One undo step. Select 5 shapes and delete = one undo restores all 5.
- **Paste:** One undo step regardless of how many objects are pasted.
- **Rapid successive changes to same object:** Coalesce into one step. Clicking through a color picker red→blue→green quickly = one undo step back to red. A ~500ms pause between changes starts a new group.

## Snapshots
Persistent named versions saved inside the project.

### Auto-snapshots
- On close
- Every 10 minutes
- Auto-snapshots are unnamed, timestamped, pruned to keep last 20

### Manual snapshots
- User-triggered via UI button or Ctrl+Shift+S
- User can name the snapshot
- Not auto-pruned

### Snapshot Contents
Each snapshot stores:
- Full scene graph JSON (all pages)
- A **minified preview thumbnail:** greyed-out blobby silhouette of the figure. Bounds defined by content top-left to content bottom-right (not full canvas). Low resolution, ~50x50px, just enough to visually distinguish snapshots.

### Branching
- User can create a new branch (working copy) from any snapshot
- Branches are independent copies that diverge from that point
- Branch list shown in version history panel
- No merging (too complex, not needed for drawing)

## Git Integration (Working Directory Mode)
The `metadata.md` file in working directory mode is the git-trackable artifact. On every save:
1. Scene graph is saved to `pages/*.json`
2. `metadata.md` is regenerated from the scene graph
3. User commits to git as normal

Git diffs show:
```diff
- Panel A: red square in top-left corner, 50x50px
+ Panel A: red square in top-right corner, 50x50px
```

No special tooling needed. Standard git.
