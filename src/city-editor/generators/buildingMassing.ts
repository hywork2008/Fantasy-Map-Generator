import type { FaithFamily, FortificationFamily } from "../../data/civilizationTraditions";
import { periodIndex } from "../../data/civilizationTraditions";
import { growthRandom, residentialStoreys } from "../../utils/urbanMorphology";
import type {
  BuildingMassing,
  FloorSpec,
  RoofForm,
  RoofMaterial,
  WallMaterial
} from "../types/contracts/buildingMassing";
import type { CityDocument } from "../types/document";
import type { Point } from "../types/primitives";
import { buildingFloorSpecs } from "./buildingFloors";
import { applyBuildingHeightLimits, effectiveHeightLimit } from "./buildingHeightLimits";
import { hasBuildingHeightVariation } from "./buildingHeightPolicy";
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

/** What the massing rules read about the town: no cells, so a meshless city supplies the same values. */
export interface MassingSource {
  period: string;
  biome?: { key?: string; name?: string; tags?: readonly string[] } | null;
  civilization?: { faith?: FaithFamily | null; fortification?: FortificationFamily | null } | null;
  seed: string;
}
export interface MassingContext {
  period: string;
  climate: { arid: boolean; forest: boolean };
  tradition: { mediterranean: boolean; eastAsian: boolean };
  fortification?: FortificationFamily;
  seed: string;
}
export function massingContext(source: MassingSource): MassingContext {
  return {
    period: source.period,
    climate: climateOf(source.biome),
    tradition: traditionOf(source.civilization),
    fortification: source.civilization?.fortification ?? undefined,
    seed: source.seed
  };
}

function biomeText(biome: MassingSource["biome"]): string {
  return `${biome?.key ?? ""} ${biome?.name ?? ""} ${(biome?.tags ?? []).join(" ")}`.toLowerCase();
}

function climateOf(biome: MassingSource["biome"]): { arid: boolean; forest: boolean } {
  const text = biomeText(biome);
  return {
    arid: /desert|arid|steppe/.test(text),
    forest: /forest|taiga|jungle|woodland/.test(text)
  };
}

function traditionOf(civilization: MassingSource["civilization"]): { mediterranean: boolean; eastAsian: boolean } {
  const faith = civilization?.faith;
  const fort = civilization?.fortification;
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

function wallMaterial(
  fort: FortificationFamily | undefined,
  lot: Pick<BuildingLot, "archetype">,
  period: string,
  climate: { arid: boolean; forest: boolean },
  tradition: { mediterranean: boolean; eastAsian: boolean }
): WallMaterial {
  const rich = lot.archetype === "patrician-house" || lot.archetype === "elite-compound";
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
  lot: Pick<BuildingLot, "polygon" | "role">,
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
 * Walls, roof and colour of one lot from the town context, its floors and the height limit over it. The tint
 * key keeps a lot's colour when another district is edited.
 */
export function lotMassing(
  context: MassingContext,
  lot: Pick<BuildingLot, "polygon" | "role" | "archetype">,
  storeys: number,
  floors: FloorSpec[],
  maxHeightMeters: number | undefined,
  tintKey: string
): BuildingMassing {
  const { period, climate, tradition, seed } = context;
  const wall = wallMaterial(context.fortification, lot, period, climate, tradition);
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
  const roofRise = Math.min(
    4,
    maxHeightMeters === undefined
      ? 4
      : Math.max(0, maxHeightMeters - floors.reduce((sum, floor) => sum + floor.heightMeters, 0))
  );
  const pitch = Math.min(ROOF_PITCH[material], (Math.atan2(roofRise, run) * 180) / Math.PI);
  return {
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
    tint: growthRandom(`${seed}:massing:${tintKey}:tint`)
  };
}

/**
 * Attach `massing` to every drawable lot. Residential capacity is unchanged:
 * an existing `storeys` is kept, and a missing one is written only for non-residential lots.
 */
export function assignBuildingMassing(document: CityDocument, lots: readonly BuildingLot[]): BuildingLot[] {
  const context = massingContext({
    period: periodOf(document),
    biome: document.biome,
    civilization: document.civilization,
    seed: document.generationSeed || document.fabric?.seed || "massing"
  });
  return applyBuildingHeightLimits(document, lots, hasBuildingHeightVariation(document))
    .filter(lot => lot.landmark || lot.storeys !== 0)
    .map(lot => {
      if (lot.landmark || lot.polygon.length < 3) return lot;
      const { storeys, write } = resolveStoreys(document, lot);
      const floors = buildingFloorSpecs(
        document,
        lot,
        storeys,
        hasBuildingHeightVariation(document) && (isResidentialBuilding(lot) || !!lot.residentialCluster)
      );
      const next: BuildingLot = write ? { ...lot, storeys } : { ...lot };
      next.massing = lotMassing(
        context,
        lot,
        storeys,
        floors,
        effectiveHeightLimit(document, lot.faceId).maxHeightMeters,
        lot.id ?? `${lot.faceId}:${JSON.stringify(lot.polygon)}`
      );
      return next;
    });
}
