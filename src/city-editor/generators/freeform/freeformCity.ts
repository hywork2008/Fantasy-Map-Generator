import { facingFromRotation, frontAxisOf, rotationFromFacing } from "../../../buildings/placementContract";
import type { CityDocument, EdgeFeatureGroup, Point } from "../../types/document";
import type { FreeformCity, FreeformPlacement, FreeformPlot, LandZone, SculptStroke } from "../../types/freeformCity";
import type {
  FreeformWay,
  TerrainFieldRecipe,
  TerrainPlatform,
  TerrainRiverCorridor,
  TerrainTemplateId
} from "../../types/terrain";
import { facePoints } from "../mesh";
import { buildTerrainFieldRecipe, terrainFieldForDocument } from "../terrainField/build";
import { cellsToFieldRecipe } from "../terrainField/cellsToField";
import { FIELD_MODE_MAX_EXTENT_METERS, FIELD_SAMPLE_METERS } from "../terrainField/constants";
import { buildRiverCorridors } from "../terrainField/corridor";
import { plotFeatureId } from "./commitPlacement";

const TEMPLATES = new Set<TerrainTemplateId>(["noise", "crag", "spur", "meander", "escarpment", "dome", "cells"]);
const PLOT_PREFIX = "plot:";

/** Largest frame a new freeform city uses. An imported map keeps its own frame. */
export function freeformFrameMeters(requested: number): number {
  if (!(requested > 0)) return FIELD_MODE_MAX_EXTENT_METERS;
  return Math.min(requested, FIELD_MODE_MAX_EXTENT_METERS);
}

/** Numeric dome seed from the editor's random seed text. */
export function freeformSeed(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Dome height field and an empty ledger. */
export function createFreeformCity(extentMeters: number, seed = 1, sampleMeters = FIELD_SAMPLE_METERS): FreeformCity {
  const extent = freeformFrameMeters(extentMeters);
  return {
    format: "fmg-freeform-city",
    version: 1,
    frame: { extentMeters: extent },
    ground: buildTerrainFieldRecipe({ template: "dome", seed, extentMeters: extent, sampleMeters }),
    sculpt: [],
    plots: [],
    placements: [],
    ways: [],
    rivers: [],
    zones: []
  };
}

/** Editor view of a ledger. The mesh has no cells; elevation, roads, and rivers come from the ledger. */
export function materializeFreeform(city: FreeformCity, base?: CityDocument): CityDocument {
  const pads: TerrainPlatform[] = city.plots.map(plot => ({
    kind: "platform",
    id: plot.id,
    ownerId: plot.ownerId,
    role: "pad",
    summit: { kind: "polygon", points: plot.outline.map(point => [point[0], point[1]]) },
    levelMeters: plot.levelMeters,
    edge: plot.edge.kind === "wall" ? { kind: "wall" } : { kind: "slope", runMeters: plot.edge.runMeters }
  }));
  const document: CityDocument = {
    format: "fmg-city-editor",
    version: 1,
    frame: {
      extentMeters: city.frame.extentMeters,
      cityRadiusMeters: city.frame.extentMeters * 0.33,
      blockSizeMeters: base?.frame.blockSizeMeters ?? 50
    },
    historicalPeriod: base?.historicalPeriod ?? "ageOfExploration",
    mesh: { vertices: {}, edges: {}, faces: {} },
    featureGroups: [],
    gates: [],
    elements: city.placements.map(placement => ({
      id: placement.id,
      kind: "object",
      faceIds: [],
      locked: false,
      point: [placement.position[0], placement.position[1]],
      objectType: placement.modelId,
      objectScale: 1,
      rotation: rotationFromFacing(frontAxisOf(placement.modelId), placement.facingDegrees)
    })),
    terrain: {
      version: 1,
      field: city.ground,
      features: [...pads, ...city.rivers],
      ways: city.ways
    },
    freeform: city,
    ...(base?.maxBridgeSkewDegrees !== undefined ? { maxBridgeSkewDegrees: base.maxBridgeSkewDegrees } : {}),
    ...(base?.biome ? { biome: base.biome } : {}),
    ...(base?.showElevationTint !== undefined ? { showElevationTint: base.showElevationTint } : {}),
    ...(base?.buildingAppearanceVersion !== undefined
      ? { buildingAppearanceVersion: base.buildingAppearanceVersion }
      : {}),
    ...(base?.buildingAppearanceProfile ? { buildingAppearanceProfile: base.buildingAppearanceProfile } : {}),
    ...(base?.buildingAppearanceClimate ? { buildingAppearanceClimate: base.buildingAppearanceClimate } : {}),
    ...(base?.buildingWallFinish ? { buildingWallFinish: base.buildingWallFinish } : {}),
    ...(base?.prevailingWindDeg !== undefined ? { prevailingWindDeg: base.prevailingWindDeg } : {})
  };
  return document;
}

/**
 * Copy the working pads, placements, ways, and rivers back into the ledger.
 * Zones and sculpt stay as edited on `document.freeform`.
 */
export function captureFreeform(document: CityDocument): CityDocument {
  if (!document.freeform || !document.terrain?.field) return document;
  const previousPlots = new Map(document.freeform.plots.map(plot => [plot.id, plot]));
  const previousPlacements = new Map(document.freeform.placements.map(item => [item.id, item]));
  const plots: FreeformPlot[] = [];
  for (const feature of document.terrain.features) {
    if (feature.kind !== "platform" || feature.role !== "pad" || feature.summit.kind !== "polygon") continue;
    if (feature.summit.points.length < 3) continue;
    const ownerId = feature.ownerId ?? feature.id.replace(PLOT_PREFIX, "");
    const id = feature.id.startsWith(PLOT_PREFIX) ? feature.id : plotFeatureId(ownerId);
    const kept = previousPlots.get(id) ?? previousPlots.get(feature.id);
    plots.push({
      id,
      ownerId,
      outline: feature.summit.points.map(point => [point[0], point[1]]),
      levelMeters: feature.levelMeters,
      edge: feature.edge.kind === "slope" ? { kind: "slope", runMeters: feature.edge.runMeters } : { kind: "wall" },
      marginMeters: kept?.marginMeters ?? 1
    });
  }
  const plotIds = new Set(plots.map(plot => plot.id));
  const owners = new Map(plots.map(plot => [plot.ownerId, plot.id]));
  const placements: FreeformPlacement[] = [];
  for (const element of document.elements) {
    if (!element.point || !element.objectType) continue;
    const plotId =
      owners.get(element.id) ?? (plotIds.has(plotFeatureId(element.id)) ? plotFeatureId(element.id) : null);
    if (!plotId) continue;
    const kept = previousPlacements.get(element.id);
    placements.push({
      id: element.id,
      modelId: element.objectType,
      ...(kept?.quality ? { quality: kept.quality } : {}),
      position: [element.point[0], element.point[1]],
      facingDegrees: facingFromRotation(frontAxisOf(element.objectType), element.rotation ?? 0),
      plotId
    });
  }
  const city: FreeformCity = {
    format: "fmg-freeform-city",
    version: 1,
    frame: { extentMeters: document.frame.extentMeters },
    ground: structuredClone(document.terrain.field),
    sculpt: structuredClone(document.freeform.sculpt),
    plots,
    placements,
    ways: structuredClone(document.terrain.ways ?? []),
    rivers: structuredClone(
      document.terrain.features.filter((feature): feature is TerrainRiverCorridor => feature.kind === "riverCorridor")
    ),
    zones: structuredClone(document.freeform.zones)
  };
  return { ...document, freeform: city };
}

/**
 * Lift a city into the ledger.
 * Streets become ways, surveyed or drawn rivers become corridors, and park, farm, and forest faces become zones.
 * Walls and gates stay behind: the ledger has no place for them.
 * Returns null when the map has neither a height-field recipe nor cell elevations to sample.
 */
export function convertDocumentToFreeform(document: CityDocument): CityDocument | null {
  if (document.freeform) return captureFreeform(document);
  const ground = document.terrain?.field ?? cellsToFieldRecipe(document);
  if (!ground) return null;
  const drafted: CityDocument = {
    ...document,
    terrain: {
      version: 1,
      features: document.terrain?.features ?? [],
      field: ground,
      ways: document.terrain?.ways
    }
  };
  const existingRivers = (drafted.terrain.features ?? []).filter(
    (feature): feature is TerrainRiverCorridor => feature.kind === "riverCorridor"
  );
  const rivers = existingRivers.length ? existingRivers : riversFromCourses(drafted);
  const pads = (drafted.terrain.features ?? []).filter(
    (feature): feature is TerrainPlatform => feature.kind === "platform" && feature.role === "pad"
  );
  const seeded: FreeformCity = {
    format: "fmg-freeform-city",
    version: 1,
    frame: { extentMeters: document.frame.extentMeters },
    ground,
    sculpt: [],
    plots: [],
    placements: [],
    ways: [],
    rivers: [],
    zones: zonesFromFaces(document)
  };
  const captured = captureFreeform({
    ...drafted,
    terrain: { version: 1, field: ground, features: [...pads, ...rivers], ways: waysFromDocument(document) },
    freeform: seeded
  });
  return captured.freeform ? materializeFreeform(captured.freeform, document) : null;
}

export function serializeFreeform(document: CityDocument): string {
  const city = document.freeform ? captureFreeform(document).freeform : null;
  return JSON.stringify(city);
}

export function parseFreeformCity(text: string): FreeformCity | null {
  try {
    return validCity(JSON.parse(text));
  } catch {
    return null;
  }
}

function riversFromCourses(document: CityDocument): TerrainRiverCorridor[] {
  const field = terrainFieldForDocument(document);
  if (!field) return [];
  return buildRiverCorridors(document, field);
}

function waysFromDocument(document: CityDocument): FreeformWay[] {
  const drawn = document.terrain?.ways ?? [];
  const fromRoads = roadWays(document);
  if (!drawn.length) return fromRoads;
  const kept = [...drawn];
  for (const way of fromRoads) {
    if (kept.some(item => sameLine(item.centerline, way.centerline))) continue;
    kept.push(way);
  }
  return kept;
}

function roadWays(document: CityDocument): FreeformWay[] {
  const ways: FreeformWay[] = [];
  for (const group of document.featureGroups) {
    if (group.kind !== "road") continue;
    const road = group as EdgeFeatureGroup;
    const centerline = roadCenterline(document, road);
    if (centerline.length < 2) continue;
    ways.push({
      id: `way:${road.id}`,
      centerline,
      widthMeters: Math.min(40, Math.max(0.5, road.style.widthMeters || 4)),
      profile: "slope",
      surface: "dirt",
      grade: road.roadRole === "approach" ? "approach" : "cart"
    });
  }
  return ways;
}

function roadCenterline(document: CityDocument, road: EdgeFeatureGroup): Point[] {
  const points: Point[] = [];
  for (const segment of road.segments) {
    const edge = document.mesh.edges[segment.edgeId];
    if (!edge) continue;
    const start = document.mesh.vertices[segment.forward ? edge.a : edge.b]?.point;
    const end = document.mesh.vertices[segment.forward ? edge.b : edge.a]?.point;
    if (!start || !end) continue;
    if (!points.length) points.push([start[0], start[1]]);
    const last = points[points.length - 1];
    if (Math.hypot(end[0] - last[0], end[1] - last[1]) < 0.05) continue;
    points.push([end[0], end[1]]);
  }
  return points;
}

function zonesFromFaces(document: CityDocument): LandZone[] {
  const zones: LandZone[] = [];
  for (const face of Object.values(document.mesh.faces)) {
    const ward = face.properties.ward;
    const cover = face.properties.landCoverOverride;
    const kind = ward === "park" ? "park" : ward === "farm" ? "farm" : cover === "forest" ? "forest" : null;
    if (!kind) continue;
    const polygon = facePoints(document.mesh, face).map(point => [point[0], point[1]] as Point);
    if (polygon.length < 3) continue;
    zones.push({ id: `zone:${face.id}`, kind, polygon });
  }
  return zones;
}

function sameLine(a: readonly Point[], b: readonly Point[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((point, index) => Math.hypot(point[0] - b[index][0], point[1] - b[index][1]) < 0.5);
}

function validCity(value: unknown): FreeformCity | null {
  if (!value || typeof value !== "object") return null;
  const city = value as Partial<FreeformCity>;
  if (city.format !== "fmg-freeform-city" || city.version !== 1) return null;
  const extent = city.frame?.extentMeters;
  if (!(typeof extent === "number" && extent > 0)) return null;
  const ground = validRecipe(city.ground);
  if (!ground) return null;
  const sculpt = validSculpt(city.sculpt);
  const plots = validPlots(city.plots);
  const placements = validPlacements(city.placements, new Set(plots?.map(plot => plot.id)));
  const ways = validWays(city.ways);
  const rivers = validRivers(city.rivers);
  const zones = validZones(city.zones);
  if (!sculpt || !plots || !placements || !ways || !rivers || !zones) return null;
  return {
    format: "fmg-freeform-city",
    version: 1,
    frame: { extentMeters: extent },
    ground,
    sculpt,
    plots,
    placements,
    ways,
    rivers,
    zones
  };
}

function validRecipe(value: unknown): TerrainFieldRecipe | null {
  if (!value || typeof value !== "object") return null;
  const recipe = value as TerrainFieldRecipe;
  if (recipe.version !== 1 || !TEMPLATES.has(recipe.template)) return null;
  if (
    typeof recipe.seed !== "number" ||
    !(recipe.sampleMeters > 0) ||
    !Array.isArray(recipe.parts) ||
    !recipe.parts.length
  )
    return null;
  return recipe;
}

function validSculpt(value: unknown): SculptStroke[] | null {
  if (!Array.isArray(value)) return null;
  const strokes: SculptStroke[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const stroke = item as SculptStroke;
    if (typeof stroke.id !== "string" || !stroke.id) return null;
    if (stroke.kind !== "raise" && stroke.kind !== "lower" && stroke.kind !== "smooth") return null;
    const center = point(stroke.center);
    if (!center || !(stroke.radiusMeters > 0) || !Number.isFinite(stroke.meters)) return null;
    strokes.push({
      id: stroke.id,
      kind: stroke.kind,
      center,
      radiusMeters: stroke.radiusMeters,
      meters: stroke.meters
    });
  }
  return strokes;
}

function validPlots(value: unknown): FreeformPlot[] | null {
  if (!Array.isArray(value)) return null;
  const plots: FreeformPlot[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const plot = item as FreeformPlot;
    const outline = points(plot.outline, 3);
    if (!outline || typeof plot.id !== "string" || typeof plot.ownerId !== "string") return null;
    if (!Number.isFinite(plot.levelMeters) || !(plot.marginMeters >= 0)) return null;
    if (plot.edge?.kind === "wall") plots.push({ ...plot, outline, edge: { kind: "wall" } });
    else if (plot.edge?.kind === "slope" && plot.edge.runMeters >= 0)
      plots.push({ ...plot, outline, edge: { kind: "slope", runMeters: plot.edge.runMeters } });
    else return null;
  }
  return plots;
}

function validPlacements(value: unknown, plotIds: Set<string>): FreeformPlacement[] | null {
  if (!Array.isArray(value)) return null;
  const placements: FreeformPlacement[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const placement = item as FreeformPlacement;
    const position = point(placement.position);
    if (!position || typeof placement.id !== "string" || typeof placement.modelId !== "string") return null;
    if (!Number.isFinite(placement.facingDegrees) || !plotIds.has(placement.plotId)) return null;
    if (placement.quality !== undefined && !["low", "high", "ultra"].includes(placement.quality)) return null;
    placements.push({
      id: placement.id,
      modelId: placement.modelId,
      ...(placement.quality ? { quality: placement.quality } : {}),
      position,
      facingDegrees: placement.facingDegrees,
      plotId: placement.plotId
    });
  }
  return placements;
}

function validWays(value: unknown): FreeformWay[] | null {
  if (!Array.isArray(value)) return null;
  const ways: FreeformWay[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const way = item as FreeformWay;
    const centerline = points(way.centerline, 2);
    if (!centerline || typeof way.id !== "string") return null;
    if (!(way.widthMeters > 0) || (way.profile !== "slope" && way.profile !== "stepped")) return null;
    if (way.surface !== "dirt" && way.surface !== "paved" && way.surface !== "cobble") return null;
    ways.push({ ...way, centerline });
  }
  return ways;
}

function validRivers(value: unknown): TerrainRiverCorridor[] | null {
  if (!Array.isArray(value)) return null;
  const rivers: TerrainRiverCorridor[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const river = item as TerrainRiverCorridor;
    const centerline = points(river.centerline, 2);
    if (
      !centerline ||
      river.kind !== "riverCorridor" ||
      typeof river.id !== "string" ||
      typeof river.sourceId !== "string"
    )
      return null;
    if (!numbers(river.widthsMeters, centerline.length) || !numbers(river.bedMeters, centerline.length)) return null;
    if (!(river.depthMeters > 0)) return null;
    if (river.bank?.kind === "slope" && !(river.bank.runMeters >= 0)) return null;
    if (river.bank?.kind === "quay" && !(river.bank.heightMeters >= 0)) return null;
    if (river.bank?.kind !== "slope" && river.bank?.kind !== "quay") return null;
    for (let i = 1; i < river.bedMeters.length; i++)
      if (river.bedMeters[i] > river.bedMeters[i - 1]) river.bedMeters[i] = river.bedMeters[i - 1];
    rivers.push({ ...river, centerline });
  }
  return rivers;
}

function validZones(value: unknown): LandZone[] | null {
  if (!Array.isArray(value)) return null;
  const zones: LandZone[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const zone = item as LandZone;
    const polygon = points(zone.polygon, 3);
    if (!polygon || typeof zone.id !== "string") return null;
    if (zone.kind !== "forest" && zone.kind !== "farm" && zone.kind !== "park") return null;
    zones.push({ id: zone.id, kind: zone.kind, polygon });
  }
  return zones;
}

function point(value: unknown): Point | null {
  if (!Array.isArray(value) || value.length < 2 || !Number.isFinite(value[0]) || !Number.isFinite(value[1]))
    return null;
  return [value[0], value[1]];
}

function points(value: unknown, min: number): Point[] | null {
  if (!Array.isArray(value) || value.length < min) return null;
  const out: Point[] = [];
  for (const item of value) {
    const next = point(item);
    if (!next) return null;
    out.push(next);
  }
  return out;
}

function numbers(value: unknown, length: number): value is number[] {
  return Array.isArray(value) && value.length === length && value.every(item => Number.isFinite(item));
}
