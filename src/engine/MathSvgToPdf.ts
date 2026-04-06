/**
 * Converts MathJax SVG output to pdfkit vector paths.
 *
 * Strategy (from research):
 * 1. MathJax configured with fontCache:'none' -- all glyphs are inline <path> elements
 * 2. Parse SVG with DOMParser
 * 3. Walk tree depth-first, composing 3x3 affine transform matrices
 * 4. Map viewBox coordinates (1/1000 em) to PDF points via scale factor
 * 5. Handle MathJax's Y-axis flip: root <g> has matrix(1,0,0,-1,0,0)
 * 6. Replay each <path d="..."> through doc.path(d).fill()
 */

/** 3x3 affine matrix as [a, b, c, d, e, f] */
type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiplyMatrices(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

/** Parse an SVG transform attribute into a matrix */
function parseTransform(transformStr: string): Matrix {
  let result: Matrix = [...IDENTITY];
  const regex = /(matrix|translate|scale|rotate)\(([^)]+)\)/g;
  let match;

  while ((match = regex.exec(transformStr)) !== null) {
    const type = match[1];
    const values = match[2].split(/[\s,]+/).map(Number);
    let local: Matrix;

    switch (type) {
      case "matrix":
        local = [values[0], values[1], values[2], values[3], values[4], values[5]];
        break;
      case "translate":
        local = [1, 0, 0, 1, values[0], values[1] ?? 0];
        break;
      case "scale": {
        const sx = values[0];
        const sy = values[1] ?? sx;
        local = [sx, 0, 0, sy, 0, 0];
        break;
      }
      case "rotate": {
        const angle = (values[0] * Math.PI) / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        local = [cos, sin, -sin, cos, 0, 0];
        break;
      }
      default:
        continue;
    }
    result = multiplyMatrices(result, local);
  }

  return result;
}

/** Parse viewBox attribute */
function parseViewBox(viewBox: string): { minX: number; minY: number; width: number; height: number } | null {
  const parts = viewBox.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return null;
  return { minX: parts[0], minY: parts[1], width: parts[2], height: parts[3] };
}

/**
 * Render MathJax SVG content into a pdfkit document at the given position.
 *
 * @param doc pdfkit document
 * @param svgString The full SVG element outerHTML from MathJax
 * @param pdfX X position in PDF points
 * @param pdfY Y position in PDF points
 * @param targetWidth Desired width in PDF points (scales proportionally)
 * @param fillColor Default fill color
 */
export function renderMathSvgToPdf(
  doc: PDFKit.PDFDocument,
  svgString: string,
  pdfX: number,
  pdfY: number,
  targetWidth: number,
  fillColor: string = "#000000",
): void {
  // Parse SVG
  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(svgString, "image/svg+xml");
  const svgElement = svgDoc.querySelector("svg");
  if (!svgElement) return;

  // Get viewBox
  const viewBoxStr = svgElement.getAttribute("viewBox");
  const viewBox = viewBoxStr ? parseViewBox(viewBoxStr) : null;
  if (!viewBox || viewBox.width === 0) return;

  // Compute scale: viewBox units -> PDF points
  const scale = targetWidth / viewBox.width;

  // Build the root transform: translate to PDF position, scale, offset by viewBox origin
  const rootTransform: Matrix = [
    scale, 0,
    0, scale,
    pdfX - viewBox.minX * scale,
    pdfY - viewBox.minY * scale,
  ];

  doc.save();

  // Walk the SVG tree
  walkElement(doc, svgElement, rootTransform, fillColor);

  doc.restore();
}

function walkElement(
  doc: PDFKit.PDFDocument,
  element: Element,
  parentTransform: Matrix,
  defaultFill: string,
): void {
  for (const child of Array.from(element.children)) {
    const tagName = child.tagName.toLowerCase();

    // Compute this element's transform
    const transformStr = child.getAttribute("transform");
    const localTransform = transformStr ? parseTransform(transformStr) : [...IDENTITY] as Matrix;
    const combinedTransform = multiplyMatrices(parentTransform, localTransform);

    // Resolve fill color
    const fillAttr = child.getAttribute("fill");
    const fill = fillAttr === "currentColor" || !fillAttr ? defaultFill : fillAttr;

    if (tagName === "path") {
      const d = child.getAttribute("d");
      if (d && fill !== "none") {
        doc.save();
        doc.transform(
          combinedTransform[0], combinedTransform[1],
          combinedTransform[2], combinedTransform[3],
          combinedTransform[4], combinedTransform[5],
        );
        try {
          doc.fillColor(fill);
          doc.path(d).fill();
        } catch {
          // Some paths may not be compatible
        }
        doc.restore();
      }
    } else if (tagName === "rect") {
      const rx = parseFloat(child.getAttribute("x") ?? "0");
      const ry = parseFloat(child.getAttribute("y") ?? "0");
      const rw = parseFloat(child.getAttribute("width") ?? "0");
      const rh = parseFloat(child.getAttribute("height") ?? "0");
      if (rw > 0 && rh > 0 && fill !== "none") {
        doc.save();
        doc.transform(
          combinedTransform[0], combinedTransform[1],
          combinedTransform[2], combinedTransform[3],
          combinedTransform[4], combinedTransform[5],
        );
        doc.fillColor(fill);
        doc.rect(rx, ry, rw, rh).fill();
        doc.restore();
      }
    } else if (tagName === "line") {
      const x1 = parseFloat(child.getAttribute("x1") ?? "0");
      const y1 = parseFloat(child.getAttribute("y1") ?? "0");
      const x2 = parseFloat(child.getAttribute("x2") ?? "0");
      const y2 = parseFloat(child.getAttribute("y2") ?? "0");
      const stroke = child.getAttribute("stroke") ?? defaultFill;
      const strokeWidth = parseFloat(child.getAttribute("stroke-width") ?? "1");
      if (stroke !== "none") {
        doc.save();
        doc.transform(
          combinedTransform[0], combinedTransform[1],
          combinedTransform[2], combinedTransform[3],
          combinedTransform[4], combinedTransform[5],
        );
        doc.strokeColor(stroke);
        doc.lineWidth(strokeWidth);
        doc.moveTo(x1, y1).lineTo(x2, y2).stroke();
        doc.restore();
      }
    } else if (tagName === "g" || tagName === "svg" || tagName === "defs") {
      // Recurse into groups (skip <defs> children for rendering, but walk for <use> resolution)
      if (tagName !== "defs") {
        walkElement(doc, child, combinedTransform, fill === "none" ? defaultFill : fill);
      }
    } else if (tagName === "use") {
      // With fontCache:'none', there should be no <use> elements.
      // If they appear, resolve the href and recurse.
      const href = child.getAttribute("href") ?? child.getAttribute("xlink:href");
      if (href?.startsWith("#")) {
        const refId = href.slice(1);
        const refElement = element.ownerDocument?.getElementById(refId);
        if (refElement) {
          walkElement(doc, refElement, combinedTransform, fill === "none" ? defaultFill : fill);
        }
      }
    }
    // Other elements (text, etc.) are ignored -- MathJax SVG with fontCache:none
    // should only contain path, rect, line, and g elements.
  }
}
