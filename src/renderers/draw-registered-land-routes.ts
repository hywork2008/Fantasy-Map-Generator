import type { LandConnectionSnapshot } from "../generators/landConnectionAdoption";
import type { exportRegisteredLandRouteSections } from "../generators/registeredLandRouteSections";
import { buildRegisteredLandRouteScene, type RegisteredRouteSceneSettings } from "./registeredLandRouteScene";

/** Opt-in dedicated SVG group. Replaces only this group's registered routes;
 * failed current validation clears stale geometry, including bridge decks. */
export function drawRegisteredLandRoutes(
  group: SVGGElement,
  snapshot: LandConnectionSnapshot,
  current: Parameters<typeof exportRegisteredLandRouteSections>[1],
  settings: RegisteredRouteSceneSettings
): { status: "drawn"; revision: number } | { reason: string } {
  const built = buildRegisteredLandRouteScene(snapshot, current, settings);
  if (!("scene" in built)) {
    group.replaceChildren();
    group.removeAttribute("data-registered-revision");
    return built;
  }
  const { scene } = built,
    document = group.ownerDocument;
  const paths: SVGPathElement[] = [];
  for (const [kind, records] of [
    ["road", scene.roads],
    ["bridge", scene.bridges]
  ] as const) {
    for (const record of records) {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", record.svgPath);
      path.setAttribute("data-kind", kind);
      path.setAttribute(kind === "bridge" ? "data-facility-id" : "data-connection-id", String(record.id));
      path.setAttribute("data-part", String(record.part));
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-width", String(scene.roadWidth));
      path.setAttribute("stroke-linecap", "butt");
      path.setAttribute("stroke-linejoin", "round");
      paths.push(path);
    }
  }
  group.replaceChildren(...paths);
  group.setAttribute("data-registered-revision", String(scene.revision));
  return { status: "drawn", revision: scene.revision };
}
