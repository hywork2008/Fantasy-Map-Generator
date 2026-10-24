// Wearing course of a road, shared by CE, FMG, and a future RE adapter.
// Historical period, culture sphere, and means decide the surface at draw time.
// DOM, three.js, city-editor, and region-editor stay out of this module.

import { type HistoricalPeriod, historicalPeriodIndex } from "../types/historicalPeriod";

export const ROAD_SURFACE_IDS = ["track", "earth", "gravel", "corduroy", "setts", "flags", "macadam"] as const;
export type RoadSurfaceId = (typeof ROAD_SURFACE_IDS)[number];

export type RoadPlace = "trail" | "highway" | "arterial" | "street" | "civic";
export type RoadSphere =
  | "classical"
  | "latin"
  | "islamic"
  | "sinitic"
  | "japanese"
  | "indic"
  | "andean"
  | "mesoamerican"
  | "westAfrican"
  | "steppe"
  | "oceanic"
  | "earthwork";

/** "unknown" does not cap. "absent" forbids gravel, setts, flags, and macadam. */
export type StoneRoadKnowledge = "unknown" | "ready" | "absent";

export type RoadMeans = "poor" | "middling" | "rich";

export interface RoadSurfaceQuery {
  period: HistoricalPeriod;
  sphere: RoadSphere;
  means: RoadMeans;
  place: RoadPlace;
  /** FMG group. CE lanes that are not an imported route use "local". */
  group: "roads" | "trails" | "local";
  wetland: boolean;
  /** Mountain, snow, or a montane key. Japanese passes and Andean paving. */
  upland: boolean;
  /** hotDesert, coldDesert, or the desert tag. Andean coast stays earth. */
  dry: boolean;
  stoneRoads: StoneRoadKnowledge;
}

export interface RoadSurfaceDecision {
  id: RoadSurfaceId;
  maintainer: "state" | "town" | "frontager" | "toll" | "corvee" | "none";
}

/** Far-camera read, close-up pair, and joint colour. Land is 0xd5cfbf. */
export interface RoadSurfaceColor {
  base: number;
  close?: readonly [number, number];
  joint?: number;
}

export const ROAD_SURFACE_COLOR: Record<RoadSurfaceId, RoadSurfaceColor> = {
  track: { base: 0x6e5838 },
  earth: { base: 0x8d6a3d },
  gravel: { base: 0xa8926a, close: [0x7a6a48, 0xc4b48a] },
  setts: { base: 0x7d7a74, joint: 0x3e3c38 },
  flags: { base: 0xb7b1a4, joint: 0x5c5952 },
  macadam: { base: 0x4e4c49 },
  corduroy: { base: 0x5c3b22, close: [0x5c3b22, 0x8a6240] }
};

/**
 * Tradition id to sphere. Classical traditions are stored as "classical";
 * `roadSphere` keeps that only through late antiquity and then uses latin.
 * Turkic and the fantastic traditions are resolved in `roadSphere`, not here.
 */
export const ROAD_SPHERE_BY_TRADITION: Readonly<Record<string, RoadSphere>> = {
  roman: "classical",
  hellenic: "classical",
  latinMediterranean: "classical",
  latinWest: "latin",
  gallic: "latin",
  anglo: "latin",
  norse: "latin",
  finnic: "latin",
  magyar: "latin",
  ruthenian: "latin",
  insularCeltic: "latin",
  basque: "latin",
  maghrebi: "islamic",
  arab: "islamic",
  persian: "islamic",
  swahili: "islamic",
  levantine: "islamic",
  sinitic: "sinitic",
  korean: "sinitic",
  vietnamese: "sinitic",
  japanese: "japanese",
  indic: "indic",
  andean: "andean",
  nahua: "mesoamerican",
  westAfrican: "westAfrican",
  mongol: "steppe",
  polynesian: "oceanic",
  arctic: "oceanic",
  mesopotamian: "earthwork"
};

const CLASSICAL_TRADITIONS = new Set(["roman", "hellenic", "latinMediterranean"]);
const FANTASTIC_TRADITIONS = new Set([
  "elven",
  "darkElven",
  "dwarven",
  "giant",
  "draconic",
  "tribal",
  "arachnid",
  "serpent",
  "infernal"
]);

const LADDER: readonly RoadSurfaceId[] = ["track", "earth", "gravel", "setts", "flags"];
const STONE_OR_MACADAM = new Set<RoadSurfaceId>(["gravel", "setts", "flags", "macadam"]);
const CORVEE_SPHERES = new Set<RoadSphere>(["sinitic", "japanese", "andean", "indic"]);

/** One ribbon of wearing course. Plan metres, independent of the CE point type. */
/** Who must climb a road: wheeled carts, people and pack animals in town lanes, or walkers on a path. */
export type RoadGradeClass = "cart" | "lane" | "path";

export interface RoadRibbon {
  centerline: readonly (readonly [number, number])[];
  widthMeters: number;
  surface: RoadSurfaceId;
  /** Absent reads as "cart". Bounds the longitudinal grade when roads are graded into relief. */
  gradeClass?: RoadGradeClass;
  /** A ramp deck that may pass between levels a cliff separates. */
  connectsLevels?: true;
}

type Band = "antiquity" | "early" | "high" | "late" | "industrial";

interface SurfaceRow {
  highway: RoadSurfaceId;
  arterial: RoadSurfaceId;
  street: RoadSurfaceId;
  /** Civic is one ladder step above arterial, then clamped to this. */
  ceiling: RoadSurfaceId;
}

export function roadMeans(input: {
  population: number;
  commerceRank: number | null;
  capital: boolean;
  marketCenter: boolean;
}): RoadMeans {
  const rank = input.commerceRank ?? 0;
  if (input.capital || input.population >= 8000 || rank >= 0.66) return "rich";
  if (input.population >= 2000 || input.marketCenter || rank >= 0.35) return "middling";
  return "poor";
}

export function roadSphere(
  tradition: string | null,
  fortification: string | null,
  faith: string | null,
  period: HistoricalPeriod
): RoadSphere {
  if (tradition && CLASSICAL_TRADITIONS.has(tradition)) return antiquity(period) ? "classical" : "latin";
  if (tradition && tradition in ROAD_SPHERE_BY_TRADITION) return ROAD_SPHERE_BY_TRADITION[tradition];
  if (tradition === "turkic") return faith === "sunni" || faith === "shia" ? "islamic" : "steppe";
  if (!tradition || FANTASTIC_TRADITIONS.has(tradition)) return sphereFromFortification(fortification, period);
  return "earthwork";
}

export function classifyRoadSurface(query: RoadSurfaceQuery): RoadSurfaceDecision {
  if (query.group === "trails" || query.place === "trail") {
    return { id: query.wetland ? "corduroy" : "track", maintainer: "none" };
  }
  const sphere = tableSphere(query.sphere, query.period);
  let id = surfaceId(query, sphere);
  if (query.stoneRoads === "absent" && STONE_OR_MACADAM.has(id)) id = "earth";
  if (query.wetland && query.means === "poor" && id === "earth") id = "corduroy";
  return { id, maintainer: maintainerOf(id, query.place, sphere, query.period) };
}

/** Whole-route helper. Railways and sea routes return null. */
export function classifyRouteSurface(input: {
  period: HistoricalPeriod;
  tradition: string | null;
  fortification: string | null;
  faith: string | null;
  population: number;
  commerceRank: number | null;
  capital: boolean;
  marketCenter: boolean;
  group: string;
  wetland: boolean;
  upland: boolean;
  dry: boolean;
  stoneRoads: StoneRoadKnowledge;
  /** Used only when it is a member of ROAD_SURFACE_IDS. Generators must not write it. */
  override?: string | null;
}): RoadSurfaceDecision | null {
  if (input.group !== "roads" && input.group !== "trails") return null;
  if (input.override && (ROAD_SURFACE_IDS as readonly string[]).includes(input.override)) {
    return { id: input.override as RoadSurfaceId, maintainer: "state" };
  }
  return classifyRoadSurface({
    period: input.period,
    sphere: roadSphere(input.tradition, input.fortification, input.faith, input.period),
    means: roadMeans(input),
    place: input.group === "trails" ? "trail" : "highway",
    group: input.group,
    wetland: input.wetland,
    upland: input.upland,
    dry: input.dry,
    stoneRoads: input.stoneRoads
  });
}

function surfaceId(query: RoadSurfaceQuery, sphere: RoadSphere): RoadSurfaceId {
  const row = rowFor(query, sphere);
  if (query.place === "civic") return clampToCeiling(raiseOne(row.arterial), row.ceiling);
  if (query.place === "highway") return row.highway;
  if (query.place === "street") return row.street;
  return row.arterial;
}

function rowFor(query: RoadSurfaceQuery, sphere: RoadSphere): SurfaceRow {
  const band = periodBand(query.period);
  if (sphere === "classical") return classicalRow(query.period, query.means);
  if (sphere === "latin" || sphere === "islamic") return latinLike(band, query.means, sphere === "islamic");
  if (sphere === "sinitic") return siniticRow(band, query.means);
  if (sphere === "japanese") return japaneseRow(band, query.means, query.upland);
  if (sphere === "indic") return indicRow(band, query.means);
  if (sphere === "andean") return andeanRow(band, query.means, query.upland, query.dry);
  if (sphere === "westAfrican") return westAfricanRow(query.means);
  return earthworkRow(band, query.means);
}

function latinLike(band: Band, means: RoadMeans, islamic: boolean): SurfaceRow {
  const row = latinRow(band, means);
  if (islamic && (row.arterial === "setts" || row.arterial === "flags")) row.arterial = "gravel";
  return row;
}

function latinRow(band: Band, means: RoadMeans): SurfaceRow {
  if (band === "antiquity" || band === "early") return flat("earth");
  if (band === "high") {
    if (means === "poor") return flat("earth");
    if (means === "middling") return { highway: "earth", arterial: "earth", street: "earth", ceiling: "gravel" };
    return { highway: "earth", arterial: "gravel", street: "earth", ceiling: "setts" };
  }
  if (band === "late") {
    if (means === "poor") return { highway: "earth", arterial: "earth", street: "earth", ceiling: "gravel" };
    if (means === "middling") return { highway: "gravel", arterial: "gravel", street: "earth", ceiling: "setts" };
    return { highway: "gravel", arterial: "setts", street: "earth", ceiling: "setts" };
  }
  if (means === "poor") return { highway: "earth", arterial: "earth", street: "earth", ceiling: "gravel" };
  if (means === "middling") return { highway: "macadam", arterial: "gravel", street: "earth", ceiling: "setts" };
  return { highway: "macadam", arterial: "setts", street: "earth", ceiling: "setts" };
}

function classicalRow(period: HistoricalPeriod, means: RoadMeans): SurfaceRow {
  if (period === "classicalAntiquity") {
    if (means === "poor") return { highway: "earth", arterial: "gravel", street: "earth", ceiling: "setts" };
    if (means === "middling") return { highway: "gravel", arterial: "setts", street: "gravel", ceiling: "setts" };
    return { highway: "gravel", arterial: "setts", street: "setts", ceiling: "flags" };
  }
  if (means === "rich") return { highway: "gravel", arterial: "setts", street: "gravel", ceiling: "flags" };
  return { highway: "earth", arterial: "gravel", street: "earth", ceiling: "setts" };
}

function siniticRow(band: Band, means: RoadMeans): SurfaceRow {
  const highway: RoadSurfaceId = band === "industrial" && means !== "poor" ? "macadam" : "earth";
  return { highway, arterial: "earth", street: "earth", ceiling: means === "rich" ? "gravel" : "earth" };
}

function japaneseRow(band: Band, means: RoadMeans, upland: boolean): SurfaceRow {
  let highway: RoadSurfaceId = "earth";
  if (upland) highway = "setts";
  else if (band === "industrial" && means !== "poor") highway = "macadam";
  return { highway, arterial: "earth", street: "earth", ceiling: means === "rich" ? "gravel" : "earth" };
}

function indicRow(band: Band, means: RoadMeans): SurfaceRow {
  const highway: RoadSurfaceId = band === "industrial" && means !== "poor" ? "macadam" : "earth";
  const arterial: RoadSurfaceId = means === "rich" ? "gravel" : "earth";
  return { highway, arterial, street: "earth", ceiling: means === "poor" ? "earth" : "gravel" };
}

function andeanRow(band: Band, means: RoadMeans, upland: boolean, dry: boolean): SurfaceRow {
  let highway: RoadSurfaceId = "earth";
  let arterial: RoadSurfaceId = "earth";
  if (!dry && upland) {
    highway = "setts";
    arterial = "setts";
  }
  if (band === "industrial" && means !== "poor" && highway !== "setts") highway = "macadam";
  // Civic stays with the arterial. No market-only flags.
  return { highway, arterial, street: "earth", ceiling: arterial };
}

function westAfricanRow(means: RoadMeans): SurfaceRow {
  const civic: RoadSurfaceId = means === "rich" ? "gravel" : "earth";
  return { highway: "earth", arterial: "earth", street: "earth", ceiling: civic === "gravel" ? "gravel" : "earth" };
}

function earthworkRow(band: Band, means: RoadMeans): SurfaceRow {
  const highway: RoadSurfaceId = band === "industrial" && means !== "poor" ? "macadam" : "earth";
  return { highway, arterial: "earth", street: "earth", ceiling: "earth" };
}

function flat(id: RoadSurfaceId): SurfaceRow {
  return { highway: id, arterial: id, street: id, ceiling: id };
}

function maintainerOf(
  id: RoadSurfaceId,
  place: RoadPlace,
  sphere: RoadSphere,
  period: HistoricalPeriod
): RoadSurfaceDecision["maintainer"] {
  if (id === "track" || id === "corduroy") return "none";
  if (id === "macadam") return historicalPeriodIndex(period) >= historicalPeriodIndex("steamEra") ? "state" : "toll";
  if (sphere === "classical" && (id === "flags" || (place === "highway" && id === "gravel"))) return "state";
  if ((id === "earth" || id === "setts") && place === "highway" && CORVEE_SPHERES.has(sphere)) return "corvee";
  if (id === "setts") return "frontager";
  if (id === "gravel" && place === "civic" && (sphere === "latin" || sphere === "islamic")) return "frontager";
  return "none";
}

function raiseOne(id: RoadSurfaceId): RoadSurfaceId {
  const index = LADDER.indexOf(id);
  if (index < 0 || index === LADDER.length - 1) return id;
  return LADDER[index + 1];
}

function clampToCeiling(id: RoadSurfaceId, ceiling: RoadSurfaceId): RoadSurfaceId {
  const index = LADDER.indexOf(id);
  const cap = LADDER.indexOf(ceiling);
  if (index < 0 || cap < 0) return id;
  return LADDER[Math.min(index, cap)];
}

function tableSphere(sphere: RoadSphere, period: HistoricalPeriod): RoadSphere {
  if (sphere === "classical" && !antiquity(period)) return "latin";
  return sphere;
}

function antiquity(period: HistoricalPeriod): boolean {
  return historicalPeriodIndex(period) <= historicalPeriodIndex("lateAntiquity");
}

function periodBand(period: HistoricalPeriod): Band {
  const index = historicalPeriodIndex(period);
  if (index <= historicalPeriodIndex("lateAntiquity")) return "antiquity";
  if (index === historicalPeriodIndex("earlyMedieval")) return "early";
  if (index === historicalPeriodIndex("highMedieval")) return "high";
  if (index < historicalPeriodIndex("preIndustrialEra")) return "late";
  return "industrial";
}

function sphereFromFortification(fortification: string | null, period: HistoricalPeriod): RoadSphere {
  if (fortification === "classical") return antiquity(period) ? "classical" : "latin";
  if (fortification === "european") return "latin";
  if (fortification === "islamic") return "islamic";
  if (fortification === "japanese") return "japanese";
  if (fortification === "sinitic") return "sinitic";
  if (fortification === "earthwork" || fortification === "fantastic") return "earthwork";
  return "earthwork";
}
