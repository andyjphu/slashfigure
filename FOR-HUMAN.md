# For Human -- Design & Polish Tasks

Tasks that require human design judgment, not AI implementation. Review periodically.

## Cursor Set (Release 2)

**Current state:** Using Lucide `rotate-cw` icon as the rotation cursor. All other cursors are browser defaults (resize, move, crosshair, pointer). The result is visually inconsistent -- the rotation cursor looks different from the system cursors around it.

**Goal for release 2:** Design a coherent custom cursor set that:
- Matches macOS native cursor style (black arrow with white outline aesthetic)
- Covers: select, move, resize (8 directions), rotate, crosshair (create), grab/grabbing (pan), text (I-beam)
- Is crisp at both 1x and 2x (Retina) DPI
- Feels native on macOS -- reference [daviddarnes/mac-cursors](https://github.com/daviddarnes/mac-cursors) for the system cursor style

**Priority:** Low until end-to-end functionality is complete. Defer to release 2 polish phase.
