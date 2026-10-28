import type { CastlePart, CityDocument, Point } from "../types/document";
import type { FortSite } from "../types/fortSite";
import type { GenerationSettings } from "../types/generation";
import { hasForestState } from "./forestSettings";
import { polylineInsideRing } from "./fortifications";
import { auditFortAccess } from "./fortSiteGeometry";
import { polygonCentroid } from "./geom";
import { clone, facePoints, validate } from "./mesh";

const FOOT = 0.3048;
/** The authoring grid is never cut or merged: earthworks have their own continuous geometry. */
export function generateFortOnDocument(
  input: CityDocument,
  settings: GenerationSettings,
  seed: string
): CityDocument | null {
  const source: CityDocument = {
    format: "fmg-city-editor",
    version: hasForestState(input) || settings.forestSettings ? 6 : 2,
    forestSettings: settings.forestSettings ?? input.forestSettings,
    buildingHeightPolicy: settings.buildingHeightPolicy,
    buildingHeightLimit: settings.buildingHeightLimit,
    frame: clone(input.frame),
    gridKind: input.gridKind ?? "hex",
    mesh: clone(input.mesh),
    featureGroups: [],
    gates: [],
    elements: []
  };
  for (const face of Object.values(source.mesh.faces)) delete face.properties.wallRing;
  source.historicalPeriod = settings.historicalPeriod ?? input.historicalPeriod ?? "highMedieval";
  const document = clone(source);
  const faces = Object.values(document.mesh.faces);
  const motteFace = faces
    .filter(face => {
      const ring = facePoints(document.mesh, face),
        [x, y] = polygonCentroid(ring),
        half = 30 * FOOT;
      const keep: Point[] = [
        [x - half, y - half],
        [x + half, y - half],
        [x + half, y + half],
        [x - half, y + half]
      ];
      return face.properties.water === "land" && polylineInsideRing([...keep, keep[0]], ring);
    })
    .slice()
    .sort(
      (a, b) =>
        Math.hypot(...subtract(polygonCentroid(facePoints(document.mesh, a)), [0, 40])) -
        Math.hypot(...subtract(polygonCentroid(facePoints(document.mesh, b)), [0, 40]))
    )[0];
  if (!motteFace) return null;
  const center = polygonCentroid(facePoints(document.mesh, motteFace)).map(n => n || 0) as Point;
  const bay: Point = [center[0], center[1] - 65];
  const site: FortSite = {
    version: 1,
    id: "fort:site",
    castleId: "fort:buildings",
    groundElevationMeters: 10,
    waterElevationMeters: 8.5,
    motte: { center, summitRadiusMeters: 15.5, baseRadiusMeters: 26.5, heightMeters: 50 * FOOT },
    bailey: { center: bay, radiusMeters: 110 * FOOT, elevationMeters: 10 },
    moats: [
      { id: "fort:motte-moat", center, radiusMeters: 30, widthMeters: 6, depthMeters: 3, locked: false },
      {
        id: "fort:bailey-moat",
        center: bay,
        radiusMeters: 110 * FOOT + 4,
        widthMeters: 6,
        depthMeters: 3,
        locked: false
      }
    ],
    defenses: [
      {
        id: "fort:summit-palisade",
        center,
        radiusMeters: 15.3,
        heightMeters: 12 * FOOT,
        widthMeters: 0.45,
        locked: false
      },
      {
        id: "fort:bailey-palisade",
        center: bay,
        radiusMeters: 110 * FOOT - 0.8,
        heightMeters: 12 * FOOT,
        widthMeters: 0.45,
        locked: false
      }
    ],
    gates: [
      {
        id: "fort:summit-gate",
        defenseId: "fort:summit-palisade",
        angleRadians: -Math.PI / 2,
        widthMeters: 3.5,
        heightMeters: 5
      },
      {
        id: "fort:inner-gate",
        defenseId: "fort:bailey-palisade",
        angleRadians: Math.PI / 2,
        widthMeters: 4,
        heightMeters: 4.5
      },
      {
        id: "fort:outer-gate",
        defenseId: "fort:bailey-palisade",
        angleRadians: -Math.PI / 2,
        widthMeters: 4,
        heightMeters: 4.5
      }
    ],
    junctions: [],
    routes: [],
    buildings: []
  };
  const parts: CastlePart[] = [];
  const add = (
    use: FortSite["buildings"][number]["use"],
    at: Point,
    width: number,
    depth: number,
    rotation: number,
    height: number
  ) => {
    const world = (u: number, v: number): Point => [
      at[0] + u * Math.cos(rotation) - v * Math.sin(rotation),
      at[1] + u * Math.sin(rotation) + v * Math.cos(rotation)
    ];
    const role: CastlePart["role"] =
      use === "keep" ? "keep" : use === "hall" ? "hall" : use === "chapel" ? "chapel" : "service";
    const part: CastlePart = {
      id: `fort:${use}`,
      role,
      footprint: [
        world(-width / 2, -depth / 2),
        world(width / 2, -depth / 2),
        world(width / 2, depth / 2),
        world(-width / 2, depth / 2)
      ],
      entrances: [world(0, depth / 2)],
      locked: false
    };
    parts.push(part);
    site.buildings.push({
      partId: part.id,
      use,
      heightMeters: height,
      material: use === "keep" ? "stone" : "wood",
      roof: use === "keep" ? "flat" : "gable",
      ...(use === "keep" ? { cornerTowerHeightMeters: 20 * FOOT } : {})
    });
    return part;
  };
  // Keep entrance faces the summit gate. 60 ft fits inside the default single hex cell.
  const keep = add("keep", center, 60 * FOOT, 60 * FOOT, Math.PI, 70 * FOOT);
  const layout: Array<[FortSite["buildings"][number]["use"], number, number, number, number]> = [
    ["chapel", 155, 8, 12, 7],
    ["hall", 60, 16, 9, 7],
    ["kitchen", 20, 8, 7, 4],
    ["barracks", -20, 13, 7, 5],
    ["blacksmith", -60, 8, 6, 4],
    ["workshop", -125, 10, 7, 4],
    ["stables", -170, 13, 7, 5],
    ["stores", 110, 8, 8, 5]
  ];
  for (const [use, degrees, width, depth, height] of layout) {
    const angle = (degrees * Math.PI) / 180;
    add(use, [bay[0] + 24 * Math.cos(angle), bay[1] + 24 * Math.sin(angle)], width, depth, angle + Math.PI / 2, height);
  }
  for (const face of faces) {
    face.properties.elevation = 10;
    face.properties.ward = "empty";
    face.properties.buildable = false;
  }
  // Cell IDs express ownership only. The earthwork and fence boundaries do not snap to them.
  const siteFaceIds = faces
    .filter(face => {
      const p = polygonCentroid(facePoints(document.mesh, face));
      return (
        Math.hypot(...subtract(p, center)) < 40 + input.frame.blockSizeMeters ||
        Math.hypot(...subtract(p, bay)) < 42 + input.frame.blockSizeMeters
      );
    })
    .map(face => face.id);
  for (const id of siteFaceIds) document.mesh.faces[id].properties.ward = "castle";
  const summit = 10 + site.motte.heightMeters,
    r = site.defenses[1].radiusMeters;
  const outerGate: Point = [bay[0], bay[1] - r],
    innerGate: Point = [bay[0], bay[1] + r];
  const foot: Point = [center[0], center[1] - site.motte.baseRadiusMeters],
    summitGate: Point = [center[0], center[1] - 15.3];
  const landing: Point = [center[0], center[1] - site.motte.summitRadiusMeters];
  const outside: Point = [bay[0], bay[1] - site.bailey.radiusMeters - 8];
  site.junctions = [
    { id: "fort:world", point: [outside[0], -input.frame.extentMeters / 2], elevationMeters: 10 },
    { id: "fort:outer-bank", point: outside, elevationMeters: 10.2 },
    { id: "fort:stair-foot", point: foot, elevationMeters: 10.2 },
    { id: "fort:courtyard", point: bay, elevationMeters: 10 },
    { id: "fort:summit-landing", point: landing, elevationMeters: summit + 0.2 }
  ];
  const route = (
    id: string,
    kind: FortSite["routes"][number]["kind"],
    from: string,
    to: string,
    points: Point[],
    levels: number[],
    width = 3
  ) => site.routes.push({ id, kind, from, to, points, elevationsMeters: levels, widthMeters: width, locked: false });
  route("fort:outer-bridge", "bridge", "fort:outer-bank", "fort:outer-gate", [outside, outerGate], [10.2, 10.2], 4);
  route(
    "fort:approach",
    "path",
    "fort:world",
    "fort:outer-bank",
    [[outside[0], -input.frame.extentMeters / 2], outside],
    [10, 10]
  );
  route(
    "fort:bailey-spine",
    "path",
    "fort:outer-gate",
    "fort:inner-gate",
    [outerGate, bay, innerGate],
    [10, 10, 10],
    3.5
  );
  route("fort:inner-bridge", "bridge", "fort:inner-gate", "fort:stair-foot", [innerGate, foot], [10.2, 10.2], 3.5);
  route("fort:stairs", "stairs", "fort:stair-foot", "fort:summit-landing", [foot, landing], [10.2, summit + 0.2], 3);
  route(
    "fort:summit-path",
    "path",
    "fort:summit-landing",
    "fort:summit-gate",
    [landing, summitGate],
    [summit + 0.2, summit + 0.2],
    3
  );
  route(
    "fort:keep-access",
    "path",
    "fort:summit-gate",
    keep.id,
    [summitGate, keep.entrances[0]],
    [summit + 0.2, summit]
  );
  for (const part of parts.slice(1))
    route(`fort:access-${part.id}`, "path", "fort:courtyard", part.id, [bay, part.entrances[0]], [10, 10], 2);
  document.castles = [
    {
      id: site.castleId,
      version: 1,
      seed,
      position: "central",
      relationship: "detached",
      form: "keep-bailey",
      castleStyle: "motte-bailey",
      siteFaceIds,
      motteFaceId: motteFace.id,
      parts,
      courtyards: [],
      accesses: [],
      provenance: "generated",
      locked: false
    }
  ];
  document.fortSite = site;
  document.version = hasForestState(document) ? 6 : 2;
  document.appearance = "town";
  document.generationSeed = seed;
  document.fabric = {
    version: 4,
    seed,
    districts: [],
    generation: { algorithm: "fort-v1", seed, settings: clone(settings), input: clone(source) }
  };
  return validate(document).length || auditFortAccess(document).length ? null : document;
}
function subtract(a: Point, b: Point): Point {
  return [a[0] - b[0], a[1] - b[1]];
}
