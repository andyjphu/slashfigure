/**
 * Centralized color and style tokens for the entire app.
 * Modify these to change the accent color, selection styling, etc.
 *
 * Canvas-side values are hex strings (used in Canvas 2D API).
 * UI-side values are Tailwind class fragments (used in JSX).
 */

// -- Accent / Selection --

/** Primary accent color used for selection outlines, active tool highlights */
export const ACCENT_COLOR = "#4a90d9";

/** Selection outline on canvas elements */
export const SELECTION_STROKE = "#4a90d9";

/** Selection handle fill (the white squares / circles) */
export const SELECTION_HANDLE_FILL = "#ffffff";

/** Selection handle border */
export const SELECTION_HANDLE_STROKE = "#4a90d9";

/** Marquee selection fill (semi-transparent) */
export const MARQUEE_FILL = "rgba(74, 144, 217, 0.08)";

/** Marquee selection border */
export const MARQUEE_STROKE = "#4a90d9";

/** Text editing overlay border */
export const TEXT_EDIT_BORDER = "#4a90d9";

// -- UI (Tailwind class fragments for the SolidJS UI layer) --

/** Active tool button in toolbar */
export const UI_TOOL_ACTIVE = "bg-blue-100 text-blue-700";

/** Inactive tool button hover */
export const UI_TOOL_INACTIVE = "text-gray-600 hover:bg-gray-100";

// -- Default element styles --

/** Default fill for new rectangles */
export const DEFAULT_RECT_FILL = "#4a90d9";
export const DEFAULT_RECT_STROKE = "#2c5f8a";

/** Default fill for new text */
export const DEFAULT_TEXT_FILL = "#333333";

/** Default stroke for new arrows */
export const DEFAULT_ARROW_STROKE = "#333333";
