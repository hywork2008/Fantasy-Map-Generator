// City Generator export import.
//
// The export intentionally contains the exact pipeline inputs in
// `settings.resolved`. Validate that small, executable portion of the JSON
// before it reaches generateCity; the human-readable digest is never trusted.

import type { CityGeography, CityParams, CityProgram, Point, WallPlan } from "../core/types";
import { CITY_EXPORT_KIND, CITY_EXPORT_VERSION, type CityExport } from "./cityExport";
import { parseDescriptor } from "./incomingSite";

/** Parse and validate a JSON file previously written by `buildCityExport`. */
export function parseCityExport(json: string): CityExport | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isRecord(raw) || raw.kind !== CITY_EXPORT_KIND || raw.exportVersion !== CITY_EXPORT_VERSION) return null;
  if (!isRecord(raw.settings) || !isMode(raw.settings.mode) || typeof raw.settings.seed !== "string") return null;

  // Reuse the descriptor gate used for world-map hand-offs, keeping the two
  // persisted formats compatible as the descriptor contract evolves.
  const descriptor = parseDescriptor(JSON.stringify(raw.settings.descriptor));
  if (!descriptor || !isRecord(raw.settings.resolved)) return null;
  const params = parseParams(raw.settings.resolved.params);
  const geography = parseGeography(raw.settings.resolved.geography);
  const program = parseProgram(raw.settings.resolved.program);
  if (!params || !geography || !program || params.seed !== raw.settings.seed) return null;

  if (raw.settings.mode === "standalone") {
    if (
      !isRecord(raw.settings.preset) ||
      typeof raw.settings.preset.id !== "string" ||
      !isSiteConfig(raw.settings.siteConfig)
    ) {
      return null;
    }
  }

  // Rebuild the parts of the typed envelope that the page uses. The digest is
  // preserved only for a subsequent export; it is not used to draw the city.
  return {
    ...(raw as unknown as CityExport),
    settings: {
      ...(raw.settings as unknown as CityExport["settings"]),
      descriptor,
      resolved: { params, geography, program }
    }
  };
}

function parseParams(value: unknown): CityParams | null {
  if (!isRecord(value)) return null;
  const { seed, extentMeters, cityRadiusMeters, cellSizeMeters, lloydPasses } = value;
  if (
    typeof seed !== "string" ||
    !positive(extentMeters) ||
    !positive(cityRadiusMeters) ||
    !positive(cellSizeMeters) ||
    !nonNegativeInteger(lloydPasses)
  ) {
    return null;
  }
  return { seed, extentMeters, cityRadiusMeters, cellSizeMeters, lloydPasses };
}

function parseGeography(value: unknown): CityGeography | null {
  if (!isRecord(value) || !Array.isArray(value.rivers) || !numberArray(value.roadBearings)) return null;
  const coast =
    value.coast === null
      ? null
      : isRecord(value.coast) && pointArray(value.coast.corridor) && finite(value.coast.waterAzimuthDeg)
        ? { corridor: value.coast.corridor, waterAzimuthDeg: value.coast.waterAzimuthDeg }
        : undefined;
  if (coast === undefined) return null;

  const rivers = [] as CityGeography["rivers"];
  for (const river of value.rivers) {
    if (!isRecord(river) || !pointArray(river.corridor) || !numberArray(river.widths) || !isBank(river.cityBank))
      return null;
    if (
      river.corridor.length < 2 ||
      river.widths.length !== river.corridor.length ||
      river.widths.some(n => !positive(n))
    )
      return null;
    rivers.push({ corridor: river.corridor, widths: river.widths, cityBank: river.cityBank });
  }

  const geography: CityGeography = { coast, rivers, roadBearings: value.roadBearings };
  if (value.roadPaths !== undefined) {
    if (!Array.isArray(value.roadPaths) || !value.roadPaths.every(pointArray)) return null;
    geography.roadPaths = value.roadPaths;
  }
  if (value.suggestedGates !== undefined) {
    if (!nonNegativeInteger(value.suggestedGates)) return null;
    geography.suggestedGates = value.suggestedGates;
  }
  return geography;
}

function parseProgram(value: unknown): CityProgram | null {
  if (!isRecord(value)) return null;
  const flags = ["walls", "citadel", "plaza", "temple", "port", "shanty", "capital"] as const;
  if (!flags.every(key => typeof value[key] === "boolean")) return null;
  const program: CityProgram = {
    walls: value.walls as boolean,
    citadel: value.citadel as boolean,
    plaza: value.plaza as boolean,
    temple: value.temple as boolean,
    port: value.port as boolean,
    shanty: value.shanty as boolean,
    capital: value.capital as boolean
  };
  if (value.wallPlan !== undefined) {
    const wallPlan = parseWallPlan(value.wallPlan);
    if (!wallPlan) return null;
    program.wallPlan = wallPlan;
  }
  return program;
}

function parseWallPlan(value: unknown): WallPlan | null {
  if (!isRecord(value)) return null;
  if (
    !oneOf(value.envelope, ["hull", "notchFilled", "sectorPolygon", "denseCore", "expanded"]) ||
    !oneOf(value.coast, ["open", "quayWall", "seaWall", "harborBasin", "setBack"]) ||
    !oneOf(value.line, ["organic", "polygonal", "geometric"]) ||
    !oneOf(value.extent, ["full", "landwardOnly", "rampart", "none"]) ||
    !positive(value.notchDepth) ||
    typeof value.moatOnLand !== "boolean"
  ) {
    return null;
  }
  return {
    envelope: value.envelope as WallPlan["envelope"],
    coast: value.coast as WallPlan["coast"],
    line: value.line as WallPlan["line"],
    extent: value.extent as WallPlan["extent"],
    notchDepth: value.notchDepth as number,
    moatOnLand: value.moatOnLand as boolean
  };
}

function isSiteConfig(value: unknown): boolean {
  // Its exact contents are used only when the user exports again. Require the
  // stable shape instead of accepting arbitrary JSON in the typed envelope.
  if (!isRecord(value) || !isRecord(value.features) || !isRecord(value.wall)) return false;
  const features = value.features;
  const wall = value.wall;
  return (
    oneOf(value.coast, ["none", "straight", "bay", "cape"]) &&
    Array.isArray(value.rivers) &&
    value.rivers.every(v => oneOf(v, ["through", "beside", "toCoast", "straight", "meander", "greatBend"])) &&
    typeof value.relief === "boolean" &&
    ["walls", "citadel", "plaza", "temple", "port", "shanty"].every(key => typeof features[key] === "boolean") &&
    oneOf(wall.envelope, ["auto", "hull", "notchFilled"]) &&
    oneOf(wall.coast, ["auto", "open", "seaWall"]) &&
    oneOf(wall.line, ["auto", "polygonal", "organic"])
  );
}

function pointArray(value: unknown): value is Point[] {
  return (
    Array.isArray(value) &&
    value.every(point => Array.isArray(point) && point.length === 2 && finite(point[0]) && finite(point[1]))
  );
}

function numberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(finite);
}

function isMode(value: unknown): value is "standalone" | "imported" {
  return value === "standalone" || value === "imported";
}

function isBank(value: unknown): value is "left" | "right" {
  return value === "left" || value === "right";
}

function oneOf(value: unknown, options: readonly string[]): boolean {
  return typeof value === "string" && options.includes(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function positive(value: unknown): value is number {
  return finite(value) && value > 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return finite(value) && Number.isInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
