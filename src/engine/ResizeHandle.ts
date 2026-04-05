import type { BoundingBox, Point } from "./types";

export type HandlePosition =
  | "top-left" | "top" | "top-right"
  | "left" | "right"
  | "bottom-left" | "bottom" | "bottom-right";

const HANDLE_SIZE = 8;

export interface HandleInfo {
  position: HandlePosition;
  screenX: number;
  screenY: number;
  cursor: string;
}

/** Get the 8 resize handle positions for a screen-space bounding box */
export function getHandles(bounds: BoundingBox): HandleInfo[] {
  const { x, y, width, height } = bounds;
  const midX = x + width / 2;
  const midY = y + height / 2;

  return [
    { position: "top-left", screenX: x, screenY: y, cursor: "nwse-resize" },
    { position: "top", screenX: midX, screenY: y, cursor: "ns-resize" },
    { position: "top-right", screenX: x + width, screenY: y, cursor: "nesw-resize" },
    { position: "right", screenX: x + width, screenY: midY, cursor: "ew-resize" },
    { position: "bottom-right", screenX: x + width, screenY: y + height, cursor: "nwse-resize" },
    { position: "bottom", screenX: midX, screenY: y + height, cursor: "ns-resize" },
    { position: "bottom-left", screenX: x, screenY: y + height, cursor: "nesw-resize" },
    { position: "left", screenX: x, screenY: midY, cursor: "ew-resize" },
  ];
}

/** Check if a screen point hits a resize handle. Returns the handle or null. */
export function hitTestHandles(screenPoint: Point, bounds: BoundingBox): HandleInfo | null {
  const handles = getHandles(bounds);
  const halfSize = HANDLE_SIZE / 2 + 2; // Extra 2px tolerance

  for (const handle of handles) {
    if (
      Math.abs(screenPoint.x - handle.screenX) <= halfSize &&
      Math.abs(screenPoint.y - handle.screenY) <= halfSize
    ) {
      return handle;
    }
  }
  return null;
}

const ROTATION_ZONE_INNER = HANDLE_SIZE / 2 + 3;
const ROTATION_ZONE_OUTER = HANDLE_SIZE / 2 + 18;

/** Check if a screen point is in the rotation zone just outside a corner handle */
export function hitTestRotation(screenPoint: Point, bounds: BoundingBox): boolean {
  const corners = getHandles(bounds).filter((h) =>
    h.position === "top-left" || h.position === "top-right" ||
    h.position === "bottom-left" || h.position === "bottom-right"
  );

  for (const corner of corners) {
    const dx = screenPoint.x - corner.screenX;
    const dy = screenPoint.y - corner.screenY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Must be outside the resize handle but within the rotation zone
    if (dist > ROTATION_ZONE_INNER && dist < ROTATION_ZONE_OUTER) {
      // Also check that the point is on the outside of the bounding box
      const pointOutside =
        screenPoint.x < bounds.x - 2 || screenPoint.x > bounds.x + bounds.width + 2 ||
        screenPoint.y < bounds.y - 2 || screenPoint.y > bounds.y + bounds.height + 2;
      if (pointOutside) return true;
    }
  }
  return false;
}

/** Apply a resize delta to an element's x, y, width, height based on which handle is being dragged */
export function applyResize(
  handle: HandlePosition,
  originalX: number,
  originalY: number,
  originalWidth: number,
  originalHeight: number,
  deltaWorldX: number,
  deltaWorldY: number,
): { x: number; y: number; width: number; height: number } {
  let x = originalX;
  let y = originalY;
  let width = originalWidth;
  let height = originalHeight;

  // Horizontal
  if (handle.includes("left")) {
    x = originalX + deltaWorldX;
    width = originalWidth - deltaWorldX;
  } else if (handle.includes("right")) {
    width = originalWidth + deltaWorldX;
  }

  // Vertical
  if (handle.includes("top")) {
    y = originalY + deltaWorldY;
    height = originalHeight - deltaWorldY;
  } else if (handle.includes("bottom")) {
    height = originalHeight + deltaWorldY;
  }

  // Allow flipping: if width/height goes negative, flip the origin
  if (width < 0) {
    x = x + width;
    width = -width;
  }
  if (height < 0) {
    y = y + height;
    height = -height;
  }

  return { x, y, width, height };
}
