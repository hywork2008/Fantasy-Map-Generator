import { COORDINATE_SYSTEM } from "@deck.gl/core";
import { PolygonLayer } from "@deck.gl/layers";
import type { LandConnectionSnapshot } from "../../generators/landConnectionAdoption";
import type { exportRegisteredLandRouteSections } from "../../generators/registeredLandRouteSections";
import { buildRegisteredLandRouteScene, type RegisteredRouteSceneSettings } from "../registeredLandRouteScene";

type Color = [number, number, number, number];
export interface RegisteredRoutePolygon {
  kind: "road" | "bridge";
  id: number;
  part: number;
  polygon: number[][];
}
/** Full-width verified polygons, with fixed physical widths at every zoom.
 * The bridge layer contains exactly one deck rectangle per facility. Neither
 * PathLayer joins nor display simplification can rotate/widen bridge decks. */
export function buildRegisteredLandRouteLayers(
  snapshot: LandConnectionSnapshot,
  current: Parameters<typeof exportRegisteredLandRouteSections>[1],
  settings: RegisteredRouteSceneSettings,
  style: { roadColor: Color; bridgeColor: Color }
): { layers: readonly PolygonLayer<RegisteredRoutePolygon>[] } | { reason: string } {
  if (
    ![style.roadColor, style.bridgeColor].every(
      c => c.length === 4 && c.every(v => Number.isInteger(v) && v >= 0 && v <= 255)
    )
  )
    return { reason: "invalid-style" };
  const built = buildRegisteredLandRouteScene(snapshot, current, settings);
  if (!("scene" in built)) return built;
  const { scene } = built;
  const layers = (["road", "bridge"] as const).map(kind => {
    const records = kind === "road" ? scene.roads : scene.bridges;
    const data: RegisteredRoutePolygon[] = records.flatMap(r =>
      r.polygons.map(p => ({ kind, id: r.id, part: r.part, polygon: p.map(q => [...q]) }))
    );
    return new PolygonLayer<RegisteredRoutePolygon>({
      id: `registered-land-${kind}s`,
      data,
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      filled: true,
      stroked: false,
      extruded: false,
      pickable: true,
      getPolygon: d => d.polygon,
      getFillColor: kind === "road" ? [...style.roadColor] : [...style.bridgeColor],
      parameters: { depthWriteEnabled: false }
    });
  });
  return { layers };
}
