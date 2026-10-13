import type { RenderContext } from "./renderContext";
import { element } from "./svgPrimitives";
/** Scene-region tagging and the final clipped world-space frame around every map layer. */
export function frameScene(
  ctx: RenderContext,
  svg: SVGSVGElement,
  features: SVGGElement,
  groundColor: string,
  sceneVisibility: { core: boolean; regional: boolean }
) {
  const { document } = ctx;
  if (document.sceneRegions) {
    const shared = new Set([
      "ce-continuous-water",
      "ce-fixed-river-water",
      "ce-fixed-crossings",
      "ce-regional-water-cells",
      "ce-regional-coastal-water"
    ]);
    const crossings = element("g", { class: "ce-regional-crossings" });
    for (const node of Array.from(
      features.querySelectorAll(".ce-bridge-outline, .ce-bridge-deck, .ce-movable-bridge-hinge")
    ))
      crossings.appendChild(node);
    crossings.setAttribute("data-scene-region", "shared");
    svg.appendChild(crossings);
    shared.add("ce-regional-crossings");
    for (const child of Array.from(svg.children)) {
      if (shared.has(child.getAttribute("class") ?? "") || child.hasAttribute("data-fixed-approach-id")) {
        child.setAttribute("data-scene-region", "shared");
        continue;
      }
      const regional = child.getAttribute("data-scene-region") === "regional";
      child.setAttribute("data-scene-region", regional ? "regional" : "core");
      if (!(regional ? sceneVisibility.regional : sceneVisibility.core)) child.setAttribute("display", "none");
    }
  }
  // The camera may leave the surveyed frame. Keep every map layer (including
  // source water extending beyond the mesh) inside a stable world-space frame.
  // Preserve the source geometry; only the final presentation is clipped.
  const extent = document.frame.extentMeters;
  const frameAttrs = {
    x: String(-extent / 2),
    y: String(-extent / 2),
    width: String(extent),
    height: String(extent)
  };
  const defs = element("defs", {});
  const clip = element("clipPath", { id: "ce-map-frame", clipPathUnits: "userSpaceOnUse" });
  clip.appendChild(element("rect", frameAttrs));
  defs.appendChild(clip);
  const scene = element("g", { class: "ce-map-scene", "clip-path": "url(#ce-map-frame)" });
  scene.appendChild(
    element("rect", {
      ...frameAttrs,
      fill: document.appearance === "town" ? groundColor : "#e1dfd4",
      class: "ce-background",
      "pointer-events": "none"
    })
  );
  for (const child of Array.from(svg.children)) {
    if (child.localName !== "style" && child.localName !== "defs") scene.appendChild(child);
  }
  svg.append(defs, scene);
}
