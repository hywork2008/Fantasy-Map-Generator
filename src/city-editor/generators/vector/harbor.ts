import { harborCraneFoundationFootprint } from "../../../buildings/medieval/harborCraneDimensions";
import { SHIP_DIMENSIONS } from "../../data/ships";
import type { Point } from "../../types/primitives";
import type { VectorCityDocument } from "../../types/vector/document";
import type { VectorPolygon } from "../../types/vector/generation";
import type { VectorHarborPlan, VectorHarborShip } from "../../types/vector/harbor";
import { cargoShipGeometry, polygonsOverlap, shipFootprint, solveCargoBerth } from "../harborCargo";
import { polygonHarborWaterField, SEA_CHANNEL_HALF_WIDTH } from "../harborNavigation";
import { validShipDisplayState } from "../shipDisplayState";
import { defenseAccessSurface } from "./defense";
import { evaluateAnchor } from "./geometry/curves";
import { containsRegion, regionArea, regionBoolean } from "./geometry/regions";
import { ringInside } from "./geometry/routing";
import { simpleContour } from "./geometry/surfaces";

export const vectorShipFootprint = (s: VectorHarborShip, margin = 0) => ({
  outer: shipFootprint(s.point, s.rotation, s.length + margin, cargoShipGeometry(s.type, s.length).beam + margin),
  holes: []
});
const circle = (p: Point, r: number): VectorPolygon => ({
  outer: Array.from({ length: 24 }, (_, i) => [
    p[0] + Math.cos((i * Math.PI) / 12) * r,
    p[1] + Math.sin((i * Math.PI) / 12) * r
  ]),
  holes: []
});
const inside = (p: VectorPolygon[], domain: VectorPolygon[]) =>
  regionBoolean(p, domain, "difference").reduce((n, r) => n + regionArea(r), 0) < 1e-5;

/** Rebuild the shared raster solver from polygon ownership and depth, with no source document. */
export function vectorHarborNavigation(plan: VectorHarborPlan, minimumDepth = 0, movingShipId?: string) {
  const n = plan.navigation;
  return polygonHarborWaterField(
    n.extentMeters,
    n.initialWater,
    [
      ...n.land.map(polygon => ({ polygon, water: false })),
      ...n.water.map(polygon => ({ polygon, water: true })),
      ...n.depths.filter(d => d.depthMeters < minimumDepth).map(d => ({ polygon: d.polygon, water: false })),
      ...plan.piers.map(p => ({ polygon: p.polygon, water: false })),
      ...plan.ships.filter(s => s.id !== movingShipId).map(s => ({ polygon: vectorShipFootprint(s, 2), water: false }))
    ],
    n.openBoundary
  );
}

/** An active operation is a solved physical connection, not merely a saved berth ID. */
export function activeVectorHarborCargo(plan: VectorHarborPlan, shipId: string) {
  const ship = plan.ships.find(s => s.id === shipId),
    a = ship?.cargo;
  if (!ship || !a) return;
  const q = plan.quays.find(q => q.id === a.berthId && q.craneId === a.craneId),
    crane = plan.cranes.find(c => c.id === a.craneId);
  const near = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.01;
  if (
    !q ||
    !crane ||
    ship.type !== a.shipType ||
    ship.waterId !== q.waterId ||
    ship.landId !== q.landId ||
    !near(ship.point, a.point) ||
    Math.abs(ship.rotation - a.rotation) > 0.001 ||
    Math.abs(ship.length - a.length) > 0.01 ||
    a.cargoAccessId !== `${ship.type}:deck-handover` ||
    !near(crane.point, q.axis) ||
    Math.abs(crane.armLengthMeters - q.reach) > 0.01 ||
    !near(
      [
        crane.point[0] + Math.cos(crane.armAngleRad) * crane.armLengthMeters,
        crane.point[1] + Math.sin(crane.armAngleRad) * crane.armLengthMeters
      ],
      a.hook
    ) ||
    Math.abs((crane.pulleyHeightMeters ?? 4.45) - q.pulleyHeight) > 0.01 ||
    Math.abs((crane.hookHeightMeters ?? 1.1) - q.transferHeight) > 0.01 ||
    (a.kind === "lighter-transfer" &&
      (ship.type !== "barge" ||
        !plan.ships.some(
          s => s.id === a.sourceShipId && s.type !== "barge" && !s.cargo && s.waterId === ship.waterId
        ))) ||
    (a.kind === "cargo-quay" && a.sourceShipId !== undefined)
  )
    return;
  const geometry = cargoShipGeometry(ship.type, ship.length),
    field = vectorHarborNavigation(plan, geometry.draft + 0.5, ship.id);
  const neighbours = plan.ships.filter(s => s.id !== ship.id);
  const obstacles = [...plan.piers.map(p => p.polygon.outer), ...neighbours.map(s => vectorShipFootprint(s, 2).outer)];
  const rigging = neighbours.map(s =>
    shipFootprint(
      s.point,
      s.rotation,
      s.length * (s.type === "barge" ? 1.1 : 1.5),
      cargoShipGeometry(s.type, s.length).beam * (s.type === "barge" ? 1.1 : 2)
    )
  );
  const depth = plan.navigation.depths.find(d => d.id === ship.waterId);
  const result = solveCargoBerth(
    { ...q, depth: Math.min(q.depth, depth?.depthMeters ?? 0) },
    ship.type,
    ship.length,
    (polygon, center, beam) =>
      field.navigable(center, beam / 2) &&
      inside([{ outer: polygon, holes: [] }], [{ outer: q.water, holes: [] }]) &&
      obstacles.every(p => !polygonsOverlap(polygon, p)),
    p =>
      rigging.every(
        polygon =>
          !polygonsOverlap(polygon, [
            [p[0] - 0.8, p[1] - 0.8],
            [p[0] + 0.8, p[1] - 0.8],
            [p[0] + 0.8, p[1] + 0.8],
            [p[0] - 0.8, p[1] + 0.8]
          ])
      )
  );
  if (
    !result ||
    !near(result.point, ship.point) ||
    Math.abs(result.rotation - ship.rotation) > 0.001 ||
    !near(result.assignment.hook, a.hook) ||
    !near(result.assignment.landDrop, a.landDrop) ||
    Math.abs(result.assignment.swingAngleRad - a.swingAngleRad) > 0.001
  )
    return;
  const turn: Point = [ship.point[0] + q.outward[0] * ship.length, ship.point[1] + q.outward[1] * ship.length];
  if (
    field.clearance(turn) < ship.length / 2 + 2 ||
    !field.navigable(turn, Math.max(SEA_CHANNEL_HALF_WIDTH, geometry.beam / 2 + 1))
  )
    return;
  return a;
}

export function harborReservations(plan: VectorHarborPlan): VectorPolygon[] {
  return [
    ...plan.spaces.map(s => s.polygon),
    ...plan.piers.map(p => p.polygon),
    ...plan.frontages.flatMap(f => defenseAccessSurface([f.a, f.b], Math.max(4, f.widthMeters))),
    ...plan.accesses.flatMap(a => defenseAccessSurface(a.points, Math.max(4, a.widthMeters))),
    ...plan.quays.flatMap(q => [
      { outer: q.reservedWater, holes: [] },
      circle(q.axis, q.reach + 1.5),
      circle(q.landDrop, 2)
    ]),
    ...plan.cranes.flatMap(c => [
      { outer: harborCraneFoundationFootprint(c.point, c.armAngleRad, 1), holes: [] },
      circle(c.point, Math.max(c.radiusMeters, c.armLengthMeters) + 1.5)
    ]),
    ...plan.cargoPiles.map(p => circle(p.point, p.widthMeters * Math.SQRT1_2 + 1)),
    ...plan.ships.map(s => vectorShipFootprint(s, 2)),
    ...plan.ships.filter(s => s.cargo).flatMap(s => defenseAccessSurface([s.cargo!.hook, s.cargo!.landDrop], 4))
  ];
}

export function validateVectorHarbor(doc: VectorCityDocument): string[] {
  const p = doc.environment?.harbor;
  if (p === undefined) return [];
  let stage = "header";
  try {
    const fail = () => {
      throw Error(stage);
    };
    const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
    const keys = (x: object, fields: string[]) => Object.keys(x).every(k => fields.includes(k));
    const number = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && Math.abs(x) <= 1e7;
    const positive = (x: unknown): x is number => number(x) && x > 0;
    const point = (x: unknown): x is Point => Array.isArray(x) && x.length === 2 && x.every(number);
    const line = (x: unknown, min = 2): x is Point[] =>
      Array.isArray(x) && x.length >= min && x.length <= 512 && x.every(point);
    const ring = (x: unknown): x is Point[] => line(x, 3) && simpleContour(x, true);
    const polygon = (x: unknown): x is VectorPolygon =>
      record(x) &&
      keys(x, ["outer", "holes"]) &&
      ring(x.outer) &&
      Array.isArray(x.holes) &&
      x.holes.length <= 64 &&
      x.holes.every(h => ring(h) && ringInside(h, x.outer as Point[]));
    const id = (x: unknown): x is string => typeof x === "string" && x.length > 0 && x.length <= 160;
    if (
      !record(p) ||
      !keys(p, [
        "id",
        "editPolicy",
        "navigation",
        "lands",
        "spaces",
        "frontages",
        "accesses",
        "piers",
        "cranes",
        "quays",
        "cargoPiles",
        "ships"
      ]) ||
      !id(p.id) ||
      p.editPolicy !== "fixed" ||
      doc.environment?.terrain
    )
      fail();
    for (const name of [
      "lands",
      "spaces",
      "frontages",
      "accesses",
      "piers",
      "cranes",
      "quays",
      "cargoPiles",
      "ships"
    ] as const)
      if (!Array.isArray(p[name]) || p[name].length > 256) fail();
    const n = p.navigation;
    if (
      !record(n) ||
      !keys(n, ["extentMeters", "initialWater", "openBoundary", "land", "water", "depths"]) ||
      !positive(n.extentMeters) ||
      n.extentMeters !== doc.frame.extentMeters ||
      n.extentMeters > 10000 ||
      typeof n.initialWater !== "boolean" ||
      typeof n.openBoundary !== "boolean"
    )
      fail();
    for (const name of ["land", "water"] as const)
      if (!Array.isArray(n[name]) || n[name].length > 256 || !n[name].every(polygon)) fail();
    if (
      !Array.isArray(n.depths) ||
      !n.depths.length ||
      n.depths.length > 256 ||
      n.depths.some(
        d =>
          !keys(d, ["id", "polygon", "depthMeters", "levelMeters"]) ||
          !id(d.id) ||
          !polygon(d.polygon) ||
          !positive(d.depthMeters) ||
          !number(d.levelMeters) ||
          !inside([d.polygon], n.water)
      )
    )
      fail();
    const siteWater = doc.site?.water.flatMap(w => w.polygons) ?? [];
    if (
      regionBoolean(n.land, n.water, "intersection").some(r => regionArea(r) > 1e-5) ||
      !inside(n.water, siteWater) ||
      !inside(siteWater, n.water) ||
      Object.values(doc.paths).some(path => path.role === "river")
    )
      fail();
    const ids = [
      p.id,
      ...n.depths.map(d => d.id),
      ...[...p.lands, ...p.spaces, ...p.accesses, ...p.piers, ...p.cranes, ...p.quays, ...p.cargoPiles, ...p.ships].map(
        x => x.id
      )
    ];
    if (!ids.every(id) || new Set(ids).size !== ids.length || !p.lands.length || !p.accesses.length) fail();
    const hasLand = (key: string) => p.lands.some(l => l.id === key),
      hasWater = (key: string) => n.depths.some(d => d.id === key);
    stage = "land-and-access";
    if (p.lands.some(l => !keys(l, ["id", "polygon"]) || !polygon(l.polygon) || !inside([l.polygon], n.land))) fail();
    for (const s of p.spaces)
      if (
        !keys(s, ["id", "landId", "kind", "polygon"]) ||
        !hasLand(s.landId) ||
        !["quay", "loading-yard"].includes(s.kind) ||
        !polygon(s.polygon) ||
        !inside(
          [s.polygon],
          p.lands.filter(l => l.id === s.landId).map(l => l.polygon)
        )
      )
        fail();
    for (const f of p.frontages)
      if (
        !keys(f, ["a", "b", "widthMeters", "cargo"]) ||
        !point(f.a) ||
        !point(f.b) ||
        !positive(f.widthMeters) ||
        (f.cargo !== undefined && typeof f.cargo !== "boolean")
      )
        fail();
    for (const a of p.accesses) {
      if (
        !keys(a, ["id", "points", "widthMeters", "road"]) ||
        !line(a.points) ||
        !positive(a.widthMeters) ||
        !record(a.road) ||
        !keys(a.road, ["pathId", "segmentId", "t"]) ||
        doc.paths[a.road.pathId]?.role !== "road" ||
        // A generated harbour hangs off the generated streets, which its generation owns (P5b).
        (doc.paths[a.road.pathId].editPolicy !== "fixed" &&
          !(p.id === "harbor:generated" && doc.paths[a.road.pathId].origin === "automatic"))
      )
        fail();
      const target = evaluateAnchor(doc.paths[a.road.pathId], a.road),
        end = a.points.at(-1)!;
      if (
        Math.hypot(end[0] - target[0], end[1] - target[1]) > 0.05 ||
        !inside(defenseAccessSurface(a.points, a.widthMeters), n.land)
      )
        fail();
    }
    stage = "port-geometry";
    for (const pier of p.piers)
      if (
        !keys(pier, ["id", "landId", "waterId", "polygon", "depthMeters"]) ||
        !hasLand(pier.landId) ||
        !hasWater(pier.waterId) ||
        !polygon(pier.polygon) ||
        !positive(pier.depthMeters)
      )
        fail();
    for (const c of p.cranes)
      if (
        !keys(c, [
          "id",
          "kind",
          "point",
          "armAngleRad",
          "radiusMeters",
          "armLengthMeters",
          "pulleyHeightMeters",
          "hookHeightMeters",
          "berthId"
        ]) ||
        !["treadwheel", "derrick", "romanMagnaRota"].includes(c.kind) ||
        !point(c.point) ||
        !number(c.armAngleRad) ||
        !positive(c.radiusMeters) ||
        !positive(c.armLengthMeters) ||
        (c.pulleyHeightMeters !== undefined && !positive(c.pulleyHeightMeters)) ||
        (c.hookHeightMeters !== undefined && !positive(c.hookHeightMeters)) ||
        (c.berthId !== undefined && !p.quays.some(q => q.id === c.berthId && q.craneId === c.id))
      )
        fail();
    for (const q of p.quays)
      if (
        !keys(q, [
          "id",
          "craneId",
          "landId",
          "waterId",
          "a",
          "b",
          "outward",
          "water",
          "depth",
          "axis",
          "reach",
          "pulleyHeight",
          "waterBelowQuay",
          "transferHeight",
          "landDrop",
          "swingDirections",
          "reservedWater"
        ]) ||
        !hasLand(q.landId) ||
        !hasWater(q.waterId) ||
        !p.cranes.some(c => c.id === q.craneId && c.berthId === q.id) ||
        ![q.a, q.b, q.outward, q.axis, q.landDrop].every(point) ||
        Math.abs(Math.hypot(...q.outward) - 1) > 1e-6 ||
        !ring(q.water) ||
        !ring(q.reservedWater) ||
        ![q.depth, q.reach, q.pulleyHeight, q.waterBelowQuay, q.transferHeight].every(positive) ||
        Math.abs(q.waterBelowQuay + (n.depths.find(d => d.id === q.waterId)?.levelMeters ?? Infinity)) > 0.01 ||
        !Array.isArray(q.swingDirections) ||
        !q.swingDirections.length ||
        q.swingDirections.some(d => d !== 1 && d !== -1) ||
        !inside([{ outer: q.water, holes: [] }], n.water) ||
        !containsRegion(
          p.lands.filter(l => l.id === q.landId).map(l => l.polygon),
          q.axis
        ) ||
        !containsRegion(
          p.lands.filter(l => l.id === q.landId).map(l => l.polygon),
          q.landDrop
        )
      )
        fail();
    for (const c of p.cargoPiles)
      if (
        !keys(c, ["id", "kind", "point", "widthMeters", "heightMeters", "rotation"]) ||
        !["crates", "barrels", "bales", "ballast"].includes(c.kind) ||
        !point(c.point) ||
        !positive(c.widthMeters) ||
        !positive(c.heightMeters) ||
        !number(c.rotation) ||
        !containsRegion(n.land, c.point)
      )
        fail();
    stage = "ships";
    for (const s of p.ships) {
      if (
        !keys(s, ["id", "type", "point", "rotation", "length", "state", "landId", "waterId", "cargo"]) ||
        !Object.hasOwn(SHIP_DIMENSIONS, s.type) ||
        !point(s.point) ||
        !number(s.rotation) ||
        !positive(s.length) ||
        s.length < SHIP_DIMENSIONS[s.type].minSizeMeters ||
        s.length > SHIP_DIMENSIONS[s.type].maxSizeMeters ||
        !validShipDisplayState(s.state) ||
        !keys(s.state, ["sails", "gunports"]) ||
        !hasLand(s.landId) ||
        !hasWater(s.waterId) ||
        !inside(
          [vectorShipFootprint(s)],
          n.depths.filter(d => d.id === s.waterId).map(d => d.polygon)
        )
      )
        fail();
      const dimension = cargoShipGeometry(s.type, s.length);
      if (!vectorHarborNavigation(p, dimension.draft + 0.5, s.id).navigable(s.point, dimension.beam / 2)) fail();
      if (
        p.piers.some(pier => polygonsOverlap(vectorShipFootprint(s).outer, pier.polygon.outer)) ||
        p.ships.some(
          other => other.id !== s.id && polygonsOverlap(vectorShipFootprint(s).outer, vectorShipFootprint(other).outer)
        )
      )
        fail();
      if (s.cargo) {
        const c = s.cargo;
        if (
          !keys(c, [
            "kind",
            "berthId",
            "craneId",
            "cargoAccessId",
            "shipType",
            "sourceShipId",
            "point",
            "rotation",
            "length",
            "hook",
            "landDrop",
            "swingAngleRad"
          ]) ||
          !["cargo-quay", "lighter-transfer"].includes(c.kind) ||
          ![c.point, c.hook, c.landDrop].every(point) ||
          ![c.rotation, c.length, c.swingAngleRad].every(number) ||
          !activeVectorHarborCargo(p, s.id)
        )
          fail();
      }
    }
  } catch (error) {
    return [`harbor:${stage}:${error instanceof Error ? error.message : "invalid"}`];
  }
  return [];
}
