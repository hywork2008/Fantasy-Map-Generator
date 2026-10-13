import { exteriorDirection } from "../../../core/frameRoadConnection";
import { terrainHeight } from "../../../core/gen/castlePlacement";
import type { CoastResult } from "../../../core/gen/classifySea";
import type { RoutedRiver } from "../../../core/gen/riverPath";
import { synthSite } from "../../../core/gen/site/synthSite";
import type {
  Cell,
  CityGeography,
  CityParams,
  CityProgram,
  Gate,
  Precinct,
  WallSegmentKind
} from "../../../core/gen/types";
import { assignWards } from "../../../core/gen/wards";
import type { CityDocument, Point } from "../../../core/types";
import type { GenerationSettings } from "../../../types/generation";
import { outerFrameRoads } from "./roadGeometry";
import { fmgCellElevations } from "./waterTerrain";

const NOMINAL_PRESET = "largeTown" as const;

export interface PlanWardsInput {
  settings: Pick<GenerationSettings, "historicalPeriod" | "descriptor" | "config" | "burialProfile">;
  sourceDocument: CityDocument | undefined;
  seed: string;
  half: number;
  params: CityParams;
  currentCells: Cell[];
  currentUrban: Set<number>;
  currentOutskirts: Set<number>;
  residentialOutskirts: Set<number>;
  sea: Set<number>;
  coastalWater: Set<number>;
  genBorders: { points: Point[]; segments: WallSegmentKind[]; urbanCellIds: number[] }[];
  routedGates: Gate[];
  precincts: Precinct[];
  streetGeo: CityGeography;
  program: CityProgram;
  coast: CoastResult | null;
  classified: {
    kind: "ocean" | "lake" | "river";
    coast: CoastResult | null;
    regionalShore: import("../../../core/gen/types").Point[] | undefined;
    extraShores:
      | { line: import("../../../core/gen/types").Point[]; wet: import("../../../core/gen/types").Point }[]
      | undefined;
  }[];
  waterPolygon: Point[] | null;
  streetResult: import("../../../core/gen/streets").StreetResult;
  roads: import("../../../core/gen/types").Point[][];
  rivers: RoutedRiver[];
  geo: CityGeography;
  currentFaceIdOf: string[];
}

/** Requires roads and remapped cells from defense planning. Returns assignments in decision order and elevations without mutating the source document. */
export function planWards(input: PlanWardsInput) {
  const {
    settings,
    sourceDocument,
    seed,
    half,
    params,
    currentCells,
    currentUrban,
    currentOutskirts,
    residentialOutskirts,
    sea,
    coastalWater,
    genBorders,
    routedGates,
    precincts,
    streetGeo,
    program,
    coast,
    classified,
    waterPolygon,
    streetResult,
    roads,
    rivers,
    geo,
    currentFaceIdOf
  } = input;
  // S6 — wards.
  const historicalPeriod =
    settings.historicalPeriod ?? settings.descriptor?.historicalPeriod ?? sourceDocument?.historicalPeriod;

  const cemeteryTerrain = (
    settings.descriptor ??
    synthSite(NOMINAL_PRESET, settings.config, seed, {
      extentMeters: half * 2,
      cityRadiusMeters: params.cityRadiusMeters
    })
  ).terrain;
  const fmgElevations = fmgCellElevations(currentCells, settings.descriptor);
  const warded = assignWards({
    cells: currentCells,
    urban: currentUrban,
    outskirts: currentOutskirts,
    residentialOutskirts,
    sea,
    coastalWater,
    borders: genBorders,
    gates: routedGates,
    precincts,
    geo: streetGeo,
    params,
    program,
    shoreline: coast?.shoreline ?? null,
    oceanShorelines: classified.flatMap(item => (item.kind === "ocean" && item.coast ? [item.coast.shoreline] : [])),
    waterPolygon,
    streets: [...streetResult.streets, ...roads],
    exteriorRoads: (outerFrameRoads(settings.descriptor) ?? []).flatMap(leg => {
      const drawn = leg.pieces.flatMap(piece => (piece.points.length >= 2 ? [piece.points] : []));
      // The town side of a bridge is entered straight along its axis (see
      // straightenFrameRoadJunctions): keep that corridor clear as well.
      const start = leg.pieces[0]?.points[0];
      const out = exteriorDirection(leg, settings.descriptor);
      if (!start || !out) return drawn;
      const reach = Math.hypot(start[0], start[1]) * 0.75;
      const abutment = params.cellSizeMeters * 1.5;
      return [
        ...drawn,
        [
          [start[0] + out[0] * abutment, start[1] + out[1] * abutment] as Point,
          [start[0] - out[0] * reach, start[1] - out[1] * reach] as Point
        ]
      ];
    }),
    rivers: rivers.map(band => band.edgePoints),
    riverBanks:
      settings.descriptor?.fixedCrossings?.rivers.flatMap(river =>
        river.rings.map(ring => [...ring.map(p => [p[0], p[1]] as Point), [ring[0][0], ring[0][1]] as Point])
      ) ?? geo.channels?.map(channel => [...channel.polygon, channel.polygon[0]]),
    historicalPeriod,
    burialProfile: settings.burialProfile ?? settings.descriptor?.burialProfile ?? sourceDocument?.burialProfile,
    elevations: new Map(
      currentCells.map(cell => [
        cell.id,
        terrainHeight(cemeteryTerrain, cell.centroid) ??
          sourceDocument?.mesh.faces[currentFaceIdOf[cell.id]]?.properties.elevation ??
          0
      ])
    ),
    economy: settings.descriptor?.economy
  });
  return { fmgElevations, warded };
}

/** Output references belong to one pipeline invocation; no cache retains them. */
export type PlanWardsResult = ReturnType<typeof planWards>;
