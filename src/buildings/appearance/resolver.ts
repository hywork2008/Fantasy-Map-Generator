import type { RoofMaterial, WallMaterial } from "../../city-editor/types/contracts/buildingMassing";
import { growthRandom } from "../../utils/urbanMorphology";
import type { BuildingPaletteId } from "./palette";
import {
  BUILDING_APPEARANCE_CLIMATES,
  BUILDING_APPEARANCE_PROFILES,
  BUILDING_APPEARANCE_VERSION,
  type BuildingAppearance,
  type BuildingAppearanceContext,
  type BuildingAppearanceProfile
} from "./types";

export interface BuildingAppearanceSource {
  period?: string;
  tradition?: string;
  temperatureC?: number;
  biome?: { key?: string; tags?: readonly string[] };
}

/** Display names and religion deliberately do not participate in climate or region selection. */
export function normalizeBuildingAppearanceContext(source: BuildingAppearanceSource): BuildingAppearanceContext {
  const tags = [source.biome?.key ?? "", ...(source.biome?.tags ?? [])].join(" ").toLowerCase();
  return {
    period: source.period || "ageOfExploration",
    ...(source.tradition ? { tradition: source.tradition } : {}),
    ...(Number.isFinite(source.temperatureC) ? { temperatureC: source.temperatureC } : {}),
    forest: /forest|taiga|woodland/.test(tags),
    arid: /desert|arid|steppe/.test(tags),
    wetland: /wetland|marsh|swamp/.test(tags)
  };
}

export function validBuildingAppearanceFields(value: {
  buildingAppearanceVersion?: unknown;
  buildingAppearanceProfile?: unknown;
  buildingAppearanceClimate?: unknown;
  buildingAppearanceContext?: unknown;
}): boolean {
  const version = value.buildingAppearanceVersion;
  const profile = value.buildingAppearanceProfile;
  const context = value.buildingAppearanceContext;
  if (
    value.buildingAppearanceClimate !== undefined &&
    !BUILDING_APPEARANCE_CLIMATES.includes(
      value.buildingAppearanceClimate as (typeof BUILDING_APPEARANCE_CLIMATES)[number]
    )
  )
    return false;
  if (version !== undefined && version !== BUILDING_APPEARANCE_VERSION) return false;
  if (profile !== undefined && !BUILDING_APPEARANCE_PROFILES.includes(profile as BuildingAppearanceProfile))
    return false;
  if (context === undefined) return true;
  if (!context || typeof context !== "object" || Array.isArray(context)) return false;
  const c = context as Partial<BuildingAppearanceContext>;
  return (
    typeof c.period === "string" &&
    c.period.length > 0 &&
    (c.tradition === undefined || typeof c.tradition === "string") &&
    (c.temperatureC === undefined || (typeof c.temperatureC === "number" && Number.isFinite(c.temperatureC))) &&
    typeof c.forest === "boolean" &&
    typeof c.arid === "boolean" &&
    typeof c.wetland === "boolean"
  );
}

const TRADITION_PROFILE: Readonly<Record<string, BuildingAppearanceProfile>> = {
  latinMediterranean: "mediterranean",
  roman: "mediterranean",
  hellenic: "mediterranean",
  latinWest: "atlantic",
  gallic: "atlantic",
  anglo: "atlantic",
  insularCeltic: "atlantic",
  basque: "atlantic",
  magyar: "atlantic",
  norse: "northern-wooded",
  finnic: "northern-wooded",
  ruthenian: "northern-wooded"
};

export interface BuildingAppearanceInput {
  version?: number;
  profile?: BuildingAppearanceProfile;
  context: BuildingAppearanceContext;
  seed: string;
  stableLotId: string;
  blockId: string;
  rural: boolean;
  rich: boolean;
  wall: WallMaterial;
  roof: RoofMaterial;
}

export function buildingAppearanceProfile(
  input: Pick<BuildingAppearanceInput, "profile" | "context" | "rural">
): BuildingAppearanceProfile {
  const tradition = input.context.tradition ?? "";
  const profile =
    input.profile ?? (Object.hasOwn(TRADITION_PROFILE, tradition) ? TRADITION_PROFILE[tradition] : "legacy");
  return !input.profile && profile === "northern-wooded" && !input.rural ? "northern-urban" : profile;
}

/** Regional roof coverings on the existing mesh; never changes its pitch or dimensions. */
export function regionalRoofMaterial(input: BuildingAppearanceInput, pitchDeg: number): RoofMaterial {
  if (input.version !== BUILDING_APPEARANCE_VERSION) return input.roof;
  if (
    !["earlyMedieval", "highMedieval", "lateMedieval", "ageOfExploration", "maritimeEra", "preIndustrialEra"].includes(
      input.context.period
    )
  )
    return input.roof;
  const profile = buildingAppearanceProfile(input);
  if (profile === "legacy" || pitchDeg < 10) return input.roof;
  const roll = growthRandom(`${input.seed}:building-appearance:${input.version}:lot:${input.stableLotId}:roof`);
  let roof: RoofMaterial = input.roof;
  if (profile === "mediterranean") roof = "tile";
  else if (profile === "stone-upland") roof = "slate";
  else if (profile === "northern-urban") roof = roll < 0.75 ? "tile" : "shingle";
  else if (profile === "northern-wooded") {
    roof = input.context.forest
      ? roll < 0.55
        ? "shingle"
        : roll < 0.9
          ? "thatch"
          : "turf"
      : roll < 0.7
        ? "thatch"
        : "tile";
  } else if (profile === "atlantic") roof = input.rich && roll < 0.35 ? "slate" : roll < 0.55 ? "tile" : "thatch";
  if (roof === "thatch" && pitchDeg < 40) roof = input.context.forest && pitchDeg >= 25 ? "shingle" : "tile";
  if (roof === "turf" && (pitchDeg < 20 || pitchDeg > 33)) roof = "shingle";
  return roof;
}

/** Resolve surface colors only. Material, roof pitch, height and capacity are never modified. */
export function resolveBuildingAppearance(input: BuildingAppearanceInput): BuildingAppearance | undefined {
  if (input.version !== BUILDING_APPEARANCE_VERSION) return undefined;
  const profileId = buildingAppearanceProfile(input);
  const legacy = profileId === "legacy";
  const northern = profileId === "northern-wooded" || profileId === "northern-urban";
  const mediterranean = profileId === "mediterranean";
  const stone = profileId === "stone-upland";
  const roofPalettes: Record<RoofMaterial, BuildingPaletteId> = {
    tile: mediterranean ? "terracotta" : northern ? "urban-tile" : "atlantic-tile",
    thatch: input.context.wetland || northern ? "reed" : "straw",
    shingle: "shingle",
    slate: stone ? "local-stone-roof" : "slate",
    lead: "lead",
    turf: "turf"
  };
  const boarding =
    input.wall === "timber-frame" && northern && input.rural && input.context.forest && !input.context.arid;
  const finishes: Record<WallMaterial, BuildingAppearance["wallFinish"]> = {
    "timber-frame": boarding ? "timber-boarding" : mediterranean ? "limewash" : "plaster-infill",
    stone: "stone",
    brick: "brick",
    mudbrick: "earth",
    wattle: "earth",
    plaster: "limewash"
  };
  const walls: Record<WallMaterial, BuildingPaletteId> = {
    "timber-frame": boarding ? "timber" : mediterranean ? "limewash" : "plaster",
    stone: stone ? "upland-stone" : mediterranean ? "limestone" : "rubble",
    brick: "brick",
    mudbrick: "earth",
    wattle: "earth",
    plaster: mediterranean || input.rich ? "limewash" : "plaster"
  };
  const salt = `${input.seed}:building-appearance:${input.version}`;
  const blockShade = Math.floor(growthRandom(`${salt}:block:${input.blockId}`) * 3);
  const drift = Math.floor(growthRandom(`${salt}:lot:${input.stableLotId}:shade`) * 3) - 1;
  return {
    version: BUILDING_APPEARANCE_VERSION,
    profileId,
    roofPaletteId: legacy ? `legacy-${input.roof}` : roofPalettes[input.roof],
    wallPaletteId: legacy ? `legacy-${input.wall}` : walls[input.wall],
    ...(!legacy && input.wall === "timber-frame" && !boarding && !mediterranean
      ? { framePaletteId: northern ? ("northern-frame" as const) : ("frame" as const) }
      : {}),
    shadeBin: Math.max(0, Math.min(2, blockShade + drift)) as 0 | 1 | 2,
    wallFinish: legacy ? "legacy" : finishes[input.wall]
  };
}
