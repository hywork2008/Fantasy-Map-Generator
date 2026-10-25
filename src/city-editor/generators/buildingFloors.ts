import { growthRandom } from "../../utils/urbanMorphology";
import type { FloorSpec, FloorUse } from "../types/contracts/buildingMassing";
import type { CityDocument } from "../types/document";
import { stableBuildingAppearanceId } from "./buildingAppearanceId";
import type { BuildingLot } from "./buildingLots.types";

const ANTIQUITY = new Set(["classicalAntiquity", "lateAntiquity"]);
const GROUND_HEIGHT: Record<FloorUse, number> = {
  residential: 3.2,
  retail: 4,
  craft: 4,
  storage: 4.5,
  stable: 3.6,
  civic: 5,
  religious: 6,
  military: 4,
  service: 3.2
};
const UPPER_HEIGHT: Record<FloorUse, number> = {
  residential: 2.9,
  retail: 3.2,
  craft: 3.2,
  storage: 3.6,
  stable: 3,
  civic: 4,
  religious: 4.5,
  military: 3.4,
  service: 2.9
};
function hasResidentialUse(lot: BuildingLot): boolean {
  if (lot.uses?.length) return lot.uses.includes("residential");
  return !lot.role || lot.role === "main";
}

function groundUse(lot: BuildingLot): FloorUse {
  const uses = lot.uses ?? [];
  if (lot.role === "workshop" || (uses.includes("craft") && !uses.includes("retail"))) return "craft";
  if (uses.includes("retail")) return "retail";
  if (lot.role === "stable") return "stable";
  if (lot.role === "store" || lot.role === "shed" || (uses.includes("storage") && !uses.includes("residential")))
    return "storage";
  return "residential";
}

function floorUses(lot: BuildingLot, storeys: number): FloorUse[] {
  const ground = groundUse(lot);
  const residential = hasResidentialUse(lot);
  if (!residential || ground === "residential") return Array.from({ length: storeys }, () => ground);
  const share = lot.residentialFloorShare ?? (lot.uses?.some(use => use !== "residential") ? 0.55 : 0.85);
  const residentialCount = Math.max(0, Math.min(storeys - 1, Math.round(share * storeys)));
  const floors: FloorUse[] = [ground];
  let placed = 0;
  for (let level = 1; level < storeys; level++) {
    if (placed < residentialCount) {
      floors.push("residential");
      placed++;
    } else floors.push(ground);
  }
  return floors;
}

function floorSpecs(uses: FloorUse[], period: string): FloorSpec[] {
  const floors = uses.map((use, level) => ({
    level,
    use,
    heightMeters: level === 0 ? GROUND_HEIGHT[use] : UPPER_HEIGHT[use]
  }));
  const eave = floors.reduce((sum, floor) => sum + floor.heightMeters, 0);
  if (!ANTIQUITY.has(period) || eave <= 21) return floors;
  const scale = 21 / eave;
  return floors.map(floor => ({ ...floor, heightMeters: floor.heightMeters * scale }));
}

export function buildingFloorSpecs(
  document: CityDocument,
  lot: BuildingLot,
  storeys: number,
  varied: boolean
): FloorSpec[] {
  const period = document.urbanMorphology?.period ?? document.historicalPeriod ?? "ageOfExploration";
  const floors = floorSpecs(floorUses(lot, storeys), period);
  if (varied && !document.mesh?.faces?.[lot.faceId]?.properties.locked) {
    const seed = document.generationSeed || document.fabric?.seed || "massing";
    const key = `${seed}:height-v1:${lot.heightKey ?? stableBuildingAppearanceId(lot)}`;
    const scale = 0.95 + growthRandom(`${key}:floor-scale`) * 0.1;
    for (const floor of floors)
      floor.heightMeters = floor.heightMeters * scale + (growthRandom(`${key}:floor:${floor.level}`) - 0.5) * 0.06;
  }
  return floors;
}
