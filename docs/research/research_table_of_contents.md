# Table of Contents -- Scientific Figure Drawing App Research

## Canvas / Drawing Frameworks

| Name (Full) | Name (Short) | Summary | Usefulness | Key Insights |
|---|---|---|---|---|
| tldraw | [tldraw](tldraw/tldraw.md) | Infinite canvas SDK for React with reactive store, shapes, bindings | **HIGH** -- best architecture, but commercial license | `meta` field on shapes; ShapeUtil pattern; AI integration already sends shapes+screenshots to LLMs |
| Excalidraw | [Excalidraw](Excalidraw/Excalidraw.md) | Canvas-based whiteboard, MIT, 120K stars | **HIGH** -- best MIT drawing app | `customData` on elements; PNG embeds scene data for round-trip editing; dual-canvas pattern |
| Fabric.js | [FabricJS](FabricJS/FabricJS.md) | Interactive object model on Canvas with SVG round-trip | **HIGH** -- most mature interaction model | Custom props (explicit serialize); rich text; SVG import/export for existing figures |
| Konva.js | [KonvaJS](KonvaJS/KonvaJS.md) | Canvas framework with scene graph and multi-layer system | **HIGH** -- best performance/simplicity ratio | Custom attrs auto-serialize; multi-layer = separate static/interactive content; react-konva |
| Paper.js | [PaperJS](PaperJS/PaperJS.md) | Vector graphics scripting with scene graph | MEDIUM | `data` property on every Item; boolean path operations; no React bindings |
| PixiJS | [PixiJS](PixiJS/PixiJS.md) | Fastest 2D WebGL/WebGPU renderer | MEDIUM -- extreme perf but build everything | 60fps with thousands of objects; no serialization or data model built in |
| Penpot | [Penpot](Penpot/Penpot.md) | Open-source Figma alternative, SVG-native | LOW -- inspiration only | ClojureScript barrier; Rust/Skia WASM renderer architecture worth studying |
| Rough.js | [RoughJS](RoughJS/RoughJS.md) | Hand-drawn style rendering (<9KB) | LOW -- style engine only | Used by Excalidraw internally; optional sketchy mode |

## Figma Architecture (Blog Posts)

| Name (Full) | Name (Short) | Summary | Usefulness | Key Insights |
|---|---|---|---|---|
| Figma Engineering Blog | [FigmaArch](FigmaArch/FigmaArch.md) | 9 blog posts on rendering, multiplayer, WASM, Rust, vector networks | **CRITICAL** -- defines the target | Last-writer-wins property-level sync; fractional indexing; C++/Rust->WASM; WebGPU; perf testing infra |

## Diagramming / Charting

| Name (Full) | Name (Short) | Summary | Usefulness | Key Insights |
|---|---|---|---|---|
| Mermaid.js | [Mermaid](Mermaid/Mermaid.md) | Text-to-SVG diagrams, 87K stars | **HIGH** -- primary LLM export format | ~50 tokens vs ~1200 for draw.io XML; LLMs already know Mermaid |
| D3.js | [D3](D3/D3.md) | Low-level data visualization, 112K stars | MEDIUM -- rendering layer for embedded charts | Gold standard for scales, axes, layouts |
| Plotly.js | [Plotly](Plotly/Plotly.md) | 40+ chart types, interactive, publication-quality | HIGH -- chart embedding | Declarative JSON config; annotation layer; LaTeX math support |
| Vega / Vega-Lite | [VegaLite](VegaLite/VegaLite.md) | Grammar of interactive graphics | HIGH -- declarative chart specs | Gold standard for chart description; used by VisText for scene graphs |
| Apache ECharts | [ECharts](ECharts/ECharts.md) | Framework-agnostic charting, 66K stars | HIGH -- embedded charts | Option-as-JSON paradigm; dual Canvas/SVG renderer |
| Observable Plot | [ObservablePlot](ObservablePlot/) | Concise grammar-of-graphics JS API | MEDIUM | Cleanest API for quick scientific plots |
| Chart.js | [ChartJS](ChartJS/) | Canvas-based charting, 67K stars | MEDIUM | JSON config; annotation plugin; no vector export |
| Recharts | [Recharts](Recharts/) | React charting with SVG output | MEDIUM | SVG DOM output extractable for embedding |
| Nivo | [Nivo](Nivo/) | 27+ chart types for React | MEDIUM | Server-side SVG rendering; richest React chart set |

## LaTeX / Math Rendering

| Name (Full) | Name (Short) | Summary | Usefulness | Key Insights |
|---|---|---|---|---|
| KaTeX | [KaTeX](KaTeX/KaTeX.md) | Fast synchronous LaTeX math rendering | **HIGH** -- fast preview | No SVG output (needs foreignObject); store LaTeX source as metadata |
| MathJax | [MathJax](MathJax/MathJax.md) | Full-featured LaTeX/MathML rendering | **HIGH** -- primary renderer | `tex2svg()` produces native SVG compositable directly; store source+rendered |
| Temml | [Temml](Temml/Temml.md) | Lightweight LaTeX to pure MathML | LOW | ~10KB; relies on browser MathML rendering |
| LaTeX.js | [LaTeXjs](LaTeXjs/LaTeXjs.md) | Full LaTeX documents to HTML5 | LOW | PEG.js parser AST; handles tables, figures |
| SwiftLaTeX | [SwiftLaTeX](SwiftLaTeX/SwiftLaTeX.md) | Full TeX engine in WASM | LOW | AGPL; full compilation in browser |

## Tables

| Name (Full) | Name (Short) | Summary | Usefulness | Key Insights |
|---|---|---|---|---|
| Tabulator | [Tabulator](Tabulator/Tabulator.md) | Interactive tables, zero deps, MIT | LOW -- rejected (DOM-only, can't render to canvas/SVG) | Custom export API for LaTeX; JSON/CSV/XLSX/PDF export. **Decision: TanStack Table (headless) chosen instead.** |
| LaTeX Table Editor | [LaTeXTableEditor](LaTeXTableEditor/LaTeXTableEditor.md) | WYSIWYG table editor with LaTeX export | HIGH -- reference impl | Study for table-to-LaTeX conversion logic |
| Handsontable | [Handsontable](Handsontable/) | Spreadsheet-like grid | LOW | Non-commercial license limitation |

## Annotation Standards

| Name (Full) | Name (Short) | Summary | Usefulness | Key Insights |
|---|---|---|---|---|
| W3C Web Annotation | [W3CWebAnnotation](W3CWebAnnotation/W3CWebAnnotation.md) | Standard JSON-LD annotation data model | **HIGH** -- adopt as schema | SvgSelector maps to canvas primitives; interoperable with ecosystem |
| IIIF | [IIIF](IIIF/IIIF.md) | Image interoperability framework | MEDIUM | Canvas = abstract coordinate space + annotations pattern |
| Hypothes.is | [Hypothessis](Hypothessis/Hypothessis.md) | Web annotation platform | MEDIUM | Re-anchoring system for surviving edits |
| Annotorious | [Annotorious](Annotorious/Annotorious.md) | JS image annotation library | MEDIUM | W3C-compliant output; SvgSelector; plugin architecture |

## SVG / Spatial

| Name (Full) | Name (Short) | Summary | Usefulness | Key Insights |
|---|---|---|---|---|
| SVG.js | [SVGjs](SVGjs/SVGjs.md) | Lightweight SVG manipulation | **HIGH** | `.data()` persists to `data-*` attrs in SVG DOM; metadata survives serialization |
| RBush | [RBush](RBush/RBush.md) | R-tree spatial index | **HIGH** -- essential infra | Hit-testing, viewport culling, snap, spatial metadata queries |
| Flatbush | [Flatbush](Flatbush/Flatbush.md) | Static packed Hilbert R-tree | MEDIUM | Faster than RBush for static; ArrayBuffer serialization |
| svg-path-commander | [SVGPathCommander](SVGPathCommander/SVGPathCommander.md) | DOM-free SVG path operations | MEDIUM | Hit-testing and bbox without rendering |
| Snap.svg | [SnapSVG](SnapSVG/) | SVG manipulation (Adobe) | LOW | `.data()` doesn't persist to DOM; declining maintenance |

## ASCII / Text Diagram Formats

| Name (Full) | Name (Short) | Summary | Usefulness | Key Insights |
|---|---|---|---|---|
| Svgbob | [Svgbob](Svgbob/Svgbob.md) | ASCII art to SVG (Rust) | **HIGH** -- ASCII export/import | Export canvas as ASCII for LLM; import LLM-generated ASCII |
| Typograms | [Typograms](Typograms/Typograms.md) | Strict ASCII diagram format (Google) | HIGH | Most parseable; best for LLM round-tripping |
| ASCIIFlow | [ASCIIFlow](ASCIIFlow/ASCIIFlow.md) | Interactive ASCII diagram editor | MEDIUM | Drawing IS text; ideal LLM-friendliness model |
| Pikchr | [Pikchr](Pikchr/Pikchr.md) | PIC-like markup (by SQLite creator) | MEDIUM | Safe for untrusted input; LLM-writable |
| Ditaa | [Ditaa](Ditaa/Ditaa.md) | ASCII art to bitmap | LOW | Established conventions |
| Drawille | [Drawille](Drawille/Drawille.md) | Unicode braille pixel graphics | LOW | 8x ASCII resolution in same text footprint |
| aalib.js | [AalibJS](AalibJS/AalibJS.md) | Browser-based image-to-ASCII | LOW | Live ASCII preview of canvas |
| ASCII Art Paint | [ASCIIArtPaint](ASCIIArtPaint/) | Browser ASCII editor | LOW | Drawing tool whose native format IS text |

## Text-Based Diagram Languages

| Name (Full) | Name (Short) | Summary | Usefulness | Key Insights |
|---|---|---|---|---|
| D2 | [D2](D2/D2.md) | Modern declarative diagrams (23K stars) | MEDIUM | Fault-tolerant for LLM generation; nested containers |
| PlantUML | [PlantUML](PlantUML/PlantUML.md) | UML from text | LOW | ~80 tokens; stricter UML compliance |
| Graphviz DOT | [GraphvizDOT](GraphvizDOT/GraphvizDOT.md) | Classic graph description | MEDIUM | Most established; LLMs excel at generating it |
| Markdeep | [Markdeep](Markdeep/Markdeep.md) | Markdown + auto-detected ASCII diagrams | LOW | Inspiring auto-detection approach |
| Kroki | [Kroki](Kroki/Kroki.md) | Universal diagram rendering API | MEDIUM | 20+ format support; decouples format from renderer |

## Code-to-Figure Tools

| Name (Full) | Name (Short) | Summary | Usefulness | Key Insights |
|---|---|---|---|---|
| Penrose | [Penrose](Penrose/Penrose.md) | Math notation to beautiful diagrams (CMU) | **HIGH** -- design pattern | Separation of semantics / style / types; three independent text layers |
| Manim | [Manim](Manim/Manim.md) | 3Blue1Brown animation engine (85K stars) | MEDIUM | Sequential actions = metadata; code IS the scene description |
| Typst | [Typst](Typst/Typst.md) | Modern LaTeX successor (52K stars) | MEDIUM | Rust-native; Apache-2.0; growing ecosystem with CeTZ |
| CeTZ | [CeTZ](CeTZ/CeTZ.md) | Drawing library for Typst (TikZ equivalent) | LOW | Next-gen structured drawing description |

## LLM + Visual Research

| Name (Full) | Name (Short) | Summary | Usefulness | Key Insights |
|---|---|---|---|---|
| DiagrammerGPT | [DiagrammerGPT](DiagrammerGPT/DiagrammerGPT.md) | LLM diagram planning (COLM 2024) | **HIGH** | Diagram plan format: normalized coords + entity lists + relationships |
| XML-Driven Diagram Understanding | [XMLDiagramPaper](XMLDiagramPaper/XMLDiagramPaper.md) | Text metadata beats GPT-4o vision | **CRITICAL** -- validates our approach | Metadata > vision for diagram understanding |
| FigurA11y | [FigurA11y](FigurA11y/FigurA11y.md) | AI alt text for scientific figures | **HIGH** | Our app solves their hardest problems for free (metadata at draw time) |
| VisText | [VisText](VisText/VisText.md) | Chart scene graph + captions benchmark | **HIGH** | Scene graph extraction from canvas; reduced scene graph for token efficiency |
| DePlot | [DePlot](DePlot/DePlot.md) | Chart-to-table for LLM reasoning (Google) | MEDIUM | Structured text beats vision by 29.4% |
| DiagramAgent | [DiagramAgent](DiagramAgent/DiagramAgent.md) | Text-to-diagram with code repr (CVPR 2025) | MEDIUM | Code-based repr > pixel-based; round-tripping |
| LLMermaid | [LLMermaid](LLMermaid/LLMermaid.md) | Mermaid as LLM execution plans | LOW | Diagrams can guide LLMs, not just describe |
| Token Efficiency Analysis | [TokenEfficiency](TokenEfficiency/TokenEfficiency.md) | Benchmark of diagram format token costs | **HIGH** | Mermaid ~50 tokens vs draw.io ~1200; maintain dual representations |
| Excalidraw Converter | [ExcalidrawConverter](ExcalidrawConverter/ExcalidrawConverter.md) | Canvas JSON to Mermaid converter | MEDIUM | Proves canvas-to-text conversion feasible |

## ML Annotation Tools

| Name (Full) | Name (Short) | Summary | Usefulness | Key Insights |
|---|---|---|---|---|
| Label Studio | [LabelStudio](LabelStudio/LabelStudio.md) | Multi-modal labeling platform | LOW | Region annotation format reference |
| CVAT | [CVAT](CVAT/CVAT.md) | Computer vision annotation | LOW | COCO JSON format for interoperability |
| VGG Image Annotator | [VIA](VIA/VIA.md) | Single-file image annotator | LOW | Cleanest shape_attributes / region_attributes separation |

## Collaboration / State

| Name (Full) | Name (Short) | Summary | Usefulness | Key Insights |
|---|---|---|---|---|
| Yjs | [Yjs](Yjs/Yjs.md) | CRDT shared data types | HIGH -- if collaboration needed | Most mature; largest ecosystem; fastest to market |
| Loro | [Loro](Loro/Loro.md) | Rust CRDT with WASM bindings | HIGH -- for Rust/WASM stack | Better memory/perf than Yjs; Fugue algorithm |
| Automerge | [Automerge](Automerge/Automerge.md) | JSON model CRDT (Rust/WASM) | MEDIUM | Proven for canvas apps (PushPin, PixelPusher) |
| Weave.js | [WeaveJS](WeaveJS/WeaveJS.md) | Collaborative canvas framework | MEDIUM -- reference architecture | Three-layer pattern: render / sync / interaction |

## Performance / Algorithms

| Name (Full) | Name (Short) | Summary | Usefulness | Key Insights |
|---|---|---|---|---|
| perfect-freehand | [PerfectFreehand](PerfectFreehand/PerfectFreehand.md) | Pressure-sensitive freehand strokes | MEDIUM | Gold standard for pen/touch annotation |

## Scientific Figure Specific

| Name (Full) | Name (Short) | Summary | Usefulness | Key Insights |
|---|---|---|---|---|
| Scientific Inkscape | [ScientificInkscape](ScientificInkscape/ScientificInkscape.md) | Inkscape extensions for science | HIGH -- feature reference | Scaler (resize without text change); Homogenizer (uniform styling) |
| Pylustrator | [Pylustrator](Pylustrator/Pylustrator.md) | Visual editing -> Matplotlib code | HIGH -- workflow reference | Visual edit generates reproducible code; our target model |
| FigureFirst | [FigureFirst](FigureFirst/FigureFirst.md) | SVG layout + Matplotlib data | MEDIUM | Layout-first workflow scientists want |
| Bioicons | [Bioicons](Bioicons/Bioicons.md) | Free SVG icon library for bio/chem | MEDIUM | Built-in icon library as differentiator |
| SciDraw | [SciDraw](SciDraw/SciDraw.md) | Community scientific drawings | LOW | Source of community components |

## Synthesis Research (Multi-Source)

| Name (Full) | Name (Short) | Summary | Usefulness | Key Insights |
|---|---|---|---|---|
| Zero-Tolerance Cross-Format Export | [zero-tolerance-formats](zero-tolerance-formats/zero-tolerance-formats.md) | Exhaustive study on pixel-perfect SVG→PDF/PNG export fidelity | **CRITICAL** -- defines export architecture | SVG self-containment checklist; resvg-wasm + typst/svg2pdf deep dive; 15+ failure modes; 8 non-negotiable rules |
| Custom Canvas Engine | [custom-canvas-engine](custom-canvas-engine/custom-canvas-engine.md) | How to build a custom Canvas 2D rendering engine from scratch | **CRITICAL** -- defines engine architecture | Scene graph with dirty flagging; signal-based reactivity; 6-phase build order; Figma/tldraw/Excalidraw engine breakdowns |
| Tables in Canvas | [tables-in-canvas](tables-in-canvas/tables-in-canvas.md) | Implementing tables in canvas drawing applications | **HIGH** -- defines table feature | Hybrid rendering (Canvas + DOM overlay); MathJax tex2svg for cells; booktabs themes; Markdown-KV for LLM metadata |

## Research Papers

| Name (Full) | Name (Short) | Summary | Usefulness | Key Insights |
|---|---|---|---|---|
| CanvasVAE | [CanvasVAE](CanvasVAE/CanvasVAE.md) | Vector graphics as element sequences (ICCV 2021) | LOW | Theoretical foundation for metadata serialization |
| VisAnatomy | [VisAnatomy](VisAnatomy/VisAnatomy.md) | SVG chart semantic labels (2024) | LOW | Labeling taxonomy for figure elements |
