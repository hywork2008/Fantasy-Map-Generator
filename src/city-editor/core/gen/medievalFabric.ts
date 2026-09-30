import { circuitRing } from "../fortifications";
import { facePoints } from "../mesh";
import { gatePlazaDisks } from "../passages";
import type { CityDocument, DistrictParameters, Id, Point } from "../types";
import type { DistrictFabric } from "./blockInfill";
import type { BuildingLot } from "./buildingLots";
import { buildingHitsCivicLandmark } from "./buildingLots";
import { defaultDistrictParameters, resolveDistricts } from "./fabricDistricts";
import { polygonBitesDisk } from "./gatePlazaBuildings";
import { nearestOnPolyline, pointInPolygon, polygonCentroid, segmentSegmentHit } from "./geom";
import { harborLaneRuns, planHarbor } from "./harborFabric";
import { convexInfillParts, longestFrame } from "./lotGeometry";
import { bounds, corridor, distance, intersectConvex, PlotIndex, plotArea } from "./parcelGeometry";
import type { OpenSpace, ParcelArchetype, ParcelFrontage, ParcelPlan } from "./parcelTypes";
import { makeRng } from "./prng";

/** Housing style must not change streets, their density, or gate approaches. */
export function medievalStreetDocument(document: CityDocument): CityDocument {
  return {
    ...document,
    buildingPattern: "legacy",
    fabric: document.fabric ? { ...document.fabric, version: 4 } : undefined
  };
}

interface House {
  index: number;
  lot: BuildingLot;
  center: Point;
  area: number;
}

/** Replace compact groups in established rows. Each replacement is a complete
 * large-building-and-yard composition, with a ward-level density budget. */
export function buildMedievalFabric(document: CityDocument, base: DistrictFabric): DistrictFabric {
  const seed = document.fabric?.seed ?? document.generationSeed ?? "medieval";
  const houses = base.buildings.map(
    (lot, index): House => ({ index, lot, center: polygonCentroid(lot.polygon), area: plotArea(lot.polygon) })
  );
  const houseIndex = new PlotIndex<House>();
  for (const house of houses) houseIndex.add(house, bounds(house.lot.polygon));
  const overlaps = (polygon: Point[], other: Point[]) =>
    convexInfillParts(other).some(part => plotArea(intersectConvex(polygon, part)) > 0.02);
  const _hitsHouse = (polygon: Point[]) =>
    houseIndex.query(bounds(polygon)).some(h => overlaps(polygon, h.lot.polygon));
  const fronts: ParcelFrontage[] = base.lanes.flatMap(l =>
    l.points.slice(1).map((b, i) => ({ a: l.points[i], b, widthMeters: l.widthMeters }))
  );
  const barriers: Point[][] = [];
  const throughStreets: ParcelFrontage[] = [];
  for (const group of document.featureGroups) {
    const segments: [Point, Point][] =
      group.kind === "river"
        ? group.vertices
            .slice(1)
            .map((v, i) => [document.mesh.vertices[group.vertices[i]].point, document.mesh.vertices[v].point])
        : group.segments.map(s => {
            const e = document.mesh.edges[s.edgeId];
            return [document.mesh.vertices[e.a].point, document.mesh.vertices[e.b].point];
          });
    for (const [a, b] of segments) {
      if (group.kind === "road" || group.kind === "plank") {
        const frontage = { a, b, widthMeters: group.style.widthMeters };
        fronts.push(frontage);
        throughStreets.push(frontage);
      } else barriers.push(corridor(a, b, group.style.widthMeters + 2));
    }
  }
  for (const circuit of document.defenseCircuits ?? [])
    if (circuit.scope === "castle") barriers.push(...convexInfillParts(circuitRing(document, circuit)));
  const gateDisks = gatePlazaDisks(document).map(d => ({ ...d, radius: d.radius + 6 }));
  const nearGate = (polygon: Point[]) =>
    gateDisks.some(d => pointInPolygon(d.center, polygon) || polygonBitesDisk(polygon, d, 0));
  const harbor = planHarbor(document, fronts, barriers, p => !nearGate(p), throughStreets);
  fronts.push(...harbor.frontages);
  markCargoNetwork(fronts, barriers);

  const craneForbiddenPolygons: Point[][] = harbor.cranes.map(c => {
    const r = c.radiusMeters + 3.0;
    return Array.from({ length: 8 }, (_, i) => {
      const a = (i * 2 * Math.PI) / 8;
      return [c.point[0] + Math.cos(a) * r, c.point[1] + Math.sin(a) * r] as Point;
    });
  });

  const forbidden = new PlotIndex<Point[]>();
  for (const poly of [
    ...barriers,
    ...fronts.map(f => corridor(f.a, f.b, f.widthMeters + 0.2)),
    ...harbor.spaces.map(s => s.polygon),
    ...craneForbiddenPolygons
  ])
    if (poly.length >= 3) forbidden.add(poly, bounds(poly));
  const frontIndex = new PlotIndex<ParcelFrontage>();
  for (const f of fronts) frontIndex.add(f, bounds(corridor(f.a, f.b, f.widthMeters + 4)));
  const parameters = new Map<Id, DistrictParameters>();
  for (const district of resolveDistricts(document, document.fabric))
    for (const id of district.faceIds) parameters.set(id, district.parameters);
  const landParts = new Map(
    Object.values(document.mesh.faces).map(f => [f.id, convexInfillParts(facePoints(document.mesh, f))])
  );
  const safe = (polygon: Point[], faceId: Id): boolean => {
    if (nearGate(polygon) || buildingHitsCivicLandmark(document, polygon)) return false;
    const area = plotArea(polygon);
    if ((landParts.get(faceId) ?? []).reduce((sum, p) => sum + plotArea(intersectConvex(polygon, p)), 0) < area - 0.02)
      return false;
    return !forbidden.query(bounds(polygon)).some(p => plotArea(intersectConvex(polygon, p)) > 0.02);
  };
  const replaced = new Set<number>();
  for (const anchor of houses) {
    const poly = anchor.lot.polygon;
    const hitsSpace = harbor.spaces.some(s => plotArea(intersectConvex(poly, s.polygon)) > 0.01);
    const hitsCrane = harbor.cranes.some(c => {
      const clearance = c.radiusMeters + 3.0;
      return (
        pointInPolygon(c.point, poly) || poly.some(pt => Math.hypot(pt[0] - c.point[0], pt[1] - c.point[1]) < clearance)
      );
    });
    const hitsCargo = harbor.cargoPiles.some(cp => {
      const r = Math.max(cp.widthMeters, cp.heightMeters) / 2 + 1.0;
      return (
        pointInPolygon(cp.point, poly) || poly.some(pt => Math.hypot(pt[0] - cp.point[0], pt[1] - cp.point[1]) < r)
      );
    });
    if (hitsSpace || hitsCrane || hitsCargo) {
      replaced.add(anchor.index);
    }
  }
  const parcels: ParcelPlan[] = [];
  const buildings: BuildingLot[] = [];
  const spaces: OpenSpace[] = [...harbor.spaces];
  const faceBudget = new Map<Id, number>();
  for (const h of houses) faceBudget.set(h.lot.faceId, (faceBudget.get(h.lot.faceId) ?? 0) + h.area);
  const usedArea = new Map<Id, number>();
  const roofLoss = new Map<Id, number>();
  for (const anchor of houses) {
    const face = document.mesh.faces[anchor.lot.faceId];
    if (
      !face?.properties.buildable ||
      face.properties.water !== "land" ||
      face.properties.settlement === "outskirts" ||
      anchor.lot.landmark ||
      replaced.has(anchor.index)
    )
      continue;
    const ward = face.properties.ward;
    if (!ward || !["merchant", "patriciate", "harbor", "craftsmen"].includes(ward)) continue;
    const params = parameters.get(face.id) ?? defaultDistrictParameters(face, document);
    const style =
      params.composition === "estates"
        ? "patriciate"
        : params.composition === "warehouses"
          ? "harbor"
          : params.composition === "commercial"
            ? "merchant"
            : ward;
    const share = style === "patriciate" ? 0.65 : style === "harbor" ? 0.5 : style === "merchant" ? 0.3 : 0.12;
    const garden = params.gardenAmount ?? 0.55;
    const targetCoverage = Math.max(
      0.55,
      params.parcelCoverage ?? 1 - garden * (style === "patriciate" ? 0.6 : style === "harbor" ? 0.5 : 0.35)
    );
    const lossLimit = style === "patriciate" ? 0.22 : style === "harbor" ? 0.2 : style === "merchant" ? 0.12 : 0.04;
    if ((usedArea.get(face.id) ?? 0) >= (faceBudget.get(face.id) ?? 0) * share) continue;
    const id = `compound:${face.id}:${anchor.center.map(v => v.toFixed(3)).join(":")}`;
    const rng = makeRng(`${seed}:${id}`);
    if (rng() > Math.min(1, share * 1.5)) continue;
    const near = frontIndex.query([
      anchor.center[0] - 18,
      anchor.center[1] - 18,
      anchor.center[0] + 18,
      anchor.center[1] + 18
    ]);
    const street = near
      .map(f => ({ f, hit: nearestOnPolyline(anchor.center, [f.a, f.b]) }))
      .sort((a, b) => a.hit.dist - b.hit.dist)[0];
    if (!street || street.hit.dist > 18 || (style === "harbor" && (!street.f.cargo || street.f.widthMeters < 2.5)))
      continue;
    const axis = longestFrame(anchor.lot.polygon).axis;
    const normal: Point = [-axis[1], axis[0]];
    const local = (p: Point): Point => [p[0] * axis[0] + p[1] * axis[1], p[0] * normal[0] + p[1] * normal[1]];
    const world = (x: number, y: number): Point => [x * axis[0] + y * normal[0], x * axis[1] + y * normal[1]];
    const rectangle = (box: [number, number, number, number]): Point[] => [
      world(box[0], box[1]),
      world(box[2], box[1]),
      world(box[2], box[3]),
      world(box[0], box[3])
    ];
    const group = [anchor];
    let box = bounds(anchor.lot.polygon.map(local));
    const fitRectangle = (candidate: [number, number, number, number], minimumArea: number) => {
      for (const inset of [0, 0.15, 0.3, 0.5, 0.75, 1]) {
        const fitted: [number, number, number, number] = [
          candidate[0] + inset,
          candidate[1] + inset,
          candidate[2] - inset,
          candidate[3] - inset
        ];
        const polygon = rectangle(fitted);
        if (plotArea(polygon) < minimumArea) break;
        if (safe(polygon, face.id)) return fitted;
      }
      return null;
    };
    const radius = style === "patriciate" ? 35 : 25;
    const neighbors = houseIndex
      .query([
        anchor.center[0] - radius,
        anchor.center[1] - radius,
        anchor.center[0] + radius,
        anchor.center[1] + radius
      ])
      .filter(
        h =>
          h !== anchor &&
          h.lot.faceId === face.id &&
          !h.lot.landmark &&
          !replaced.has(h.index) &&
          distance(h.center, anchor.center) <= radius
      )
      .sort((a, b) => distance(a.center, anchor.center) - distance(b.center, anchor.center));
    const desiredCount =
      style === "craftsmen"
        ? 3
        : 4 + Math.floor(rng() * (style === "patriciate" ? 6 : 4) * (0.3 + (params.sizeVariation ?? 0.7)));
    const maximum = Math.min(
      desiredCount,
      Math.max(
        2,
        Math.floor(
          ((faceBudget.get(face.id) ?? 0) * lossLimit - (roofLoss.get(face.id) ?? 0)) /
            (anchor.area * Math.max(0.05, 1 - targetCoverage))
        )
      )
    );
    for (const h of neighbors) {
      if (group.length >= maximum) break;
      const a = longestFrame(h.lot.polygon).axis;
      if (Math.abs(a[0] * axis[0] + a[1] * axis[1]) < 0.97 && Math.abs(a[0] * normal[0] + a[1] * normal[1]) < 0.97)
        continue;
      const b = bounds(h.lot.polygon.map(local));
      const gap = Math.hypot(Math.max(0, b[0] - box[2], box[0] - b[2]), Math.max(0, b[1] - box[3], box[1] - b[3]));
      if (gap > 1.8) continue;
      const next: [number, number, number, number] = [
        Math.min(box[0], b[0]),
        Math.min(box[1], b[1]),
        Math.max(box[2], b[2]),
        Math.max(box[3], b[3])
      ];
      const area = (next[2] - next[0]) * (next[3] - next[1]);
      if (area > 1800 || group.reduce((s, g) => s + g.area, h.area) / area < 0.72) continue;
      const fitted = fitRectangle(next, group.reduce((s, g) => s + g.area, h.area) * 0.75);
      if (!fitted) continue;
      const proposed = rectangle(fitted);
      const members = new Set([...group.map(g => g.index), h.index]);
      if (
        houseIndex
          .query(bounds(proposed))
          .some(other => !members.has(other.index) && overlaps(proposed, other.lot.polygon))
      )
        continue;
      box = fitted;
      group.push(h);
    }
    if (group.length < 2) continue;
    const parcelPolygon = rectangle(box);
    const oldArea = group.reduce((sum, h) => sum + h.area, 0);
    const members = new Set(group.map(h => h.index));
    if (
      houseIndex.query(bounds(parcelPolygon)).some(h => !members.has(h.index) && overlaps(parcelPolygon, h.lot.polygon))
    )
      continue;
    let mainBox = box;
    let accessPoints: Point[] = [];
    const yardPolygons: Point[][] = [];
    if (garden > 0 && style !== "craftsmen") {
      const centers: Point[] = [
        world((box[0] + box[2]) / 2, box[3]),
        world((box[0] + box[2]) / 2, box[1]),
        world(box[2], (box[1] + box[3]) / 2),
        world(box[0], (box[1] + box[3]) / 2)
      ];
      const sides = [0, 1, 2, 3].sort(
        (a, b) => distance(centers[b], street.hit.point) - distance(centers[a], street.hit.point)
      );
      let found = false;
      layoutOptions: for (const side of sides) {
        for (const high of style === "harbor" ? [true, false] : [true]) {
          const alongY = side < 2;
          const span = alongY ? box[3] - box[1] : box[2] - box[0];
          const depth = Math.max(3, span * (1 - targetCoverage));
          if (depth > span * 0.45) continue;
          const main: [number, number, number, number] = [...box];
          const yard: [number, number, number, number] = [...box];
          if (side === 0) {
            main[3] -= depth;
            yard[1] = main[3];
          }
          if (side === 1) {
            main[1] += depth;
            yard[3] = main[1];
          }
          if (side === 2) {
            main[2] -= depth;
            yard[0] = main[2];
          }
          if (side === 3) {
            main[0] += depth;
            yard[2] = main[0];
          }
          const passage: [number, number, number, number] = [...main];
          if (style === "harbor") {
            if (alongY) {
              if (high) {
                main[2] -= 3;
                passage[0] = main[2];
              } else {
                main[0] += 3;
                passage[2] = main[0];
              }
            } else {
              if (high) {
                main[3] -= 3;
                passage[1] = main[3];
              } else {
                main[1] += 3;
                passage[3] = main[1];
              }
            }
          }
          const w = main[2] - main[0],
            d = main[3] - main[1];
          if (
            Math.min(w, d) < 4 ||
            Math.max(w, d) / Math.min(w, d) > 5 ||
            w * d < Math.max(90, Math.max(...group.map(h => h.area)) * 2)
          )
            continue;
          if (style === "harbor") {
            const yardCenter = polygonCentroid(rectangle(yard));
            const passagePolygon = rectangle(passage);
            const mids = passagePolygon.map(
              (a, i): Point => [
                (a[0] + passagePolygon[(i + 1) % 4][0]) / 2,
                (a[1] + passagePolygon[(i + 1) % 4][1]) / 2
              ]
            );
            const exit = mids.reduce(
              (best, p, i) => (distance(p, yardCenter) < distance(mids[best], yardCenter) ? i : best),
              0
            );
            const entry = mids[(exit + 2) % 4];
            const hit = nearestOnPolyline(entry, [street.f.a, street.f.b]).point;
            accessPoints = [hit, entry, mids[exit], yardCenter];
            const routes = accessPoints
              .slice(1)
              .map((p, i) => corridor(accessPoints[i], p, 2.5))
              .filter(p => p.length >= 3);
            if (
              routes.some(
                route =>
                  overlaps(route, rectangle(main)) ||
                  barriers.some(b => overlaps(route, b)) ||
                  houseIndex.query(bounds(route)).some(h => !members.has(h.index) && overlaps(route, h.lot.polygon))
              )
            )
              continue;
          }

          mainBox = main;
          yardPolygons.push(rectangle(yard));
          if (style === "harbor") yardPolygons.push(rectangle(passage));
          found = true;
          break layoutOptions;
        }
      }
      if (!found) continue;
    }
    const polygon = rectangle(mainBox);
    const roofArea = plotArea(polygon);
    if (
      roofArea < Math.max(90, Math.max(...group.map(h => h.area)) * 2) ||
      (roofLoss.get(face.id) ?? 0) + Math.max(0, oldArea - roofArea) > (faceBudget.get(face.id) ?? 0) * lossLimit
    )
      continue;
    if (!accessPoints.length) accessPoints = [street.hit.point, polygonCentroid(polygon)];
    const kind: ParcelArchetype =
      style === "patriciate"
        ? roofArea >= 400
          ? "elite-compound"
          : "patrician-house"
        : style === "harbor"
          ? "warehouse-compound"
          : style === "merchant"
            ? "merchant-house"
            : "workshop-house";
    const lot: BuildingLot = {
      faceId: face.id,
      polygon,
      landmark: false,
      id: `${id}:main`,
      parcelId: id,
      archetype: kind,
      role: "main",
      uses:
        style === "harbor" ? ["storage"] : style === "craftsmen" ? ["residential", "craft"] : ["residential", "retail"],
      storeys: style === "patriciate" ? 3 : 2
    };
    const openSpaces: OpenSpace[] = yardPolygons.map((polygon, i) => ({
      id: `${id}:yard:${i}`,
      faceId: face.id,
      parcelId: id,
      polygon,
      kind: style === "harbor" ? "loading-yard" : style === "patriciate" ? "formal-garden" : "courtyard",
      access: style === "harbor" && params.harborPreset !== "small" ? "shared" : "private"
    }));
    for (const h of group) replaced.add(h.index);
    roofLoss.set(face.id, (roofLoss.get(face.id) ?? 0) + Math.max(0, oldArea - roofArea));
    usedArea.set(face.id, (usedArea.get(face.id) ?? 0) + oldArea);
    forbidden.add(parcelPolygon, bounds(parcelPolygon));
    buildings.push(lot);
    spaces.push(...openSpaces);
    harbor.spaces.push(...openSpaces.filter(s => s.access === "shared"));
    parcels.push({
      id,
      faceIds: [face.id],
      ward,
      archetype: kind,
      polygon: parcelPolygon,
      buildings: [lot],
      openSpaces,
      access: [
        {
          kind: style === "harbor" ? "cargo" : "street",
          points: accessPoints,
          widthMeters: style === "harbor" ? 2.5 : 1.2
        }
      ]
    });
  }
  harbor.sharedArea = harbor.spaces.reduce((sum, s) => sum + plotArea(s.polygon), 0);
  return {
    ...base,
    buildings: [...base.buildings.filter((_, i) => !replaced.has(i)), ...buildings],
    // The apron itself provides access: residential subdivision lanes end at
    // its edge. Retain the warehouse/back-street network elsewhere in the cell.
    lanes: base.lanes.flatMap(lane => {
      const localSpaces = harbor.spaces.filter(s => s.faceId === lane.faceId);
      const runs = localSpaces.length ? harborLaneRuns(lane.points, localSpaces) : [lane.points];
      return runs.map(points => ({ ...lane, points }));
    }),
    parcels,
    openSpaces: spaces,
    harbor
  };
}

/** Flood only streets wide enough for cargo. A geometric distance to the quay
 * cannot establish access across a wall, water or a disconnected street. */
function markCargoNetwork(fronts: ParcelFrontage[], barriers: Point[][]): void {
  if (!fronts.some(f => f.cargo)) return;
  const barrierIndex = new PlotIndex<Point[]>();
  for (const barrier of barriers) barrierIndex.add(barrier, bounds(barrier));
  const index = new PlotIndex<number>();
  const parents = fronts.map((_, i) => i);
  const root = (i: number): number => {
    while (parents[i] !== i) {
      parents[i] = parents[parents[i]];
      i = parents[i];
    }
    return i;
  };
  for (let i = 0; i < fronts.length; i++) {
    const f = fronts[i];
    if (f.widthMeters < 2.5) continue;
    const box = bounds(corridor(f.a, f.b, f.widthMeters + 0.1, f.widthMeters / 2));
    for (const j of index.query(box)) {
      const g = fronts[j];
      const gap = segmentSegmentHit(f.a, f.b, g.a, g.b)
        ? 0
        : Math.min(
            nearestOnPolyline(f.a, [g.a, g.b]).dist,
            nearestOnPolyline(f.b, [g.a, g.b]).dist,
            nearestOnPolyline(g.a, [f.a, f.b]).dist,
            nearestOnPolyline(g.b, [f.a, f.b]).dist
          );
      if (gap > (f.widthMeters + g.widthMeters) / 2 + 0.05) continue;
      const crossing = segmentSegmentHit(f.a, f.b, g.a, g.b);
      const links: [Point, Point][] = crossing
        ? [[crossing.point, crossing.point]]
        : [
            [f.a, nearestOnPolyline(f.a, [g.a, g.b]).point],
            [f.b, nearestOnPolyline(f.b, [g.a, g.b]).point],
            [g.a, nearestOnPolyline(g.a, [f.a, f.b]).point],
            [g.b, nearestOnPolyline(g.b, [f.a, f.b]).point]
          ];
      const link = links.sort((a, b) => distance(...a) - distance(...b))[0];
      const linkBox = bounds([link[0], link[1]]);
      const blocked = barrierIndex
        .query([linkBox[0] - 0.1, linkBox[1] - 0.1, linkBox[2] + 0.1, linkBox[3] + 0.1])
        .some(b =>
          distance(...link) < 1e-6
            ? pointInPolygon(link[0], b)
            : plotArea(intersectConvex(corridor(...link, 0.1), b)) > 0.001
        );
      if (!blocked) parents[root(i)] = root(j);
    }
    index.add(i, box);
  }
  const cargo = new Set(fronts.flatMap((f, i) => (f.cargo ? [root(i)] : [])));
  fronts.forEach((f, i) => {
    if (cargo.has(root(i)) && f.widthMeters >= 2.5) f.cargo = true;
  });
}
