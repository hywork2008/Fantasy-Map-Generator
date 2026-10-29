import { landscapeHasTrees } from "../generators/landscapeVegetation";
import type { ParkTreeCanopy } from "../generators/parkFabric";
import { renderAerialLandmarks, renderBarbicans } from "./aerialLandmarksSvg";
import { renderTownQuays } from "./quaySvg";
import type { RenderContext } from "./renderContext";
import { element } from "./svgPrimitives";
import type { TownLayerPlans } from "./townFabricSvg";
import { renderTownFortifications } from "./townFortificationSvg";
import { renderTownWatermills } from "./watermillSvg";
/** Town view layers above the features: quays, mills, barbicans, walls, fortifications, parks, trees. */
export function renderTownStructures(
  ctx: RenderContext,
  svg: SVGSVGElement,
  townPlans: TownLayerPlans,
  features: SVGGElement
) {
  const { document, tool, selection, minimal, preview } = ctx;
  if (!preview) {
    svg.appendChild(renderTownQuays(townPlans.harbor, townPlans.plannedPiers, townPlans.fallbackPiers));
    svg.appendChild(renderTownWatermills(document, townPlans.watermills, tool, selection.inspectedId));
    svg.appendChild(renderAerialLandmarks(townPlans.aerial, tool, selection.inspectedId, minimal));
  }
  if (!preview) {
    svg.appendChild(renderBarbicans(document, townPlans.aerial, tool, selection.inspectedId));
    // SVG paint order places the curtain and its towers above attached outworks.
    const walls = element("g", { class: "ce-walls" });
    for (const node of Array.from(features.children))
      if (node.matches(".ce-feature--wall, .ce-wall-structure")) walls.appendChild(node);
    svg.appendChild(walls);
  }
  svg.appendChild(renderTownFortifications(document, tool, selection.inspectedId));
  renderTrees(
    ctx,
    svg,
    townPlans.parks.map(park => park.trees),
    "ce-park-trees"
  );
  renderTrees(ctx, svg, [townPlans.vacantTrees ?? []], "ce-vacant-lot-trees");
}

function renderTrees(ctx: RenderContext, svg: SVGSVGElement, treeGroups: ParkTreeCanopy[][], className: string) {
  const { lightweight, minimal } = ctx;
  if (!landscapeHasTrees(ctx.document)) return;
  if (treeGroups.some(trees => trees.length)) {
    const parkTreesLayer = element("g", {
      class: className,
      style: "z-index: 5;",
      "pointer-events": "none"
    });
    for (const trees of treeGroups) {
      for (const [treeIndex, tr] of trees.entries()) {
        if (minimal && treeIndex % 3 !== 0) continue;
        if (lightweight) {
          parkTreesLayer.appendChild(
            element("circle", {
              cx: String(tr.center[0]),
              cy: String(-tr.center[1]),
              r: String(tr.radius),
              class: "ce-park-tree",
              fill: "#557849",
              stroke: "#385230",
              "stroke-width": "0.6"
            })
          );
          continue;
        }
        const treeGroup = element("g", { class: "ce-park-tree", style: "z-index: 5;" });
        const [cx, cy] = [tr.center[0], -tr.center[1]];
        for (const sub of tr.subCircles) {
          treeGroup.appendChild(
            element("circle", {
              cx: String(cx + sub.offset[0]),
              cy: String(cy - sub.offset[1]),
              r: String(sub.radius),
              class: "ce-park-canopy-lobe",
              fill: "#557849",
              stroke: "#385230",
              "stroke-width": "0.6"
            })
          );
        }
        treeGroup.appendChild(
          element("circle", {
            cx: String(cx),
            cy: String(cy),
            r: String(tr.radius),
            class: "ce-park-canopy-main",
            fill: "#557849",
            stroke: "#385230",
            "stroke-width": "0.6"
          })
        );
        treeGroup.appendChild(
          element("circle", {
            cx: String(cx),
            cy: String(cy),
            r: String(tr.radius * 0.55),
            class: "ce-park-canopy-highlight",
            fill: "#688e5b",
            stroke: "none",
            opacity: "0.85"
          })
        );
        parkTreesLayer.appendChild(treeGroup);
      }
    }
    svg.appendChild(parkTreesLayer);
  }
}
