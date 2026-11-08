import RBush from "rbush";
import { residentialStoreys } from "../../../../utils/urbanMorphology";
import type { VectorCityDocument } from "../../../types/vector/document";
import type { VectorStage } from "../../../types/vector/urban";
import { polygonArea } from "../../geom";
import { dwellingCapacity } from "../../residentialCapacityFormula";
import {
  allocateVectorResidents,
  VECTOR_HOUSE_FLOOR_AREA,
  VECTOR_HOUSE_SHARE,
  VECTOR_HOUSE_STOREYS,
  vectorHouseDwellings,
  vectorPlacementDwellings
} from "../generation/urbanCapacity";
import { matchesVectorUrbanFingerprint } from "../generation/urbanState";
import { evaluateAnchor } from "../geometry/curves";
import { containsRegion, regionArea, regionBoolean } from "../geometry/regions";
import { simpleContour } from "../geometry/surfaces";
import { validateVectorGeneration } from "./generation";

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: unknown, names: string, optional = "") =>
  object(v) &&
  names.split(",").every(k => Object.hasOwn(v, k)) &&
  Object.keys(v).every(k => [...names.split(","), ...optional.split(",")].includes(k));
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1e8;
const point = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && v.every(finite);
const id = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,127}$/.test(v) &&
  !["__proto__", "constructor", "prototype"].includes(v);
const nonnegative = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const polygon = (v: unknown) =>
  keys(v, "outer,holes") &&
  object(v) &&
  Array.isArray(v.outer) &&
  v.outer.length >= 3 &&
  v.outer.length <= 16000 &&
  v.outer.every(point) &&
  simpleContour(v.outer, true) &&
  Math.abs(polygonArea(v.outer)) > 1e-12 &&
  Array.isArray(v.holes) &&
  v.holes.every(
    h =>
      Array.isArray(h) && h.every(point) && h.length >= 3 && simpleContour(h, true) && Math.abs(polygonArea(h)) > 1e-12
  );
export function vectorUrbanStages(mode: "medieval" | "medieval-facilities"): VectorStage[] {
  return [
    "inputs",
    "skeleton",
    "regions",
    "blocksAndLanes",
    ...(mode === "medieval-facilities" ? ["facilities" as const] : []),
    "housing"
  ];
}
export function validateVectorUrban(doc: VectorCityDocument): string[] {
  const errors: string[] = [];
  for (const p of Object.values(doc.placements))
    if (p.building) {
      const b = p.building;
      if (
        !keys(
          b,
          "kind,label,districtId,provenance,dimensionSource,footprint,reserved,entrances,dwellings,floorFootprintMeters2,storeys,residentialShare",
          "pool,riverbankDistanceMeters,heightMeters"
        ) ||
        !["facility", "housing"].includes(b.kind) ||
        typeof b.label !== "string" ||
        b.label.length > 256 ||
        !id(b.districtId) ||
        !["bv", "provisional"].includes(b.provenance) ||
        typeof b.dimensionSource !== "string" ||
        b.dimensionSource.length > 500 ||
        !Array.isArray(b.footprint) ||
        !b.footprint.length ||
        !b.footprint.every(polygon) ||
        !Array.isArray(b.reserved) ||
        !b.reserved.length ||
        !b.reserved.every(polygon) ||
        !Array.isArray(b.entrances) ||
        !b.entrances.length ||
        !b.entrances.every(
          e =>
            keys(e, "id,point,outward,widthMeters,connector,accessIndex") &&
            typeof e.id === "string" &&
            point(e.point) &&
            point(e.outward) &&
            Math.hypot(...e.outward) > 0.9 &&
            finite(e.widthMeters) &&
            e.widthMeters > 0 &&
            Array.isArray(e.connector) &&
            e.connector.length >= 2 &&
            e.connector.every(point) &&
            nonnegative(e.accessIndex) &&
            e.accessIndex < p.accesses.length
        ) ||
        !nonnegative(b.dwellings) ||
        !finite(b.floorFootprintMeters2) ||
        b.floorFootprintMeters2 < 0 ||
        !nonnegative(b.storeys) ||
        b.storeys > 5 ||
        !finite(b.residentialShare) ||
        b.residentialShare < 0 ||
        b.residentialShare > 1 ||
        (b.heightMeters !== undefined && (!finite(b.heightMeters) || b.heightMeters <= 0 || b.heightMeters > 500)) ||
        (b.pool !== undefined && typeof b.pool !== "string") ||
        (b.riverbankDistanceMeters !== undefined &&
          (!finite(b.riverbankDistanceMeters) || b.riverbankDistanceMeters < 0)) ||
        (b.kind === "housing" &&
          (p.modelId === "ce-perimeter-house"
            ? b.storeys !== residentialStoreys(doc.context.historicalPeriod).standard ||
              Math.abs(b.floorFootprintMeters2 - b.footprint.reduce((n, p) => n + regionArea(p), 0)) > 1e-5 ||
              b.dwellings !== dwellingCapacity(b.floorFootprintMeters2, b.storeys, b.residentialShare)
            : b.storeys !== VECTOR_HOUSE_STOREYS ||
              b.floorFootprintMeters2 !== VECTOR_HOUSE_FLOOR_AREA ||
              b.residentialShare !== VECTOR_HOUSE_SHARE ||
              b.dwellings !== vectorHouseDwellings())) ||
        (b.kind === "facility" && (b.dwellings > 1 || (b.dwellings > 0 && !p.modelId.startsWith("trade-workhome."))))
      )
        errors.push(`building:${p.id}`);
    }
  const u = doc.urban;
  if (!u || errors.length) return errors;
  for (const name of ["domain", "laneBlocks", "residualLand"] as const)
    if (Array.isArray(u[name])) {
      const invalid = u[name].findIndex(p => !polygon({ outer: p.outer, holes: p.holes }));
      if (invalid >= 0) return [`urban-${name}:${invalid}`];
    }
  if (
    !doc.generation ||
    !doc.site ||
    !keys(
      u,
      "algorithm,inputRevision,settings,baseGeneration,baseConnections,baseContext,domain,laneBlocks,residualLand,districts,ownedPaths,ownedPlacements,adoptedFingerprint,checkpoints,assignments,report"
    ) ||
    (u.algorithm !== "vector-urban-v1" && u.algorithm !== "vector-urban-v2") ||
    !nonnegative(u.inputRevision) ||
    !keys(
      u.settings,
      "mode,population,houseModelId,laneWidthMeters,laneSpacingMeters,maxLanes,clearanceMeters,allowExpansion"
    ) ||
    !["medieval", "medieval-facilities"].includes(u.settings.mode) ||
    !nonnegative(u.settings.population) ||
    u.settings.population > 220000 ||
    !id(u.settings.houseModelId) ||
    !finite(u.settings.laneWidthMeters) ||
    u.settings.laneWidthMeters < 1.4 ||
    u.settings.laneWidthMeters > 6 ||
    !finite(u.settings.laneSpacingMeters) ||
    u.settings.laneSpacingMeters < 15 ||
    u.settings.laneSpacingMeters > 100 ||
    !nonnegative(u.settings.maxLanes) ||
    u.settings.maxLanes > 64 ||
    !finite(u.settings.clearanceMeters) ||
    u.settings.clearanceMeters < 0.2 ||
    u.settings.clearanceMeters > 5 ||
    typeof u.settings.allowExpansion !== "boolean" ||
    !object(u.baseGeneration) ||
    !object(u.baseContext) ||
    !keys(u.baseConnections, "nodes,edges,gates,circuits,bridges,wallRoads") ||
    !Object.values(u.baseConnections).every(object) ||
    !Array.isArray(u.domain) ||
    !u.domain.every(polygon) ||
    !Array.isArray(u.laneBlocks) ||
    !u.laneBlocks.every(b => id(b.id) && polygon({ outer: b.outer, holes: b.holes })) ||
    !Array.isArray(u.residualLand) ||
    !u.residualLand.every(polygon) ||
    !Array.isArray(u.districts) ||
    !u.districts.every(
      d =>
        keys(d, "id,use,inside,polygon") &&
        id(d.id) &&
        ["commerce", "craft", "hazard", "river", "residential"].includes(d.use) &&
        typeof d.inside === "boolean" &&
        polygon(d.polygon)
    ) ||
    !Array.isArray(u.ownedPaths) ||
    !u.ownedPaths.every(id) ||
    !Array.isArray(u.ownedPlacements) ||
    !u.ownedPlacements.every(id) ||
    typeof u.adoptedFingerprint !== "string" ||
    u.adoptedFingerprint.length > 5e6 ||
    !Array.isArray(u.checkpoints) ||
    !Array.isArray(u.assignments) ||
    !keys(
      u.report,
      "targetPopulation,requiredDwellings,capacityDwellings,assignedDwellings,unplacedDwellings,assignedPopulation,unplacedPopulation,mixedDwellings,capacityInside,capacityOutside,requiredFacilities,placedFacilities,provisionalFacilities,unplacedFacilities,housingBuildings,reasons"
    )
  )
    return ["urban-data"];
  if (u.checkpoints.map(c => c.id).join() !== vectorUrbanStages(u.settings.mode).join()) errors.push("urban-stages");
  for (const c of u.checkpoints)
    if (
      !keys(c, "id,pathIds,placementIds,capacityDwellings,assignedDwellings,assignedPopulation,unplacedPopulation") ||
      !Array.isArray(c.pathIds) ||
      !c.pathIds.every(id) ||
      !Array.isArray(c.placementIds) ||
      !c.placementIds.every(id) ||
      ![c.capacityDwellings, c.assignedDwellings, c.assignedPopulation, c.unplacedPopulation].every(nonnegative)
    )
      errors.push("urban-checkpoint");
  if (
    !u.assignments.every(
      a =>
        keys(a, "placementId,dwellings,population") &&
        id(a.placementId) &&
        nonnegative(a.dwellings) &&
        nonnegative(a.population)
    )
  )
    errors.push("urban-assignment");
  const r = u.report;
  if (
    !Object.entries(r)
      .filter(([k]) => !["unplacedFacilities", "reasons"].includes(k))
      .every(([, v]) => nonnegative(v)) ||
    !Array.isArray(r.unplacedFacilities) ||
    !r.unplacedFacilities.every(
      f => keys(f, "id,reason") && id(f.id) && ["space", "river", "district", "budget", "unsearched"].includes(f.reason)
    ) ||
    !Array.isArray(r.reasons) ||
    !r.reasons.every(k => typeof k === "string")
  )
    errors.push("urban-report");
  if (errors.length) return errors;
  if (
    r.assignedDwellings + r.unplacedDwellings !== r.requiredDwellings ||
    r.assignedPopulation + r.unplacedPopulation !== r.targetPopulation ||
    r.placedFacilities + r.unplacedFacilities.length !== r.requiredFacilities ||
    r.capacityInside + r.capacityOutside !== r.capacityDwellings
  )
    errors.push("urban-totals");
  const baseline = {
    ...doc,
    paths: Object.fromEntries(Object.entries(doc.paths).filter(([id]) => !u.ownedPaths.includes(id))),
    placements: Object.fromEntries(Object.entries(doc.placements).filter(([id]) => !u.ownedPlacements.includes(id))),
    connections: u.baseConnections,
    context: u.baseContext,
    generation: u.baseGeneration
  };
  if (validateVectorGeneration(baseline).length) errors.push("urban-baseline");
  if (u.inputRevision === doc.revision) {
    if (
      !matchesVectorUrbanFingerprint(doc, u.adoptedFingerprint) ||
      u.ownedPaths.some(id => !doc.paths[id]) ||
      u.ownedPlacements.some(id => !doc.placements[id])
    )
      errors.push("urban-ownership");
    for (const c of u.checkpoints) {
      if (
        c.pathIds.some(id => !doc.paths[id]) ||
        c.placementIds.some(id => !doc.placements[id]) ||
        new Set(c.placementIds).size !== c.placementIds.length ||
        c.capacityDwellings !== c.placementIds.reduce((n, id) => n + vectorPlacementDwellings(doc.placements[id]), 0)
      )
        errors.push("urban-visible-capacity");
    }
    const owned = u.ownedPlacements.map(id => doc.placements[id]);
    if (
      new Set(u.ownedPaths).size !== u.ownedPaths.length ||
      new Set(u.ownedPlacements).size !== u.ownedPlacements.length ||
      owned.some(p => !p?.building) ||
      u.settings.population !== r.targetPopulation ||
      r.capacityDwellings !== Object.values(doc.placements).reduce((n, p) => n + vectorPlacementDwellings(p), 0) ||
      owned.filter(p => p?.building?.kind === "facility").length !== r.placedFacilities ||
      owned.filter(p => p?.building?.kind === "housing").length !== r.housingBuildings
    )
      errors.push("urban-result");
    const tree = new RBush<{
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
      id: string;
      polygon: { outer: [number, number][]; holes: [number, number][][] };
    }>();
    for (const p of Object.values(doc.placements))
      for (const polygon of p.building?.reserved ?? [p.site]) {
        const box = {
          minX: Math.min(...polygon.outer.map(p => p[0])),
          minY: Math.min(...polygon.outer.map(p => p[1])),
          maxX: Math.max(...polygon.outer.map(p => p[0])),
          maxY: Math.max(...polygon.outer.map(p => p[1]))
        };
        if (
          tree
            .search(box)
            .some(
              q =>
                q.id !== p.id && regionBoolean([polygon], [q.polygon], "intersection").some(r => regionArea(r) > 1e-5)
            )
        )
          errors.push("urban-overlap");
        tree.insert({ ...box, id: p.id, polygon });
        if (
          u.ownedPlacements.includes(p.id) &&
          regionBoolean([polygon], u.domain, "difference").some(r => regionArea(r) > 1e-5)
        )
          errors.push("urban-domain");
      }
    for (const p of owned) {
      if (!p?.building) continue;
      const b = p.building;
      if (
        regionBoolean(b.footprint, [p.site], "difference").some(r => regionArea(r) > 1e-5) ||
        regionBoolean([p.site], b.reserved, "difference").some(r => regionArea(r) > 1e-5)
      )
        errors.push("urban-footprint");
      for (const entrance of b.entrances) {
        const a = p.accesses[entrance.accessIndex],
          end = evaluateAnchor(doc.paths[a.pathId], a),
          last = entrance.connector.at(-1)!;
        if (
          doc.paths[a.pathId].role !== "road" ||
          Math.hypot(end[0] - last[0], end[1] - last[1]) > 1e-5 ||
          !containsRegion(b.reserved, entrance.point)
        )
          errors.push("urban-entrance");
      }
    }
    for (const c of u.checkpoints) {
      if (
        c.placementIds.some(
          id =>
            u.ownedPlacements.includes(id) &&
            c.id !== "housing" &&
            (c.id !== "facilities" || doc.placements[id]?.building?.kind !== "facility")
        )
      )
        errors.push("urban-stage-order");
      const allocation = allocateVectorResidents(doc, c.placementIds, r.requiredDwellings, r.targetPopulation);
      if (
        c.assignedDwellings !== allocation.assignedDwellings ||
        c.assignedPopulation !== allocation.assignedPopulation ||
        c.unplacedPopulation !== allocation.unplacedPopulation
      )
        errors.push("urban-stage-population");
    }
    if (
      u.assignments.some(
        a => !doc.placements[a.placementId] || a.dwellings > vectorPlacementDwellings(doc.placements[a.placementId])
      ) ||
      u.assignments.reduce((n, a) => n + a.dwellings, 0) !== r.assignedDwellings ||
      u.assignments.reduce((n, a) => n + a.population, 0) !== r.assignedPopulation
    )
      errors.push("urban-assignment");
  }
  return errors;
}
