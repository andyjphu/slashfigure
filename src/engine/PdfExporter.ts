import PDFDocument from "pdfkit/js/pdfkit.standalone";
import type { BaseNode } from "./nodes/BaseNode";
import { RectangleNode } from "./nodes/RectangleNode";
import { TextNode } from "./nodes/TextNode";
import { PathNode } from "./nodes/PathNode";
import { ImageNode } from "./nodes/ImageNode";
import { FreehandNode } from "./nodes/FreehandNode";
import type { SceneGraph } from "./SceneGraph";
import getStroke from "perfect-freehand";

/**
 * Export scene graph directly to PDF via pdfkit.
 * Each element implements its own PDF rendering -- no SVG translation layer.
 * Tight-cropped: page size = exact content bounds.
 */
export function exportPdf(sceneGraph: SceneGraph): Promise<Blob> {
  const elements = sceneGraph.getElements().filter((el) => el.visible);

  // Compute tight bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    const bounds = el.getWorldBounds();
    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.x + bounds.width);
    maxY = Math.max(maxY, bounds.y + bounds.height);
  }
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 100; maxY = 100; }

  const padding = 10;
  const width = maxX - minX + padding * 2;
  const height = maxY - minY + padding * 2;
  const offsetX = -minX + padding;
  const offsetY = -minY + padding;

  return new Promise((resolve) => {
    const doc = new PDFDocument({
      size: [width, height],
      margin: 0,
    });

    // Collect PDF buffer chunks manually (no blob-stream dependency)
    const chunks: Blob[] = [];
    doc.on("data", (chunk: unknown) => chunks.push(new Blob([chunk as ArrayBuffer])));
    doc.on("end", () => {
      resolve(new Blob(chunks, { type: "application/pdf" }));
    });

    doc.translate(offsetX, offsetY);

    for (const el of elements) {
      renderElementToPdf(doc, el);
    }

    doc.end();
  });
}

function renderElementToPdf(doc: PDFKit.PDFDocument, el: BaseNode): void {
  const wt = el.getWorldTransform();

  doc.save();
  doc.transform(wt[0], wt[1], wt[2], wt[3], wt[4], wt[5]);

  if (el instanceof RectangleNode) {
    renderRectToPdf(doc, el);
  } else if (el instanceof TextNode) {
    renderTextToPdf(doc, el);
  } else if (el instanceof PathNode) {
    renderPathToPdf(doc, el);
  } else if (el instanceof FreehandNode) {
    renderFreehandToPdf(doc, el);
  } else if (el instanceof ImageNode) {
    renderImageToPdf(doc, el);
  }

  doc.restore();
}

function renderRectToPdf(doc: PDFKit.PDFDocument, el: RectangleNode): void {
  const { fillColor, fillOpacity, strokeColor, strokeWidth, strokeOpacity, cornerRadius, opacity } = el.style;

  if (cornerRadius > 0) {
    doc.roundedRect(0, 0, el.width, el.height, cornerRadius);
  } else {
    doc.rect(0, 0, el.width, el.height);
  }

  if (fillOpacity > 0) {
    doc.opacity(opacity * fillOpacity);
    doc.fillColor(fillColor);
    if (strokeWidth > 0 && strokeOpacity > 0) {
      doc.strokeColor(strokeColor);
      doc.lineWidth(strokeWidth);
      doc.strokeOpacity(opacity * strokeOpacity);
      doc.fillAndStroke();
    } else {
      doc.fill();
    }
  } else if (strokeWidth > 0 && strokeOpacity > 0) {
    doc.opacity(opacity * strokeOpacity);
    doc.strokeColor(strokeColor);
    doc.lineWidth(strokeWidth);
    doc.stroke();
  }
}

function renderTextToPdf(doc: PDFKit.PDFDocument, el: TextNode): void {
  doc.opacity(el.style.opacity);
  doc.fillColor(el.style.fillColor);
  doc.fontSize(el.fontSize);
  doc.text(el.content, 0, 0, {
    width: el.width > 0 ? el.width : undefined,
  });
}

function renderPathToPdf(doc: PDFKit.PDFDocument, el: PathNode): void {
  if (el.vertices.length < 2) return;

  doc.moveTo(el.vertices[0].x, el.vertices[0].y);
  for (let i = 1; i < el.vertices.length; i++) {
    doc.lineTo(el.vertices[i].x, el.vertices[i].y);
  }
  if (el.closed) doc.closePath();

  doc.opacity(el.style.opacity * el.style.strokeOpacity);
  doc.strokeColor(el.style.strokeColor);
  doc.lineWidth(el.style.strokeWidth);
  doc.lineCap("round");
  doc.lineJoin("round");

  if (el.closed && el.style.fillOpacity > 0) {
    doc.fillColor(el.style.fillColor);
    doc.fillOpacity(el.style.opacity * el.style.fillOpacity);
    doc.fillAndStroke();
  } else {
    doc.stroke();
  }

  // Arrowhead
  if (el.endCap === "arrow" && el.vertices.length >= 2) {
    const last = el.vertices[el.vertices.length - 1];
    const prev = el.vertices[el.vertices.length - 2];
    const headLength = Math.max(10, el.style.strokeWidth * 4);
    const angle = Math.atan2(last.y - prev.y, last.x - prev.x);
    const ax1 = last.x - headLength * Math.cos(angle - Math.PI / 6);
    const ay1 = last.y - headLength * Math.sin(angle - Math.PI / 6);
    const ax2 = last.x - headLength * Math.cos(angle + Math.PI / 6);
    const ay2 = last.y - headLength * Math.sin(angle + Math.PI / 6);

    doc.moveTo(last.x, last.y).lineTo(ax1, ay1).stroke();
    doc.moveTo(last.x, last.y).lineTo(ax2, ay2).stroke();
  }
}

function renderFreehandToPdf(doc: PDFKit.PDFDocument, el: FreehandNode): void {
  if (el.inputPoints.length < 2) return;

  const outlinePoints = getStroke(
    el.inputPoints.map((p) => [p.x, p.y, p.pressure]),
    { size: el.style.strokeWidth * 3, thinning: 0.5, smoothing: 0.5, streamline: 0.5 },
  );

  if (outlinePoints.length === 0) return;

  doc.moveTo(outlinePoints[0][0], outlinePoints[0][1]);
  for (let i = 1; i < outlinePoints.length; i++) {
    doc.lineTo(outlinePoints[i][0], outlinePoints[i][1]);
  }
  doc.closePath();

  doc.opacity(el.style.opacity);
  doc.fillColor(el.style.strokeColor);
  doc.fill();
}

function renderImageToPdf(doc: PDFKit.PDFDocument, el: ImageNode): void {
  if (!el.sourceUrl) return;

  try {
    doc.opacity(el.style.opacity);

    if (el.style.cornerRadius > 0) {
      doc.save();
      doc.roundedRect(0, 0, el.width, el.height, el.style.cornerRadius);
      doc.clip();
    }

    doc.image(el.sourceUrl, 0, 0, { width: el.width, height: el.height });

    if (el.style.cornerRadius > 0) {
      doc.restore();
    }

    if (el.style.strokeWidth > 0) {
      doc.opacity(el.style.opacity * el.style.strokeOpacity);
      doc.strokeColor(el.style.strokeColor);
      doc.lineWidth(el.style.strokeWidth);
      if (el.style.cornerRadius > 0) {
        doc.roundedRect(0, 0, el.width, el.height, el.style.cornerRadius).stroke();
      } else {
        doc.rect(0, 0, el.width, el.height).stroke();
      }
    }
  } catch {
    // Image may not be loadable in PDF context
  }
}
