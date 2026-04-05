/**
 * Custom CSS cursors.
 *
 * Uses Lucide's rotate-cw icon as the rotation cursor.
 * The SVG is sourced directly from the lucide-solid package (not hand-drawn).
 *
 * TODO: Design a coherent custom cursor set for release 2 (see FOR-HUMAN.md).
 */

// Lucide rotate-cw icon paths, rendered at 20x20 for cursor use.
// Stripped the preview background style -- only the icon paths remain.
const LUCIDE_ROTATE_CW_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"',
  ' fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">',
  '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>',
  '<path d="M21 3v5h-5"/>',
  "</svg>",
].join("");

const encoded = btoa(LUCIDE_ROTATE_CW_SVG);

export const ROTATE_CURSOR = `url('data:image/svg+xml;base64,${encoded}') 10 10, pointer`;
