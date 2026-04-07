import type { BaseNode } from "./nodes/BaseNode";
import { RectangleNode } from "./nodes/RectangleNode";
import { TextNode } from "./nodes/TextNode";
import { PathNode } from "./nodes/PathNode";
import { ImageNode } from "./nodes/ImageNode";
import { FreehandNode } from "./nodes/FreehandNode";
import { TableNode } from "./nodes/TableNode";

export interface Metadata {
  textSummary: string;
  asciiArt: string;
  structuredJson: object;
}

/**
 * Generate LLM-friendly metadata from the scene graph.
 * Pure function: scene graph in, metadata out.
 */
export function generateMetadata(elements: BaseNode[]): Metadata {
  const visibleElements = elements.filter((el) => el.visible);

  return {
    textSummary: generateTextSummary(visibleElements),
    asciiArt: generateAsciiArt(visibleElements),
    structuredJson: generateStructuredJson(visibleElements),
  };
}

function generateTextSummary(elements: BaseNode[]): string {
  if (elements.length === 0) return "Empty figure.";

  const lines: string[] = [];
  lines.push(`Figure with ${elements.length} element${elements.length === 1 ? "" : "s"}:`);

  for (const el of elements) {
    const pos = `at (${Math.round(el.x)}, ${Math.round(el.y)})`;
    const size = `${Math.round(el.width)}x${Math.round(el.height)}`;

    if (el instanceof RectangleNode) {
      const rotation = el.rotation !== 0 ? `, rotated ${Math.round(el.rotation * 180 / Math.PI)}°` : "";
      lines.push(`- Rectangle ${size} ${pos}, fill: ${el.style.fillColor}${rotation}`);
    } else if (el instanceof TextNode) {
      const preview = el.content.length > 40 ? el.content.slice(0, 40) + "..." : el.content;
      lines.push(`- Text "${preview}" ${pos}, ${el.fontSize}px`);
    } else if (el instanceof PathNode) {
      const vertCount = el.vertices.length;
      const cap = el.endCap === "arrow" ? " with arrowhead" : "";
      lines.push(`- ${el.closed ? "Polygon" : "Line"} (${vertCount} points)${cap} ${pos}`);
    } else if (el instanceof ImageNode) {
      lines.push(`- Image ${size} ${pos}`);
    } else if (el instanceof TableNode) {
      lines.push(`- Table ${el.rowCount}x${el.colCount} ${pos}`);
    } else if (el instanceof FreehandNode) {
      lines.push(`- Freehand stroke (${el.inputPoints.length} points) ${pos}`);
    }
  }

  return lines.join("\n");
}

function generateAsciiArt(elements: BaseNode[]): string {
  if (elements.length === 0) return "(empty)";

  // Compute bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    const bounds = el.getWorldBounds();
    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.x + bounds.width);
    maxY = Math.max(maxY, bounds.y + bounds.height);
  }

  // Render to a fixed-size ASCII grid
  const gridWidth = 60;
  const gridHeight = 30;
  const scaleX = gridWidth / (maxX - minX || 1);
  const scaleY = gridHeight / (maxY - minY || 1);

  const grid: string[][] = Array.from({ length: gridHeight }, () =>
    Array.from({ length: gridWidth }, () => " "),
  );

  for (const el of elements) {
    const bounds = el.getWorldBounds();
    const left = Math.round((bounds.x - minX) * scaleX);
    const top = Math.round((bounds.y - minY) * scaleY);
    const right = Math.min(gridWidth - 1, Math.round((bounds.x + bounds.width - minX) * scaleX));
    const bottom = Math.min(gridHeight - 1, Math.round((bounds.y + bounds.height - minY) * scaleY));

    // Draw border
    for (let x = left; x <= right; x++) {
      if (top >= 0 && top < gridHeight) grid[top][x] = "-";
      if (bottom >= 0 && bottom < gridHeight) grid[bottom][x] = "-";
    }
    for (let y = top; y <= bottom; y++) {
      if (y >= 0 && y < gridHeight) {
        if (left >= 0 && left < gridWidth) grid[y][left] = "|";
        if (right >= 0 && right < gridWidth) grid[y][right] = "|";
      }
    }
    // Corners
    if (top >= 0 && left >= 0 && top < gridHeight && left < gridWidth) grid[top][left] = "+";
    if (top >= 0 && right < gridWidth && top < gridHeight) grid[top][right] = "+";
    if (bottom < gridHeight && left >= 0 && left < gridWidth) grid[bottom][left] = "+";
    if (bottom < gridHeight && right < gridWidth) grid[bottom][right] = "+";

    // Label
    if (el instanceof TextNode && el.content) {
      const label = el.content.slice(0, right - left - 1);
      const labelY = Math.min(top + 1, gridHeight - 1);
      for (let i = 0; i < label.length && left + 1 + i < gridWidth; i++) {
        if (labelY >= 0 && labelY < gridHeight) {
          grid[labelY][left + 1 + i] = label[i];
        }
      }
    }
  }

  return grid.map((row) => row.join("")).map((line) => line.trimEnd()).join("\n");
}

function generateStructuredJson(elements: BaseNode[]): object {
  return {
    elementCount: elements.length,
    elements: elements.map((el) => ({
      id: el.id,
      type: el.type,
      name: el.name,
      position: { x: Math.round(el.x), y: Math.round(el.y) },
      size: { width: Math.round(el.width), height: Math.round(el.height) },
      rotation: Math.round(el.rotation * 180 / Math.PI),
      style: {
        fill: el.style.fillColor,
        stroke: el.style.strokeColor,
        strokeWidth: el.style.strokeWidth,
      },
      ...(el instanceof TextNode ? { content: el.content } : {}),
      ...(el instanceof PathNode ? { vertexCount: el.vertices.length, closed: el.closed } : {}),
      ...(el instanceof FreehandNode ? { pointCount: el.inputPoints.length } : {}),
    })),
  };
}
