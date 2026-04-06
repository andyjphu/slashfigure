/**
 * MathJax service for rendering LaTeX to SVG.
 * Loads MathJax 4 from CDN on first use (lazy).
 * Supports inline ($...$) and display ($$...$$) math.
 */

export interface MathJaxResult {
  svg: string;
  width: number;
  height: number;
}

let loadPromise: Promise<void> | null = null;

/** Custom macros defined by the user, stored in localStorage */
let userMacroPreamble: string = localStorage.getItem("sf:latexMacros") ?? "";

/** Update user macros and persist */
export function setUserMacros(preamble: string): void {
  userMacroPreamble = preamble;
  localStorage.setItem("sf:latexMacros", preamble);
}

export function getUserMacros(): string {
  return userMacroPreamble;
}

function ensureLoaded(): Promise<void> {
  if ((window as unknown as Record<string, unknown>).MathJax && loadPromise) return loadPromise;
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    (window as unknown as Record<string, unknown>).MathJax = {
      loader: {
        load: [
          "[tex]/physics",
          "[tex]/boldsymbol",
          "[tex]/color",
          "[tex]/mathtools",
          "[tex]/newcommand",
          "[tex]/amscd",
          "[tex]/cancel",
        ],
      },
      tex: {
        packages: { "[+]": ["physics", "boldsymbol", "color", "mathtools", "newcommand", "amscd", "cancel"] },
        macros: {
          // Common set symbols
          R: "\\mathbb{R}",
          N: "\\mathbb{N}",
          Z: "\\mathbb{Z}",
          Q: "\\mathbb{Q}",
          C: "\\mathbb{C}",
          // Operators
          Var: "\\operatorname{Var}",
          Cov: "\\operatorname{Cov}",
          argmax: "\\operatorname{arg\\,max}",
          argmin: "\\operatorname{arg\\,min}",
          // Delimiters not in physics package
          inner: ["\\left\\langle #1 \\right\\rangle", 1],
          ceil: ["\\left\\lceil #1 \\right\\rceil", 1],
          floor: ["\\left\\lfloor #1 \\right\\rfloor", 1],
          // bm package not available in MathJax, alias to boldsymbol
          bm: ["\\boldsymbol{#1}", 1],
          // bbm workaround (MathJax doesn't support bbm package)
          mathbbm: ["\\mathbb{#1}", 1],
        },
        inlineMath: [["$", "$"]],
        displayMath: [["$$", "$$"]],
      },
      svg: { fontCache: "none" },  // Inline all glyph paths -- no <use>/<defs> complexity
      startup: {
        ready: () => {
          const MJ = (window as unknown as Record<string, unknown>).MathJax as Record<string, unknown>;
          (MJ.startup as Record<string, () => void>).defaultReady();
          resolve();
        },
      },
    };

    const script = document.createElement("script");
    // tex-svg.js supports the loader config for dynamic package loading
    script.src = "https://cdn.jsdelivr.net/npm/mathjax@4/tex-svg.js";
    script.async = true;
    script.onerror = () => reject(new Error("Failed to load MathJax"));
    document.head.appendChild(script);
  });

  return loadPromise;
}

/** Render a LaTeX math expression to SVG. Returns null on error. */
export async function renderLatexToSvg(latex: string, display: boolean = true): Promise<MathJaxResult | null> {
  await ensureLoaded();

  const MJ = (window as unknown as Record<string, unknown>).MathJax as Record<string, unknown>;
  const tex2svg = MJ.tex2svg as ((input: string, options?: { display?: boolean }) => HTMLElement) | undefined;
  if (!tex2svg) return null;

  try {
    // Prepend user-defined macros
    const fullLatex = userMacroPreamble ? `${userMacroPreamble}\n${latex}` : latex;
    const container = tex2svg(fullLatex, { display });
    const svgElement = container.querySelector("svg");
    if (!svgElement) return null;

    const widthAttr = svgElement.getAttribute("width");
    const heightAttr = svgElement.getAttribute("height");
    const exToPx = 8;
    const width = widthAttr ? parseFloat(widthAttr) * (widthAttr.includes("ex") ? exToPx : 1) : 50;
    const height = heightAttr ? parseFloat(heightAttr) * (heightAttr.includes("ex") ? exToPx : 1) : 20;

    return { svg: svgElement.outerHTML, width, height };
  } catch {
    return null;
  }
}

/** Check if a string contains any LaTeX math delimiters */
export function containsMath(text: string): boolean {
  return /\$[^$]+\$/.test(text);
}

/** Split text into segments: plain text and math regions.
 *  Returns array of {type: "text"|"math"|"display", content} */
export function parseTextWithMath(text: string): Array<{ type: "text" | "math" | "display"; content: string }> {
  const segments: Array<{ type: "text" | "math" | "display"; content: string }> = [];
  let remaining = text;

  while (remaining.length > 0) {
    // Check for display math first ($$...$$)
    const displayMatch = remaining.match(/^\$\$([^$]+)\$\$/);
    if (displayMatch) {
      segments.push({ type: "display", content: displayMatch[1] });
      remaining = remaining.slice(displayMatch[0].length);
      continue;
    }

    // Check for inline math ($...$)
    const inlineMatch = remaining.match(/^\$([^$]+)\$/);
    if (inlineMatch) {
      segments.push({ type: "math", content: inlineMatch[1] });
      remaining = remaining.slice(inlineMatch[0].length);
      continue;
    }

    // Find the next $ to know where plain text ends
    const nextDollar = remaining.indexOf("$");
    if (nextDollar === -1) {
      segments.push({ type: "text", content: remaining });
      break;
    } else {
      if (nextDollar > 0) {
        segments.push({ type: "text", content: remaining.slice(0, nextDollar) });
      }
      remaining = remaining.slice(nextDollar);
    }
  }

  return segments;
}
