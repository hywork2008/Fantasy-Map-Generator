import { SHIP_DIMENSIONS } from "../data/ships";
import { normalizeShipType } from "../generators/ships";
import type { CityDocument, Point } from "../types/document";
import type { ShipType } from "../types/ships";
import { shipHasHarborLand } from "./harborPierFacts";

export interface ShipSite {
  id: string;
  point: Point;
  type: ShipType;
  length: number;
  rotation: number;
}

/** Match the SVG's visibility, type aliases and default size. Angles are CCW from plan +Y. */
export function collectShipSites(city: CityDocument): ShipSite[] {
  return city.elements.flatMap(element => {
    if (element.kind !== "ship" || !element.point || !shipHasHarborLand(city, element)) return [];
    const type = normalizeShipType(element.shipType);
    return [
      {
        id: element.id,
        point: element.point,
        type,
        length:
          element.sizeMeters && element.sizeMeters > 0 ? element.sizeMeters : SHIP_DIMENSIONS[type].defaultSizeMeters,
        rotation: element.rotation ?? 0
      }
    ];
  });
}
