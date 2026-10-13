import type { CityDocument, Mesh, Point, WallMaterial } from "../../types/document";
import type { GenerationSettings, MeshBorderLoop } from "../../types/generation";
import type { Cell, CityGeography, Gate, Precinct, UrbanStage, WardAssignment, WardKind } from "../../types/geometry";
import type { CastleSite } from "../castlePlacement";
import type { InnerWallFailure } from "../innerTownWall";
import type { RoutedRiver } from "../riverPath";

export interface Plan {
  /** Requested order survives an unsuccessful old-town pre-plan. */
  townWallBuildOrder?: GenerationSettings["townWallBuildOrder"];
  /** Double walls (docs/plan/ce-multi-ring-walls.md): the planned old town, or why there is none. */
  innerWall?: {
    planned: boolean;
    failure?: InnerWallFailure;
    castleRing?: "inner" | "outer";
    /** Old-town share of the town and whether the wall is razed (set when planned). */
    share?: number;
    razed?: boolean;
    buildOrder?: "outer-first" | "inner-first";
    defensePolicy?: "legacy" | "closed";
  };
  /** Gate-to-centre lines; the old-town wall is built on them before the town streets. */
  innerArteries?: Point[][];
  burialProfile?: import("../../../data/burialCultures").BurialCultureProfile;
  fixedCrossings?: CityDocument["importedFixedCrossings"];
  replaceFixedCrossings?: boolean;
  urbanCoreMode?: "legacy" | "compact";
  layout?: "organic" | "circulade" | "bram" | "classic";
  sea: Set<number>;
  ocean: Set<number>;
  /** S1's raw graph walk (upstream → downstream), before it is closed into
   * `sea`'s water polygon. Empty before S1 runs. See `generateCoastWalkStep`. */
  coastPath: Point[];
  /** Closed water polygon from S1, or null when landlocked. Used by the G2
   * plausibility filter in `applyPlan` (wet wall edges) and tests. */
  waterPolygon: Point[] | null;
  channelPolygons?: Point[][];
  /** Sea beyond the town mesh, closed against the display frame. */
  regionalWater?: Point[][];
  regionalSurface?: import("../../types/contracts/burgSiteDescriptor").BurgSiteRegionalSurface;
  /** Resolved `settings.streets.avoidSea` so `applyPlan` can drop wet walls
   * without taking the whole settings object. */
  avoidSea: boolean;
  wallMaterial?: WallMaterial;
  rivers: RoutedRiver[];
  urban: Set<number>;
  outskirts: Set<number>;
  /** S3 flood-fill before the wall-capacity split. The settlement-area floor
   * is measured against this, not the walled core in `urban`. */
  builtUp: Set<number>;
  /** S3 flood-fill in fill order, one entry per cell admitted to `urban`. Empty
   * before S3 runs. See `UrbanPatchStep`. */
  urbanStages: UrbanStage[];
  borderLoops: MeshBorderLoop[];
  gates: Gate[];
  precincts: Precinct[];
  citadelOutline: Point[] | null;
  castleSite?: CastleSite | null;
  castleFailure?: string;
  castleFailureDetails?: string[];
  moats?: GenerationSettings["moats"];
  legacyCastles?: boolean;
  roads: Point[][];
  roadPaths?: Point[][];
  importedRoads?: CityGeography["importedRoads"];
  frameRoads?: CityDocument["frameRoads"];
  riverPort?: boolean;
  streets: Point[][];
  /** The district preview omits the gate-to-centre streets, so gates have no inner road yet. */
  wardsOnly?: true;
  wards: Map<number, WardKind>;
  /** FMG land elevation (metres) per cell id, sampled from the linked burg's
   * heightfield. Absent for standalone cities. */
  fmgElevations?: Map<number, number>;
  /** `wards`' source data, in decision order rather than sorted by cell id. Empty
   * before S6 runs. See `generateWardStep`. */
  wardOrder: WardAssignment[];
  templeHarbor: Precinct[];
  mesh?: Mesh;
  faceIdOf?: string[];
  cells?: Cell[];
}
