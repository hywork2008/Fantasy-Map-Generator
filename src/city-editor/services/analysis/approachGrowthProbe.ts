/**
 * City Editor probe for the Approach Traffic Observatory (docs/plan/approach-traffic-observatory.md
 * §7.2): generates a town from a loaded world exactly as the CE hand-off does and reports, per
 * approach id, how far CE grew it (ribbon budget and length, lots in the ribbon, gate inns, cobbles).
 */
import { getBurgSiteDescriptor } from "../../../services/burgSiteDescriptor";
import { buildBlockFabric } from "../../generators/blockInfill";
import { generateCityOnDocument } from "../../generators/generation/generateCity";
import { polygonCentroid } from "../../generators/geom";
import { FabricCache } from "../../generators/localInfill";
import { cobbledApproach, roadUse } from "../../generators/roadTraffic";
import { polylineArc } from "../../generators/urbanGrowth";
import type { Point } from "../../types/primitives";
import { parseIncomingPayload } from "../io/incomingCity";
import { cityEditorDocument, cityEditorSettings } from "./housingReport";

export interface ApproachGrowth {
  approachId: string;
  routeId: number;
  group: string;
  /** Route ids bundled at a shared crossing (CE keys those by `crossing:<c>`). */
  sharedRouteIds: number[] | null;
  azimuth: number;
  traffic: number | null;
  trafficRank: number | null;
  cobbled: boolean;
  ribbonBudget: number;
  ribbonLength: number;
  ribbonWeight: number;
  lots: number;
  gateInns: number;
}

export interface BurgGrowthProbe {
  burgId: number;
  name: string;
  status: "generated" | "rejected" | "error";
  error?: string;
  ms: number;
  population: number | null;
  /** False when urban morphology drives growth: the descriptor then carries no route traffic. */
  usesTraffic: boolean | null;
  approaches: ApproachGrowth[];
}

function nearestRoad(point: Point, paths: Point[][]): number {
  let best = -1;
  let bestDistance = Infinity;
  paths.forEach((path, index) => {
    if (path.length < 2) return;
    const { distance } = polylineArc(point, path);
    if (distance < bestDistance) [best, bestDistance] = [index, distance];
  });
  return best;
}

export function probeBurgGrowth(burgId: number): BurgGrowthProbe {
  const started = performance.now();
  const base = { burgId, name: "", population: null, usesTraffic: null, approaches: [] as ApproachGrowth[] };
  try {
    const descriptor = getBurgSiteDescriptor(burgId);
    if (!descriptor) throw new Error("No site descriptor");
    base.name = descriptor.burg.name ?? "";
    const share = parseIncomingPayload(JSON.stringify(descriptor));
    if (!share?.descriptor) throw new Error("Invalid descriptor");
    const city = generateCityOnDocument(cityEditorDocument(share), cityEditorSettings(share), share.seed, () => {});
    const roads = descriptor.roads ?? [];
    const rows: ApproachGrowth[] = roads.map((road, index) => ({
      approachId: road.approachId ?? `index:${index}`,
      routeId: road.routeId,
      group: road.group,
      sharedRouteIds: road.sharedRouteIds ?? null,
      azimuth: road.entryAzimuthDeg,
      traffic: road.traffic ?? null,
      trafficRank: road.trafficRank ?? null,
      cobbled: city ? cobbledApproach(roadUse(city, index, road.routeId)) : false,
      ribbonBudget: 0,
      ribbonLength: 0,
      ribbonWeight: 0,
      lots: 0,
      gateInns: 0
    }));
    if (!city)
      return {
        ...base,
        status: "rejected",
        ms: performance.now() - started,
        population: descriptor.burg.population,
        approaches: rows
      };
    const byId = new Map(rows.map(row => [row.approachId, row]));
    const ribbons = (city.urbanGrowth?.regions ?? []).filter(
      region => region.kind === "approachRibbon" && region.approachId
    );
    for (const region of ribbons) {
      const row = byId.get(region.approachId!);
      if (!row) continue;
      row.ribbonBudget += region.budget;
      row.ribbonLength += region.length;
      row.ribbonWeight = Math.max(row.ribbonWeight, region.weight);
    }
    const fabric = buildBlockFabric(city, new FabricCache());
    for (const lot of fabric.buildings) {
      const centre = polygonCentroid(lot.polygon);
      const region = ribbons.find(r => {
        const hit = polylineArc(centre, r.points);
        return hit.distance <= r.halfWidth && hit.s >= r.start && hit.s <= r.start + r.length;
      });
      const row = region && byId.get(region.approachId!);
      if (row) row.lots++;
    }
    const paths = roads.map(road => road.path as Point[]);
    for (const inn of fabric.aerialLandmarks?.gateInns ?? []) {
      const index = nearestRoad(polygonCentroid(inn.footprint), paths);
      if (index >= 0) rows[index].gateInns++;
    }
    return {
      ...base,
      status: "generated",
      ms: performance.now() - started,
      population: city.populationReport?.targetPopulation ?? descriptor.burg.population,
      usesTraffic: !city.urbanMorphology,
      approaches: rows
    };
  } catch (error) {
    return {
      ...base,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
      ms: performance.now() - started
    };
  }
}
