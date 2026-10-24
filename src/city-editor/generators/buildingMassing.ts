import type { FaithFamily, FortificationFamily } from "../../data/civilizationTraditions";
import { periodIndex } from "../../data/civilizationTraditions";
import { growthRandom, residentialStoreys } from "../../utils/urbanMorphology";
import type { FloorSpec, FloorUse, RoofForm, RoofMaterial, WallMaterial } from "../types/contracts/buildingMassing";
import type { CityDocument } from "../types/document";
import type { Point } from "../types/primitives";
import type { BuildingLot } from "./buildingLots.types";
import { isResidentialBuilding } from "./residentialCapacity";

const MEDIEVAL = new Set(["earlyMedieval", "highMedieval", "lateMedieval"]);
const ANTIQUITY = new Set(["classicalAntiquity", "lateAntiquity"]);
const MEDITERRANEAN_FAITH = new Set<FaithFamily>([
  "classicalPolytheism",
  "semiticPolytheism",
  "sunni",
  "shia",
  "judaism",
  "orthodox",
  "zoroastrian"
]);
const EAST_ASIAN_FAITH = new Set<FaithFamily>([
  "sinitic",
  "neoConfucian",
  "shintoBuddhist",
  "mahayana",
  "theravada",
  "vajrayana",
  "hindu"
]);
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
const ROOF_PITCH: Record<RoofMaterial, number> = {
  thatch: 48,
  tile: 32,
  slate: 40,
  shingle: 38,
  turf: 8,
  lead: 15
};

function periodOf(document: CityDocument): string {
  return document.urbanMorphology?.period || document.historicalPeriod || "ageOfExploration";
}

function biomeText(document: CityDocument): string {
  const biome = document.biome;
  return `${biome?.key ?? ""} ${biome?.name ?? ""} ${(biome?.tags ?? []).join(" ")}`.toLowerCase();
}

function climateOf(document: CityDocument): { arid: boolean; forest: boolean } {
  const text = biomeText(document);
  return {
    arid: /desert|arid|steppe/.test(text),
    forest: /forest|taiga|jungle|woodland/.test(text)
  };
}

function traditionOf(document: CityDocument): { mediterranean: boolean; eastAsian: boolean } {
  const faith = document.civilization?.faith;
  const fort = document.civilization?.fortification;
  return {
    mediterranean: (!!faith && MEDITERRANEAN_FAITH.has(faith)) || fort === "islamic" || fort === "classical",
    eastAsian: (!!faith && EAST_ASIAN_FAITH.has(faith)) || fort === "japanese" || fort === "sinitic"
  };
}

function nonResidentialStoreys(lot: BuildingLot, maximum: number): number {
  const role = lot.role;
  const archetype = lot.archetype;
  let storeys = 2;
  if (role === "shed" || role === "stable") storeys = 1;
  else if (role === "workshop") storeys = 2;
  else if (role === "store" || archetype === "warehouse-compound" || archetype === "port-workyard") storeys = 3;
  return Math.max(1, Math.min(maximum, storeys));
}

/** Storeys the capacity formula already uses. Does not invent a second number. */
function resolveStoreys(document: CityDocument, lot: BuildingLot): { storeys: number; write: boolean } {
  if (typeof lot.storeys === "number" && Number.isFinite(lot.storeys) && lot.storeys >= 1)
    return { storeys: Math.floor(lot.storeys), write: false };
  if (isResidentialBuilding(lot)) return { storeys: 1, write: false };
  return { storeys: nonResidentialStoreys(lot, residentialStoreys(periodOf(document)).maximum), write: true };
}

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

function wallMaterial(
  document: CityDocument,
  lot: BuildingLot,
  period: string,
  climate: { arid: boolean; forest: boolean },
  tradition: { mediterranean: boolean; eastAsian: boolean }
): WallMaterial {
  const rich = lot.archetype === "patrician-house" || lot.archetype === "elite-compound";
  const fort: FortificationFamily | undefined = document.civilization?.fortification;
  if (climate.arid && !rich) return "mudbrick";
  if (rich || ANTIQUITY.has(period) || fort === "classical") return "stone";
  if (tradition.eastAsian) return "timber-frame";
  if (tradition.mediterranean) return periodIndex(period) >= periodIndex("lateMedieval") ? "plaster" : "stone";
  if (MEDIEVAL.has(period)) return "timber-frame";
  if (climate.forest) return "timber-frame";
  return "brick";
}

function roofMaterial(
  wall: WallMaterial,
  period: string,
  tradition: { mediterranean: boolean; eastAsian: boolean }
): RoofMaterial {
  if (wall === "mudbrick") return "turf";
  if (tradition.mediterranean || ANTIQUITY.has(period) || tradition.eastAsian) return "tile";
  if (wall === "timber-frame" && MEDIEVAL.has(period)) return "thatch";
  if (wall === "timber-frame") return "shingle";
  if (periodIndex(period) >= periodIndex("lateMedieval") && !tradition.mediterranean) return "slate";
  return "tile";
}

function isConvex(poly: Point[]): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const c = poly[(i + 2) % poly.length];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cross) < 1e-6) continue;
    const next = Math.sign(cross);
    if (sign && next !== sign) return false;
    sign = next;
  }
  return poly.length >= 3;
}

/** Minimum-area edge-aligned bounds avoid treating a tiny bevel as the frontage. */
function roofBounds(poly: Point[]): { azimuth: number; length: number; width: number } {
  let bestArea = Infinity;
  let best = { azimuth: 0, length: 0, width: 0 };
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const edge = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (edge < 1e-6) continue;
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    let uMin = Infinity,
      uMax = -Infinity,
      vMin = Infinity,
      vMax = -Infinity;
    for (const point of poly) {
      const x = point[0] - a[0];
      const y = point[1] - a[1];
      const u = x * c + y * s;
      const v = -x * s + y * c;
      uMin = Math.min(uMin, u);
      uMax = Math.max(uMax, u);
      vMin = Math.min(vMin, v);
      vMax = Math.max(vMax, v);
    }
    const u = uMax - uMin;
    const v = vMax - vMin;
    if (u * v >= bestArea) continue;
    bestArea = u * v;
    best = { azimuth: angle + (v > u ? Math.PI / 2 : 0), length: Math.max(u, v), width: Math.min(u, v) };
  }
  return best;
}

function wrapAzimuth(radians: number): number {
  const turns = (radians + Math.PI) / (Math.PI * 2);
  return (turns - Math.floor(turns)) * Math.PI * 2 - Math.PI;
}

function roofForm(
  lot: BuildingLot,
  wall: WallMaterial,
  period: string,
  storeys: number,
  convex: boolean,
  aspect: number
): RoofForm {
  if (!convex || lot.polygon.length === 3) return "flat";
  if (lot.role === "shed" || lot.role === "stable") return "lean-to";
  if (wall === "mudbrick" || (ANTIQUITY.has(period) && storeys >= 4)) return "flat";
  return aspect >= 1.45 ? "gable" : "hip";
}

/**
 * Attach `massing` to every drawable lot. Residential capacity is unchanged:
 * an existing `storeys` is kept, and a missing one is written only for non-residential lots.
 */
export function assignBuildingMassing(document: CityDocument, lots: readonly BuildingLot[]): BuildingLot[] {
  const period = periodOf(document);
  const climate = climateOf(document);
  const tradition = traditionOf(document);
  const seed = document.generationSeed || document.fabric?.seed || "massing";
  return lots.map(lot => {
    if (lot.landmark || lot.polygon.length < 3) return lot;
    const { storeys, write } = resolveStoreys(document, lot);
    const uses = floorUses(lot, storeys);
    const floors = floorSpecs(uses, period);
    const wall = wallMaterial(document, lot, period, climate, tradition);
    const convex = isConvex(lot.polygon);
    const bounds = roofBounds(lot.polygon);
    const aspect = bounds.width > 0 ? bounds.length / bounds.width : 1;
    const form = roofForm(lot, wall, period, storeys, convex, aspect);
    const material = roofMaterial(wall, period, tradition);
    const medievalTimber = wall === "timber-frame" && MEDIEVAL.has(period) && convex && form !== "flat";
    const jetty = medievalTimber ? 0.4 : 0;
    // Ordinary roofs should not become monumental structures on oversized lots.
    // Include upper-floor offsets in the run used by the mesh builder.
    const offset = Math.min(1.2, (storeys - 1) * jetty);
    const run = (bounds.width + 2 * offset) / (form === "lean-to" ? 1 : 2);
    const pitch = Math.min(ROOF_PITCH[material], (Math.atan2(4, run) * 180) / Math.PI);
    const next: BuildingLot = write ? { ...lot, storeys } : { ...lot };
    next.massing = {
      storeys,
      floors,
      cellar: false,
      jettyMeters: jetty,
      eaveHeightMeters: floors.reduce((sum, floor) => sum + floor.heightMeters, 0),
      roof: {
        form,
        pitchDeg: form === "flat" ? 2 : pitch,
        ridgeAzimuth: wrapAzimuth(bounds.azimuth),
        material
      },
      wall,
      baseElevationMeters: 0,
      // Editing another district must not change this lot's color.
      tint: growthRandom(`${seed}:massing:${lot.id ?? `${lot.faceId}:${JSON.stringify(lot.polygon)}`}:tint`)
    };
    return next;
  });
}
