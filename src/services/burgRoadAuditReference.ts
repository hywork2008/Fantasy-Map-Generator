/** A provenance envelope around the actual CE road handoff (not a generated city). */
import type { WorldContext } from "../context/worldContext";
import { growthHash } from "../utils/urbanMorphology";
import type { BurgRoadReadSnapshot } from "./burgRoadProjection";
import type { BurgSiteRoadEntry } from "./burgSiteDescriptor";

export interface BurgRoadAuditReference {
  format: "fmg-ce-road-handoff";
  schemaVersion: 1;
  inputSha256: string;
  mapId: number;
  seed: string;
  burgId: number;
  sourceRevision: string;
  preparedRevision: string;
  projectionFrame: {
    originMapUnits: [number, number];
    metersPerMapUnit: number;
    cityRadiusMeters: number;
    halfMeters: number;
  };
  roads: BurgSiteRoadEntry[];
  prepared: BurgRoadReadSnapshot;
  withoutEconomy: boolean;
}

/** Only data read by road projection, including draw-time coast geometry and signpost attributes.
 * Typed arrays and arrays deliberately hash identically. No application globals are read. */
export function burgRoadInputRevision(world: Readonly<WorldContext>): string {
  const p = world.pack;
  const column = (value: ArrayLike<unknown> | undefined) => (value ? Array.from(value) : null);
  const snapshot = [
    world.mapId,
    world.seed,
    world.distanceScale,
    world.populationRate,
    world.urbanization,
    world.graphWidth,
    world.graphHeight,
    world.options.historicalPeriod,
    world.options.landConnectionGeneration,
    world.options.registeredLandConnections,
    world.options.portCoastPlacement,
    p.burgs.map(b =>
      b?.i
        ? [
            b.i,
            b.name,
            b.x,
            b.y,
            b.cell,
            b.state,
            b.population,
            b.group,
            b.capital,
            b.citadel,
            b.walls,
            b.port,
            b.plaza,
            b.treasury,
            (b as { wealth?: number }).wealth,
            b.removed
          ]
        : null
    ),
    p.states.map(s => s && [s.i, s.name, s.diplomacy, s.removed]),
    p.routes.map(r => [
      r.i,
      r.group,
      r.name,
      r.points,
      r.merged,
      r.registeredConnectionId,
      r.riverRoadConvergence,
      r.fixedSettlementApproach,
      r.traffic
    ]),
    column(p.cells.p),
    column(p.cells.c),
    column(p.cells.h),
    column(p.cells.v),
    column(p.cells.burg),
    column(p.cells.t),
    column(p.cells.f),
    column(p.cells.haven),
    column(p.cells.culture),
    column(p.cells.state),
    p.cultures?.map(c => c && [c.i, c.lotOccupancy]),
    p.vertices?.p,
    p.vertices?.c,
    p.features?.map(f => f && [f.i, f.type, f.vertices])
  ];
  return `road-input-v1:${growthHash(JSON.stringify(snapshot))}`;
}

export function createBurgRoadAuditReference(
  world: Readonly<WorldContext>,
  inputSha256: string,
  burgId: number,
  sourceRevision: string,
  projectionFrame: BurgRoadAuditReference["projectionFrame"],
  roads: BurgSiteRoadEntry[],
  prepared: BurgRoadReadSnapshot,
  withoutEconomy = false
): BurgRoadAuditReference {
  if (!/^[a-f0-9]{64}$/.test(inputSha256)) throw new Error("A saved input SHA-256 is required");
  return {
    format: "fmg-ce-road-handoff",
    schemaVersion: 1,
    inputSha256,
    mapId: world.mapId,
    seed: world.seed,
    burgId,
    sourceRevision,
    preparedRevision: burgRoadInputRevision(world),
    projectionFrame: structuredClone(projectionFrame),
    withoutEconomy,
    roads: structuredClone(roads),
    prepared: structuredClone(prepared)
  };
}
