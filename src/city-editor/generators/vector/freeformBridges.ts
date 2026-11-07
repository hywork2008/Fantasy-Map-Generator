import type { VectorCityDocument } from "../../types/vector/document";
import { pathIntersections } from "./geometry/intersections";
import { bridgeGeometry } from "./geometry/network";
import { regionArea, regionBoolean } from "./geometry/regions";
import { pathSurface } from "./geometry/surfaces";
import { vectorWaterSurfaces } from "./geometry/water";
/** Import only straight, fully landed crossings that pass the common historical policy. */
export function adoptFreeformBridges(doc: VectorCityDocument): void {
  const waters = vectorWaterSurfaces(doc);
  for (const road of Object.values(doc.paths).filter(p => p.role === "road"))
    for (const river of Object.values(doc.paths).filter(p => p.role === "river")) {
      if (!regionBoolean([pathSurface(road)], [pathSurface(river)], "intersection").some(p => regionArea(p) > 1e-5))
        continue;
      if (road.source.kind !== "curve" || river.source.kind !== "curve") throw Error("freeform-crossing");
      const hits = pathIntersections(road, river);
      if (!hits.length) throw Error("freeform-crossing");
      for (const hit of hits) {
        const a = hit.a,
          b = hit.b,
          segment = road.source.segments.find(s => s.id === a.segmentId);
        if (segment?.kind !== "line") throw Error("freeform-crossing-bend");
        const length = Math.hypot(segment.to[0] - segment.from[0], segment.to[1] - segment.from[1]);
        const half = Math.max(
          river.width.leftMeters,
          river.width.rightMeters,
          ...river.width.stations.flatMap(w => [w.leftMeters, w.rightMeters])
        );
        let delta = (half + 3) / length;
        let adopted = false;
        for (let n = 0; n < 8 && a.t - delta > 0 && a.t + delta < 1; n++, delta *= 1.25) {
          const id = `bridge:freeform:${Object.keys(doc.connections.bridges).length + 1}`,
            bridge = {
              id,
              roadPathId: road.id,
              riverAnchor: b,
              from: { ...a, t: a.t - delta },
              to: { ...a, t: a.t + delta },
              structure: "timber" as const,
              dryLandingMeters: 1,
              editPolicy: "fixed" as const
            };
          try {
            bridgeGeometry(doc, bridge, waters);
            doc.connections.bridges[id] = bridge;
            adopted = true;
            break;
          } catch (error) {
            if (error instanceof Error && ["bridge-skew", "bridge-bent", "bridge-length"].includes(error.message))
              throw error;
          }
        }
        if (!adopted) throw Error("freeform-crossing-landing");
      }
    }
}
