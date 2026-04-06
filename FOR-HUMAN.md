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

## Tooltips Everywhere

**Current state:** Only tool buttons have `title` attributes. Most UI elements (layer eye toggle, fill/stroke visibility, draggable opacity %, stroke width, color swatch, transform fields, menu items) have no tooltips.

**Goal:** Every interactive element should have a tooltip explaining what it does and its keyboard shortcut (if any). Include:
- Tool buttons: name + shortcut (e.g. "Rectangle (R)")
- Transform fields: "X position", "Width", "Angle (degrees)", "Corner radius"
- Fill/Stroke: "Fill color", "Fill opacity (drag to adjust)", "Toggle fill visibility"
- Stroke width: "Stroke width"
- Layer rows: "Click to select, Shift+click for range, Ctrl+click to toggle"
- Layer eye: "Toggle visibility"
- Menu items: action + shortcut
- Math expression support hint on numeric inputs: "Supports +, -, *, /, ()"

**Approach:** Consider a shared `Tooltip` component rather than raw `title` attributes for consistent styling and delay behavior.

**Priority:** Polish pass before release 1.

## Left Sidebar Menu Bar

**When:** Implementing file import/save/export.

**What:** Add a minimal text menu row at the very top of the left sidebar, above "Tools". Just the words: File, Edit, View (only what's necessary). Clicking opens a dropdown with relevant actions. Same visual weight as section headers -- no heavy chrome.
