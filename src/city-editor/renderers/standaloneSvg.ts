import type { GenerationObserver } from "../generators/generationDiagnostics";
import type { CityDocument } from "../types/document";
import type { RenderSelection } from "../types/selection";
import { renderEditorSvg } from "./editorSvg";
import { getLandscapeSuburbFaceColor } from "./landscape";
import { serializeSvgFile } from "./serializeSvg";
import { element, NS } from "./svgPrimitives";
export const STANDALONE_SVG_STYLE = `
  .ce-svg { background: transparent; }
  .ce-reference-image { opacity: 0.82; }
  .ce-svg.ce-svg--town .ce-face--land { fill: #d5cfbf; }
  .ce-features { z-index: 2; }
  .ce-park-trees, .ce-park-tree { z-index: 5; }
  .ce-park-lawn { fill: #7ea867; stroke: #4d733b; stroke-width: 0.8px; }
  .ce-park-path { fill: none; stroke: #d8d1bf; stroke-width: 1.8px; stroke-linecap: round; stroke-linejoin: round; }
  .ce-park-grass { fill: none; stroke: #5d8249; stroke-width: 0.7px; stroke-linecap: round; }
  .ce-park-canopy-lobe, .ce-park-canopy-main { fill: #557849; stroke: #385230; stroke-width: 0.6px; }
  .ce-park-canopy-highlight { fill: #688e5b; opacity: 0.85; }
  .ce-millhouse-base { fill: #b8ad98; stroke: #332f28; stroke-width: 0.45px; }
  .ce-weir-crest { stroke-linecap: round; }
  .ce-waterwheel-unit:hover { filter: drop-shadow(0 0 2px rgba(255,200,80,0.8)); }
  .ce-svg--town .ce-face--sea, .ce-svg--town .ce-face--openWater { fill: #456d7f; }
  .ce-svg--town .ce-face--lake { fill: #527f8b; }
  .ce-svg--town .ce-moat-water { stroke: #527f8b; }
  .ce-svg--town .ce-edge { stroke: transparent; }
  .ce-svg--town .ce-feature { opacity: 1; }
  .ce-svg--town .ce-feature--wall { stroke-dasharray: none; }
  .ce-building { fill: var(--ce-roof-color, #b2afa2); stroke: #49483f; stroke-width: 0.35px; stroke-linejoin: miter; stroke-miterlimit: 2; }
  .ce-building--landmark { fill: #373831; }
  .ce-road-casing, .ce-road--cobble, .ce-road-cobble-casing { stroke-linecap: round; stroke-linejoin: round; }
  .ce-road-cobble-joints { stroke-linecap: butt; }
  .ce-bridge-outline, .ce-bridge-deck { fill: none; stroke-linecap: butt; }
  .ce-face { stroke: none; fill: #e1dfd4; }
  .ce-face--sea, .ce-face--lake, .ce-face--openWater { fill: #91c8d3; }
  .ce-face--land.ce-face--ward-unassigned { fill: #e1dfd4; }
  .ce-face--land.ce-face--ward-market { fill: #edcf7a; }
  .ce-face--land.ce-face--ward-castle { fill: #bca7ce; }
  .ce-face--land.ce-face--ward-merchant { fill: #dfa184; }
  .ce-face--land.ce-face--ward-patriciate { fill: #cab4d3; }
  .ce-face--land.ce-face--ward-craftsmen { fill: #d1a46e; }
  .ce-face--land.ce-face--ward-harbor { fill: #e3b66d; }
  .ce-face--land.ce-face--ward-park { fill: #99c187; }
  .ce-face--land.ce-face--ward-farm { fill: #c6c19f; }
  .ce-face--land.ce-face--ward-cemetery { fill: #99c187; }
  .ce-face--land.ce-face--ward-empty { fill: #f2ead2; }
  .ce-face--land.ce-face--urban-step { fill: #d9662b; }
  .ce-edge { fill: none; stroke: #738083; stroke-width: 1px; }
  .ce-feature { fill: none; stroke-linecap: round; stroke-linejoin: round; opacity: 0.9; }
  .ce-feature--wall { stroke-dasharray: 2 2; }
  .ce-svg--town .ce-feature--wall-wood { stroke-linecap: round; }
  .ce-wall-structure { pointer-events: none; }
  .ce-wall-wood-logs { stroke-linecap: round; }
  .ce-wall-wood-cores { stroke-linecap: round; }
  .ce-wall-stone-merlons { stroke-linecap: butt; }
  .ce-tower-decoration { pointer-events: none; }
  .ce-tower-wood-logs { stroke-linecap: round; }
  .ce-tower-wood-cores { stroke-linecap: round; }
  .ce-tower-stone-merlons { stroke-linecap: butt; }
  .ce-gate-decoration { pointer-events: none; }
  .ce-gate-wood-post { stroke-linecap: round; }
  .ce-gate-stone-merlons { stroke-linecap: butt; }
  .ce-tower--wood { stroke: #482f18; stroke-width: 0.5px; }
  .ce-gate-tower--wood { stroke: #482f18; stroke-width: 0.5px; }
  .ce-feature--plank { filter: drop-shadow(0 0 1px #332b22); }
  .ce-element { color: #263c42; }
  .ce-element-halo { fill: rgb(255 253 244 / 82%); stroke: #d0d6ce; stroke-width: 1px; }
  .ce-element-mark { stroke-linecap: round; stroke-linejoin: round; }
  .ce-element--harbor { color: #0e6f83; }
  .ce-element--citadel { color: #5f4b70; }
  .ce-element--temple { color: #79572c; }
  .ce-tree-crown { fill: #697d64; stroke: #394b40; stroke-width: 1px; }
  .ce-tree-trunk { fill: none; stroke: #514538; stroke-linecap: round; }
  .ce-pier { fill: #c8beaa; stroke: #4a463c; stroke-width: 0.6px; }
  .ce-crane { filter: drop-shadow(0 0 1px #332b22); }
  .ce-cargo-pile { opacity: 0.95; }
  .ce-ship { cursor: pointer; }
  .ce-ship-shadow { fill: rgba(18, 30, 38, 0.32); }
  .ce-ship-hull-outer { fill: #382c20; stroke: #221a13; }
  .ce-ship-deck { fill: #c8b99c; stroke: #423527; }
  .ce-ship-deck-step { fill: #ab9b7e; stroke: #382a1d; }
  .ce-ship-hatch { fill: #5a4834; stroke: #31261a; }
  .ce-ship-grating { stroke: #31261a; }
  .ce-ship-mast { fill: #5a4531; stroke: #22170e; }
  .ce-ship-crowsnest { fill: #38281a; stroke: #1e150d; }
  .ce-ship-yard { stroke: #3e3020; }
  .ce-ship-furled-sail { fill: #e8e0ce; stroke: #7d7260; }
  .ce-ship-rigging { stroke: #2b2218; opacity: 0.75; }
  .ce-ship-boat { fill: #b8a88a; stroke: #382a1d; }
  .ce-ship-lantern { fill: #c49a45; stroke: #523e16; }
  .ce-ship-rotate-knob { transition: r 0.15s ease; filter: drop-shadow(0 1px 3px rgba(0,0,0,0.35)); }
  .ce-ship-rotate-knob:hover { r: 6px; fill: #e8f4fc; }
  .ce-temple { cursor: pointer; }
  .ce-temple-shadow { fill: rgba(18, 22, 25, 0.28); }
  .ce-temple-base { fill: #b8b5ad; stroke: #38352e; stroke-width: 0.7px; stroke-linejoin: round; }
  .ce-temple-buttresses { fill: #9e9b93; stroke: #38352e; stroke-width: 0.5px; }
  .ce-temple-nave, .ce-temple-transept, .ce-temple-apse, .ce-temple-crossing, .ce-temple-westwork, .ce-temple-chancel, .ce-temple-porch, .ce-temple-roof { stroke-linejoin: round; }
  .ce-temple-spire-diagonal { stroke-linecap: round; }
  .ce-megalith-stone, .ce-megalith-portal { stroke-linejoin: round; }
`;

export function renderStandaloneCitySvg(
  document: CityDocument,
  preview = false,
  observer?: GenerationObserver
): SVGSVGElement {
  const extent = document.frame.extentMeters;
  const viewBox = `${-extent / 2} ${-extent / 2} ${extent} ${extent}`;
  const emptySel: RenderSelection = {
    faceId: null,
    edgeId: null,
    vertexId: null,
    groupId: null,
    inspectedId: null,
    hoverGroupId: null,
    hoverVertexId: null,
    hoverEdgeId: null
  };
  const svg = renderEditorSvg(
    document,
    "select",
    emptySel,
    viewBox,
    1,
    false,
    document.referenceImage ?? null,
    null,
    null,
    null,
    false,
    false,
    observer,
    false,
    false,
    "detailed",
    preview
  );
  if (preview) {
    svg.setAttribute("data-render-quality", "preview");
    svg.setAttribute("data-preview-symbols", String(svg.querySelectorAll("[data-preview-block]").length));
    for (const face of Object.values(document.mesh.faces)) {
      if (!face.properties.buildable || face.properties.water !== "land") continue;
      const path = svg.querySelector(`[data-face="${face.id}"]`);
      path?.setAttribute("style", "fill: #beb5a1");
    }
  }

  svg.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns", NS);
  svg.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns:xlink", "http://www.w3.org/1999/xlink");
  svg.setAttribute("version", "1.1");
  svg.setAttribute("width", String(extent));
  svg.setAttribute("height", String(extent));

  let defs = [...svg.children].find(child => child.localName === "defs") as SVGDefsElement | undefined;
  if (!defs) {
    defs = element("defs", {}) as SVGDefsElement;
    svg.insertBefore(defs, svg.firstChild);
  }
  const style = element("style", { type: "text/css" }, STANDALONE_SVG_STYLE);
  defs.appendChild(style);

  // Append biome overrides after the standalone defaults. The ground itself
  // is the same clipped rectangle used by the editor, never the SVG viewport.
  if (document.appearance === "town") {
    const suburbColor = getLandscapeSuburbFaceColor(document);
    defs.appendChild(
      element(
        "style",
        { type: "text/css" },
        `.ce-svg.ce-svg--town .ce-face--land, .ce-face--land.ce-face--ward-unassigned, .ce-face--land.ce-face--ward-empty { fill: ${suburbColor}; }`
      )
    );
  }

  for (const img of svg.querySelectorAll("image")) {
    const href = img.getAttribute("href");
    if (href && !img.hasAttribute("xlink:href")) {
      img.setAttribute("xlink:href", href);
    }
  }

  for (const layer of svg.querySelectorAll(".ce-hover-layer, .ce-measure-layer, .ce-route-preview-layer")) {
    layer.remove();
  }
  for (const el of svg.querySelectorAll("[data-pick]")) {
    el.removeAttribute("data-pick");
  }
  for (const el of svg.querySelectorAll<SVGElement>("[style*='cursor']")) {
    el.style.removeProperty("cursor");
  }

  return svg;
}

export function serializeCitySvg(document: CityDocument, observer?: GenerationObserver): string {
  const svg = renderStandaloneCitySvg(document, false, observer);
  return serializeSvgFile(svg);
}
