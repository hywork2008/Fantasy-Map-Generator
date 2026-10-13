import type { CoastResult } from "../../../core/gen/classifySea";
import { placeGates } from "../../../core/gen/interior";
import {
  clipPolylinesToLand,
  majorityLandGatesUnserved,
  remakeUnreachableLandGates
} from "../../../core/gen/plausibility";
import type { RoutedRiver } from "../../../core/gen/riverPath";
import { siteToGeography } from "../../../core/gen/site/siteInput";
import { synthSite } from "../../../core/gen/site/synthSite";
import { buildStreets, farNodeFor } from "../../../core/gen/streets";
import type { Cell, CityGeography, CityParams, Gate, Precinct, WallSegmentKind } from "../../../core/gen/types";
import type { Point } from "../../../core/types";
import type { GenerationSettings } from "../../../types/generation";
import { keepCitySide, plazaApproachPoint, requiredExternalRoads } from "./roadGeometry";

const NOMINAL_PRESET = "largeTown" as const;

export interface PlanRoadsInput {
  currentCells: Cell[];
  currentUrban: Set<number>;
  sea: Set<number>;
  waterPolygon: Point[] | null;
  coast: CoastResult | null;
  genBorders: { points: Point[]; segments: WallSegmentKind[]; urbanCellIds: number[] }[];
  gates: Gate[];
  precincts: Precinct[];
  citadelOutline: Point[] | null;
  geo: CityGeography;
  cellSize: number;
  half: number;
  rivers: RoutedRiver[];
  streetOpts: import("../../../types/generation").StreetSettings;
  canPlaceTownGate: (p: Point) => boolean;
  settings: Pick<GenerationSettings, "descriptor" | "config">;
  params: CityParams;
  seed: string;
  coasts: CoastResult[];
  appliedChannels: {
    polygon: import("../../../core/gen/types").Point[];
    shoreline: import("../../../core/gen/types").Point[];
    waterAzimuthDeg: number;
  }[];
  streetHub: () => Point;
}

/** Requires defense borders and gate predicates on the current mesh. Returns provisional approaches and street inputs for wards; final routing belongs to assembly. */
export function planRoads(input: PlanRoadsInput) {
  const {
    currentCells,
    currentUrban,
    sea,
    waterPolygon,
    coast,
    genBorders,
    gates,
    precincts,
    citadelOutline,
    geo,
    cellSize,
    half,
    rivers,
    streetOpts,
    canPlaceTownGate,
    settings,
    params,
    seed,
    coasts,
    appliedChannels,
    streetHub
  } = input;
  // S5 — approach roads (raw A* on the same graph; not smoothed into the mesh).
  const streetInput = {
    cells: currentCells,
    urban: currentUrban,
    sea,
    waterPolygon,
    shoreline: coast?.shoreline ?? null,
    borders: genBorders,
    gates,
    precincts,
    citadelOutline,
    geo,
    cellSizeMeters: cellSize,
    halfExtentMeters: half,
    rivers: rivers.map(band => band.edgePoints),
    farNode: streetOpts.farNode,
    manualBearings: streetOpts.manualBearings,
    avoidSea: streetOpts.avoidSea
  };
  let streetResult = buildStreets(streetInput);
  // Local streets seed housing independently of external roads. Retain the
  // ordinary interior access pattern, without creating world roads or gates
  // for these extra anchors (including settlements with no FMG roads).
  if (geo.importedRoads !== undefined && geo.importedRoads.length < 3) {
    const anchors = placeGates(
      currentCells,
      currentUrban,
      genBorders,
      { ...geo, importedRoads: undefined },
      3,
      canPlaceTownGate
    );
    const local = buildStreets({ ...streetInput, gates: anchors, geo: { ...geo, importedRoads: undefined } });
    streetResult = {
      ...streetResult,
      streets: local.streets,
      arteries: local.arteries,
      vertexShifts: local.vertexShifts
    };
  }
  let routedGates = gates;
  let streetGeo = geo;
  const minRoads = requiredExternalRoads(settings, params.extentMeters);
  const needsBetterRoads = (): boolean =>
    (streetOpts.avoidSea && majorityLandGatesUnserved(routedGates, streetResult.roads, cellSize)) ||
    (minRoads > 0 && streetResult.roads.length < minRoads);
  for (let roadAttempt = 0; roadAttempt < 3 && needsBetterRoads() && !settings.descriptor; roadAttempt++) {
    const retrySeed = roadAttempt === 0 ? `${seed}:roads-retry` : `${seed}:roads-retry:${roadAttempt}`;
    const retry = synthSite(NOMINAL_PRESET, settings.config, retrySeed, {
      extentMeters: params.extentMeters,
      cityRadiusMeters: params.cityRadiusMeters
    });
    const retryGeo = siteToGeography(retry);
    streetGeo = { ...geo, roadBearings: retryGeo.roadBearings, roadPaths: retryGeo.roadPaths };
    streetResult = buildStreets({ ...streetInput, geo: streetGeo });
  }
  let roads = streetResult.roads;
  if (streetOpts.avoidSea) {
    const oceanPolygon = coasts[0]?.waterPolygon ?? null;
    roads = clipPolylinesToLand(roads, oceanPolygon);
    roads = appliedChannels.reduce((lines, channel) => keepCitySide(lines, channel.polygon), roads);
    streetResult = {
      ...streetResult,
      roads,
      arteries: appliedChannels.reduce(
        (lines, channel) => keepCitySide(lines, channel.polygon),
        clipPolylinesToLand(streetResult.arteries, oceanPolygon)
      )
    };
    routedGates = remakeUnreachableLandGates(routedGates, roads, cellSize);
  }

  // Materialize routes only after opening passages on the actual mesh. Keep
  // one stable slot per gate even when the preliminary edge walk was blocked.
  roads = routedGates.map((gate, i) => [
    farNodeFor(
      gate,
      streetGeo,
      half,
      waterPolygon,
      coast?.shoreline ?? null,
      cellSize,
      streetOpts.avoidSea,
      streetOpts.farNode,
      streetOpts.manualBearings?.[i]
    ),
    gate.point
  ]);
  const gateStreets = routedGates.map(gate => [
    gate.point,
    plazaApproachPoint(
      currentCells,
      precincts.find(p => p.kind === "plaza"),
      gate.point
    ) ?? streetHub()
  ]);

  return { streetResult, routedGates, streetGeo, roads, gateStreets };
}

/** Output references belong to one pipeline invocation; no cache retains them. */
export type PlanRoadsResult = ReturnType<typeof planRoads>;
