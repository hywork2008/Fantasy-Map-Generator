import { pointInPolygon } from "../../city-editor/generators/geom";
import type { Point } from "../../city-editor/types/primitives";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { ModelKit } from "../medieval/modelKit";

/** A compact site keeps metre-sized joinery when a full BV assembly cannot fit its saved reservation. */
export function createMeasuredFacility(
  ring: Point[],
  width: number,
  depth: number,
  building: boolean,
  sourceHeight: number
): CityStructureMeshes {
  const k = new ModelKit("measured-facility");
  const roofFits = [-1, 1].every(x =>
    [-1, 1].every(z => pointInPolygon([(x * (width - 0.2)) / 2, (z * (depth - 0.2)) / 2], ring))
  );
  if (building && width >= 3 && depth >= 3 && roofFits) {
    // Generate a smaller building, rather than shrinking a doorway, a floor or a window.
    const storeys = sourceHeight >= 8 ? 2 : 1;
    k.hall(0, 0, width - 0.8, depth - 0.9, storeys === 2 ? 6.2 : 3.2, Math.min(2, depth * 0.25), {
      wall: "stone",
      storeys
    });
  } else {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i],
        b = ring[(i + 1) % ring.length];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < 0.2) continue;
      if (i === 0 && length >= 2) {
        const point = (distance: number): Point => [
          a[0] + ((b[0] - a[0]) * distance) / length,
          a[1] + ((b[1] - a[1]) * distance) / length
        ];
        k.fence(a, point((length - 1.4) / 2));
        k.fence(point((length + 1.4) / 2), b);
      } else k.fence(a, b);
    }
  }
  return k.finish();
}
