import { growthHash } from "../../utils/urbanMorphology";
import { forestTreeCandidates, forestTreeRandom } from "../generators/forestCandidates";
import { landscapeHasTrees, landscapeTreeBiome, naturalTreeSuitability } from "../generators/landscapeVegetation";
import { cityTerrain } from "../generators/terrainElevation";
import type { ForestPlan } from "../types/contracts/forest";
import type { CityDocument } from "../types/document";
import { resolveLandscapeTheme } from "./landscape";
import { landscapeTreeSpecies } from "./landscapeTreeSpecies";
import type { RenderQuality } from "./renderQuality";
import { element, polygon } from "./svgPrimitives";

/** View choices only. F4 supplies the UI/persistence; export can already request either representation. */
export interface ForestSvgOptions {
  representation?: "edge-fill" | "all-trees";
  static?: boolean;
  viewportWidth?: number;
}

export const FOREST_SVG_ELEMENT_LIMIT = { detailed: 8000, light: 3000, minimal: 1 } as const;
/** Adjusts presentation only; mapDisplay calls this during zoom without rebuilding geometry or symbols. */
export function updateForestScale(svg: SVGElement, extentMeters: number, zoom: number, viewportWidth = 1000): void {
  const layer = svg.matches(".ce-forest-layer") ? svg : svg.querySelector<SVGElement>(".ce-forest-layer");
  if (!layer || layer.getAttribute("data-forest-static") === "true") return;
  const pixels =
    (8 * Math.max(1, viewportWidth || 1000) * (Number.isFinite(zoom) && zoom > 0 ? zoom : 1)) /
    Math.max(1, extentMeters);
  layer.setAttribute("data-forest-detail", pixels < 0.6 ? "surface" : pixels < 2 ? "coarse" : "full");
}

/** Exact forest fill survives every quality. Crowns and the internal pattern share an even-odd clip. */
export function renderForestLayer(
  document: CityDocument,
  plan: ForestPlan,
  quality: RenderQuality = "detailed",
  zoom = 1,
  options: ForestSvgOptions = {}
): SVGGElement {
  const layer = element("g", {
    class: "ce-forest-layer",
    "data-scene-layer": "forest",
    "pointer-events": "none",
    "data-forest-area-m2": String(landscapeHasTrees(document) ? plan.areaM2 : 0),
    "data-forest-regions": String(plan.regions.length),
    "data-forest-representation": options.representation ?? "edge-fill",
    "data-forest-static": String(options.static === true)
  }) as SVGGElement;
  if (!plan.regions.length || !landscapeHasTrees(document)) return layer;
  const density = document.forestSettings?.density ?? "standard";
  const theme = resolveLandscapeTheme(document.biome);
  const fill = density === "sparse" ? "#94a87b" : density === "dense" ? "#688259" : "#7d9667";
  const conifer = ["boreal", "cedar", "conifer", "fir", "volcanic"].includes(landscapeTreeBiome(document));
  const crown = conifer ? "#45674b" : theme.category === "tropical" ? "#466f45" : "#54764a";
  const light = conifer ? "#68876a" : "#79945e";
  const path = plan.regions.map(region => [region.outer, ...region.holes].map(polygon).join(" ")).join(" ");
  layer.appendChild(
    element("path", { class: "ce-forest-surface", d: path, fill, stroke: "none", "fill-rule": "evenodd" })
  );
  if (quality === "minimal") return layer;
  const seed = document.generationSeed ?? document.fabric?.seed ?? document.format;
  const prefix = `ce-forest-${growthHash(`${seed}:${density}:${crown}:${path}`)}`;
  const defs = element("defs", {});
  const clip = element("clipPath", { id: `${prefix}-clip`, clipPathUnits: "userSpaceOnUse" });
  clip.appendChild(element("path", { d: path, "clip-rule": "evenodd", "fill-rule": "evenodd" }));
  defs.appendChild(clip);
  const broadleaf = element("g", { id: `${prefix}-leaf` });
  broadleaf.appendChild(
    element("path", {
      d: "M-.94 -.15 Q-1 -.63 -.55 -.65 Q-.25 -1.05 .12 -.82 Q.7 -1 .77 -.48 Q1.08 -.12 .8 .22 Q.9 .76 .35 .8 Q-.12 1.08 -.4 .78 Q-.95 .83 -.88 .34 Q-1.13 .13 -.94 -.15Z",
      fill: crown,
      stroke: "#3d5838",
      "stroke-width": ".1"
    })
  );
  broadleaf.appendChild(
    element("path", {
      d: "M-.55 -.36 Q-.17 -.75 .28 -.52 M-.65 .1 Q-.32 -.05 -.13 .13 M.14 .31 Q.49 .52 .67 .14",
      fill: "none",
      stroke: light,
      "stroke-width": ".11",
      "stroke-linecap": "round"
    })
  );
  defs.appendChild(broadleaf);
  const evergreen = element("g", { id: `${prefix}-conifer` });
  evergreen.appendChild(
    element("path", {
      d: "M0 -1 .2 -.57 .51 -.78 .49 -.35 .86 -.4 .62 -.05 1 .2 .54 .27 .62 .71 .22 .55 0 1 -.2 .56 -.63 .77 -.51 .29 -.96 .19 -.62 -.07 -.89 -.42 -.43 -.35 -.51 -.78 -.18 -.57Z",
      fill: "#45674b",
      stroke: "#304d37",
      "stroke-width": ".07"
    })
  );
  evergreen.appendChild(
    element("path", {
      d: "M0 -.7 0 .65 M-.48 -.2 .46 .2 M-.34 .38 .34 -.38",
      fill: "none",
      stroke: "#71906c",
      "stroke-width": ".1"
    })
  );
  defs.appendChild(evergreen);
  const pattern = element("pattern", {
    id: `${prefix}-texture`,
    patternUnits: "userSpaceOnUse",
    width: "46",
    height: "42",
    x: String(forestTreeRandom(`${seed}:pattern-x`) * 46),
    y: String(forestTreeRandom(`${seed}:pattern-y`) * 42)
  });
  pattern.appendChild(
    element("path", {
      d: "M3 8q3-5 8-1m-6 15q4-4 8 0m12-10q4-5 10-1m-3 20q4-3 9 0",
      fill: "none",
      stroke: crown,
      "stroke-width": "1.2",
      "stroke-linecap": "round"
    })
  );
  defs.appendChild(pattern);
  defs.appendChild(
    element(
      "style",
      {},
      ".ce-forest-layer[data-forest-detail='surface'] .ce-forest-trees{display:none}.ce-forest-layer[data-forest-detail='coarse'] .ce-forest-fine{display:none}"
    )
  );
  layer.appendChild(defs);
  layer.appendChild(
    element("path", {
      class: "ce-forest-texture",
      d: path,
      fill: `url(#${prefix}-texture)`,
      opacity: density === "sparse" ? ".16" : density === "dense" ? ".32" : ".24",
      "fill-rule": "evenodd",
      "clip-path": `url(#${prefix}-clip)`
    })
  );
  const trees = element("g", { class: "ce-forest-trees", "clip-path": `url(#${prefix}-clip)` });
  layer.appendChild(trees);
  const limit = quality === "light" ? FOREST_SVG_ELEMENT_LIMIT.light : FOREST_SVG_ELEMENT_LIMIT.detailed;
  const available = Math.max(0, limit - layer.querySelectorAll("*").length);
  const probability = density === "sparse" ? 0.5 : density === "dense" ? 1 : 0.8;
  const ground = document.fabric?.generation?.settings.mode === "terrain" ? cityTerrain(document) : undefined;
  const samples = forestTreeCandidates(plan, seed, options.representation === "all-trees")
    .filter(
      tree =>
        forestTreeRandom(`${seed}:${tree.id}:density`) <
        probability * naturalTreeSuitability(document, tree.point, ground?.heightAt)
    )
    .slice(0, available);
  for (const tree of samples) {
    const radius = 3.5 + forestTreeRandom(`${seed}:${tree.id}:radius`) * 1.5;
    const species = landscapeTreeSpecies("garden_parkland", document, tree.point, "woodland");
    if (!species) continue;
    const needle = ["norway_spruce", "western_red_cedar", "silver_fir", "canary_pine", "scots_pine"].includes(species);
    const angle = forestTreeRandom(`${seed}:${tree.id}:angle`) * 360;
    trees.appendChild(
      element("use", {
        href: `#${prefix}-${needle ? "conifer" : "leaf"}`,
        class: `ce-forest-tree${forestTreeRandom(`${seed}:${tree.id}:tier`) >= 0.25 ? " ce-forest-fine" : ""}`,
        transform: `translate(${tree.point[0]} ${-tree.point[1]}) rotate(${angle}) scale(${radius})`,
        "data-forest-tree": tree.id,
        "data-forest-edge": String(tree.edge),
        "data-world-x": String(tree.point[0]),
        "data-world-y": String(tree.point[1])
      })
    );
  }
  layer.setAttribute("data-forest-trees", String(samples.length));
  updateForestScale(layer, document.frame.extentMeters, zoom, options.viewportWidth);
  return layer;
}
