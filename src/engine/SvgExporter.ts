import type { SceneGraph } from "./SceneGraph";
import type { BaseNode } from "./nodes/BaseNode";
import { RectangleNode } from "./nodes/RectangleNode";
import { TextNode } from "./nodes/TextNode";
import { PathNode } from "./nodes/PathNode";
import { ImageNode } from "./nodes/ImageNode";
import { FreehandNode } from "./nodes/FreehandNode";
import { TableNode } from "./nodes/TableNode";
import { containsMath, parseTextWithMath } from "./MathJaxService";
import getStroke from "perfect-freehand";

/** Export scene graph as a self-contained SVG string */
export function exportSvgString(sceneGraph: SceneGraph): string {
  const elements = sceneGraph.getElements().filter((el) => el.visible);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    const b = el.getWorldBounds();
    minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width); maxY = Math.max(maxY, b.y + b.height);
  }
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 100; maxY = 100; }

  const padding = 10;
  const width = maxX - minX + padding * 2;
  const height = maxY - minY + padding * 2;
  const viewBox = `${minX - padding} ${minY - padding} ${width} ${height}`;

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}">`);
  for (const el of elements) parts.push(elementToSvg(el));
  parts.push("</svg>");
  return parts.join("\n");
}

function elementToSvg(el: BaseNode): string {
  const wt = el.getWorldTransform();
  const transform = `matrix(${wt[0]},${wt[1]},${wt[2]},${wt[3]},${wt[4]},${wt[5]})`;

  if (el instanceof RectangleNode) {
    const { fillColor, fillOpacity, strokeColor, strokeWidth, strokeOpacity, cornerRadius, opacity } = el.style;
    return `<rect x="0" y="0" width="${el.width}" height="${el.height}" rx="${cornerRadius}" ry="${cornerRadius}" fill="${fillColor}" fill-opacity="${fillOpacity * opacity}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-opacity="${strokeOpacity * opacity}" transform="${transform}" />`;
  }

  if (el instanceof TextNode) {
    if (containsMath(el.content)) {
      return renderTextWithMathToSvg(el, transform);
    }
    const escaped = el.content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<text x="0" y="${el.fontSize}" font-size="${el.fontSize}" font-family="${el.fontFamily}" font-weight="${el.fontWeight}" fill="${el.style.fillColor}" opacity="${el.style.opacity}" transform="${transform}">${escaped}</text>`;
  }

  if (el instanceof TableNode) {
    return renderTableToSvg(el, transform);
  }

  if (el instanceof FreehandNode) {
    if (el.inputPoints.length < 2) return "";
    const outlinePoints = getStroke(
      el.inputPoints.map((p) => [p.x, p.y, p.pressure]),
      { size: el.style.strokeWidth * 3, thinning: 0.5, smoothing: 0.5, streamline: 0.5 },
    );
    if (outlinePoints.length === 0) return "";
    let d = `M ${outlinePoints[0][0]} ${outlinePoints[0][1]}`;
    for (let i = 1; i < outlinePoints.length; i++) d += ` L ${outlinePoints[i][0]} ${outlinePoints[i][1]}`;
    d += " Z";
    return `<path d="${d}" fill="${el.style.strokeColor}" opacity="${el.style.opacity}" transform="${transform}" />`;
  }

  if (el instanceof PathNode) {
    const verts = el.vertices;
    if (verts.length < 2) return "";
    let d = `M ${verts[0].x} ${verts[0].y}`;
    for (let i = 1; i < verts.length; i++) d += ` L ${verts[i].x} ${verts[i].y}`;
    if (el.closed) d += " Z";

    let svg = `<path d="${d}" fill="${el.closed ? el.style.fillColor : 'none'}" fill-opacity="${el.style.fillOpacity * el.style.opacity}" stroke="${el.style.strokeColor}" stroke-width="${el.style.strokeWidth}" stroke-opacity="${el.style.strokeOpacity * el.style.opacity}" stroke-linecap="round" stroke-linejoin="round" transform="${transform}" />`;

    if (el.endCap === "arrow" && verts.length >= 2) {
      const last = verts[verts.length - 1];
      const prev = verts[verts.length - 2];
      const headLength = Math.max(10, el.style.strokeWidth * 4);
      const angle = Math.atan2(last.y - prev.y, last.x - prev.x);
      const ax1 = last.x - headLength * Math.cos(angle - Math.PI / 6);
      const ay1 = last.y - headLength * Math.sin(angle - Math.PI / 6);
      const ax2 = last.x - headLength * Math.cos(angle + Math.PI / 6);
      const ay2 = last.y - headLength * Math.sin(angle + Math.PI / 6);
      svg += `\n<path d="M ${last.x} ${last.y} L ${ax1} ${ay1} M ${last.x} ${last.y} L ${ax2} ${ay2}" fill="none" stroke="${el.style.strokeColor}" stroke-width="${el.style.strokeWidth}" stroke-linecap="round" transform="${transform}" />`;
    }
    return svg;
  }

  if (el instanceof ImageNode && el.sourceUrl) {
    const { cornerRadius } = el.style;
    let svg = "";
    if (cornerRadius > 0) {
      const clipId = `clip-${el.id}`;
      svg += `<defs><clipPath id="${clipId}"><rect x="0" y="0" width="${el.width}" height="${el.height}" rx="${cornerRadius}" ry="${cornerRadius}" /></clipPath></defs>`;
      svg += `<image href="${el.sourceUrl}" x="0" y="0" width="${el.width}" height="${el.height}" clip-path="url(#${clipId})" opacity="${el.style.opacity}" transform="${transform}" />`;
    } else {
      svg += `<image href="${el.sourceUrl}" x="0" y="0" width="${el.width}" height="${el.height}" opacity="${el.style.opacity}" transform="${transform}" />`;
    }
    if (el.style.strokeWidth > 0) {
      svg += `<rect x="0" y="0" width="${el.width}" height="${el.height}" rx="${cornerRadius}" ry="${cornerRadius}" fill="none" stroke="${el.style.strokeColor}" stroke-width="${el.style.strokeWidth}" opacity="${el.style.strokeOpacity * el.style.opacity}" transform="${transform}" />`;
    }
    return svg;
  }

  return "";
}

function renderTableToSvg(el: TableNode, transform: string): string {
  const parts: string[] = [];
  parts.push(`<g transform="${transform}">`);

  // Borders
  let y = 0;
  for (let r = 0; r <= el.rowCount; r++) {
    parts.push(`<line x1="0" y1="${y}" x2="${el.width}" y2="${y}" stroke="#ccc" stroke-width="1" />`);
    if (r < el.rowCount) y += el.rowHeights[r];
  }
  let x = 0;
  for (let c = 0; c <= el.colCount; c++) {
    parts.push(`<line x1="${x}" y1="0" x2="${x}" y2="${el.height}" stroke="#ccc" stroke-width="1" />`);
    if (c < el.colCount) x += el.columnWidths[c];
  }

  // Cell text
  y = 0;
  for (let r = 0; r < el.rowCount; r++) {
    x = 0;
    for (let c = 0; c < el.colCount; c++) {
      const cell = el.cells[r][c];
      if (cell.content) {
        const cx = x + 6;
        const cy = y + el.rowHeights[r] / 2;
        const escaped = cell.content.replace(/&/g, "&amp;").replace(/</g, "&lt;");
        const weight = r === 0 && el.hasHeader ? "bold" : "normal";
        parts.push(`<text x="${cx}" y="${cy}" font-size="13" font-family="system-ui, sans-serif" font-weight="${weight}" fill="#333" dominant-baseline="central">${escaped}</text>`);
      }
      x += el.columnWidths[c];
    }
    y += el.rowHeights[r];
  }

  parts.push(`</g>`);
  return parts.join("\n");
}

/** Render a TextNode with inline math. Plain text as <text>, math as inline MathJax SVG. */
function renderTextWithMathToSvg(el: TextNode, transform: string): string {
  const segments = parseTextWithMath(el.content);
  const parts: string[] = [];
  let x = 0;

  parts.push(`<g transform="${transform}">`);

  for (const seg of segments) {
    if (seg.type === "text") {
      const escaped = seg.content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      parts.push(`<text x="${x}" y="${el.fontSize}" font-size="${el.fontSize}" font-family="${el.fontFamily}" font-weight="${el.fontWeight}" fill="${el.style.fillColor}" opacity="${el.style.opacity}">${escaped}</text>`);
      // Approximate text width (we don't have a canvas context here)
      x += seg.content.length * el.fontSize * 0.6;
    } else {
      // Inline the MathJax SVG directly
      const cached = el.mathCache.get(seg.content);
      if (cached?.svgContent) {
        // Wrap the MathJax SVG in a positioned group
        const lineHeight = el.fontSize * 1.4;
        const yOffset = (lineHeight - cached.height) / 2;
        parts.push(`<g transform="translate(${x}, ${yOffset})">`);
        parts.push(cached.svgContent);
        parts.push(`</g>`);
        x += cached.width;
      } else {
        // Fallback: raw LaTeX source
        const escaped = `$${seg.content}$`.replace(/&/g, "&amp;").replace(/</g, "&lt;");
        parts.push(`<text x="${x}" y="${el.fontSize}" font-size="${el.fontSize}" font-family="monospace" fill="#888">${escaped}</text>`);
        x += seg.content.length * el.fontSize * 0.6;
      }
    }
  }

  parts.push(`</g>`);
  return parts.join("\n");
}
