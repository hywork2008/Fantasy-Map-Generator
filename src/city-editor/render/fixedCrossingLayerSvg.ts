import { currentFixedApproachFacts } from "./approachFacts";
import type { fixedDocumentLayers } from "./fixedDocumentGeometry";
import type { RenderContext } from "./renderContext";
import { element } from "./svgPrimitives";
import { corridorPathData } from "./townShapes";
/** Imported fixed-crossing approaches and bridges; drops them when the fixed geometry changed during the render. */
export function renderFixedCrossingLayers(
  ctx: RenderContext,
  svg: SVGSVGElement,
  fixedLayers: NonNullable<ReturnType<typeof fixedDocumentLayers>>,
  fixedEpoch: string
) {
  const { document } = ctx;
  const { sameEpoch, approaches } = currentFixedApproachFacts(document, fixedEpoch);
  if (!sameEpoch) {
    fixedLayers.water.remove();
    svg.setAttribute("data-fixed-geometry-status", "invalid");
  }
  svg.setAttribute("data-fixed-approach-status", approaches ? "ready" : "unvalidated");
  if (approaches)
    for (const approach of approaches) {
      const d = corridorPathData(approach.corridor.pieces);
      svg.appendChild(
        element("path", {
          d,
          fill: "none",
          stroke: "#b6ac99",
          "stroke-width": String(document.importedFixedCrossings!.roadWidthMeters),
          "stroke-linecap": "butt",
          "data-fixed-approach-id": approach.id
        })
      );
    }
  if (sameEpoch) svg.appendChild(fixedLayers.crossings);
}
