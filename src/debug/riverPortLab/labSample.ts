/**
 * River-Port Lab L2 (docs/plan/river-port-lab.md §5): one statistics record per burg of the map
 * now loaded, built in the page so no .fmg has to be saved. The site kind is judged by the same
 * classifier that chose the lab sites, so intended and actual kinds stay comparable.
 */
import { worldContext } from "../../context/worldContext";
import { getConstrainedNetworkConnections } from "../../generators/constrainedLandNetwork";
import { getBurgSiteDescriptor } from "../../services/burgSiteDescriptor";
import { updateBurgWaterAccess } from "../../services/burgWaterAccess";
import { getWorldLandConnectionCurrent } from "../../services/worldLandConnectionRuntime";
import { useOptionsState } from "../../store/optionsState";
import type { Burg } from "../../types/models";
import { BRIDGE_SKEW_MAX_DEGREES, bridgeSkewDegrees, bridgeSkewLimitForPeriod } from "../../utils/bridgeSkewPolicy";
import { mapUnitMeters } from "../../utils/mapUnitMeters";
import { buildRiverSiteIndex, classifyRiverSite, type LabSiteKind } from "./classifyRiverSite";

export interface LabSampleFilter {
  /** Every live burg. */
  all?: boolean;
  /** Burgs with any port (the default filter). */
  port?: boolean;
  /** Burgs whose intended or actual site kind is listed. */
  siteKind?: LabSiteKind[];
}
export type LabSampleInclude = "descriptor" | "fmg";

export interface LabBridgeSummary {
  /** landConnections: adopted world bridges (each once); descriptor: crossings converged per burg
   * for City Editor (include=descriptor), counted once per sampled burg. */
  source: "landConnections" | "descriptor";
  count: number;
  /** Start-period stone allowance; a state's technology may legitimately raise it during play. */
  periodLimitDeg: number;
  overPeriodLimit: number;
  /** Above BRIDGE_SKEW_MAX_DEGREES: forbidden in every period (AGENTS.md). */
  overMaxLimit: number;
  maxSkewDeg: number;
}

/** The parts of a Burg Site Descriptor the statistics read (local metres around the burg). */
interface DescriptorExtract {
  rivers?: { riverId: number; widthMeters: number }[];
  fixedCrossings?: {
    crossings?: {
      id: number;
      q: [number, number];
      tangent: [number, number];
      deckA: [number, number];
      deckB: [number, number];
    }[];
  } | null;
}

interface LabBridge {
  facilityId: number;
  skewDeg: number;
  /** Deck midpoint, map units. */
  x: number;
  y: number;
}

export type BankSide = "left" | "right" | "both";

const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;
/** Compass bearing (0 = north, clockwise) from a to b on the map (y grows southward). */
const bearing = (a: readonly [number, number], b: readonly [number, number]) =>
  Math.round(((Math.atan2(b[0] - a[0], a[1] - b[1]) * 180) / Math.PI + 360) % 360);

const liveBurgs = (): Burg[] =>
  (worldContext.pack.burgs ?? []).filter((burg): burg is Burg => Boolean(burg?.i) && !burg.removed);

/** Every adopted bridge with its skew measured by bridgeSkewPolicy.ts, or null without land connections. */
function collectBridges(metersPerMapUnit: number): { bridges: LabBridge[]; byBurg: Map<number, number[]> } | null {
  const physical = getWorldLandConnectionCurrent(worldContext, useOptionsState.getState().distanceUnit);
  if (!physical) return null;
  const resolved = getConstrainedNetworkConnections(physical.snapshot.network, physical.current.environment);
  if (!("connections" in resolved)) return null;
  const bridges = new Map<number, LabBridge>();
  for (const connection of resolved.connections) {
    if (connection.kind !== "bridge") continue;
    const c = connection.crossing;
    bridges.set(c.id, {
      facilityId: c.id,
      skewDeg: round(bridgeSkewDegrees([c.deckB[0] - c.deckA[0], c.deckB[1] - c.deckA[1]], c.tRiver)),
      x: (c.deckA[0] + c.deckB[0]) / 2 / metersPerMapUnit,
      y: (c.deckA[1] + c.deckB[1]) / 2 / metersPerMapUnit
    });
  }
  const byBurg = new Map<number, number[]>();
  for (const edge of physical.snapshot.network.edges) {
    if (!edge.crossing) continue;
    for (const node of [edge.from, edge.to]) {
      const list = byBurg.get(node) ?? [];
      if (!list.includes(edge.crossing.facilityId)) list.push(edge.crossing.facilityId);
      byBurg.set(node, list);
    }
  }
  return { bridges: [...bridges.values()], byBurg };
}

function summarizeBridges(bridges: LabBridge[], source: LabBridgeSummary["source"]): LabBridgeSummary {
  const periodLimitDeg = bridgeSkewLimitForPeriod(worldContext.options.historicalPeriod);
  return {
    source,
    count: bridges.length,
    periodLimitDeg,
    overPeriodLimit: bridges.filter(b => b.skewDeg > periodLimitDeg + 1e-6).length,
    overMaxLimit: bridges.filter(b => b.skewDeg > BRIDGE_SKEW_MAX_DEGREES + 1e-6).length,
    maxSkewDeg: bridges.reduce((max, b) => Math.max(max, b.skewDeg), 0)
  };
}

/** Statistics rows for the current map (§5), filtered; `descriptor` adds the full Burg Site Descriptor. */
export function extractLabSample(filter: LabSampleFilter = { port: true }, include: readonly LabSampleInclude[] = []) {
  const { pack } = worldContext;
  const { cells } = pack;
  const metersPerMapUnit = mapUnitMeters(worldContext.distanceScale, useOptionsState.getState().distanceUnit);
  const index = buildRiverSiteIndex({ cells, features: pack.features, rivers: pack.rivers ?? [] });
  const bridgeData = collectBridges(metersPerMapUnit);
  const bridgeById = new Map(bridgeData?.bridges.map(b => [b.facilityId, b]));
  const descriptorBridges: LabBridge[] = [];

  const burgs = liveBurgs().flatMap(burg => {
    const id = burg.i as number;
    const site = classifyRiverSite(index, burg.cell);
    const access = burg.waterAccess ?? updateBurgWaterAccess({ ...burg }, pack);
    const intended = burg.labSiteKind ?? null;
    const actual = site?.kind ?? null;
    const anyPort = Boolean(burg.port) || access.port.sea || access.port.river || access.port.lake;
    if (!filter.all) {
      if (filter.siteKind?.length) {
        if (!filter.siteKind.some(kind => kind === intended || kind === actual)) return [];
      } else if (filter.port !== false && !anyPort) return [];
    }

    const center: [number, number] = [burg.x, burg.y];
    const river = site?.riverId ? index.rivers.get(site.riverId) : undefined;
    let riverRecord = null;
    let entryBearing: number | null = null;
    let exitBearing: number | null = null;
    if (river && site) {
      const path = river.river.cells;
      const at = river.position.get(burg.cell) ?? -1;
      const point = (cell: number | undefined) => (cell !== undefined && cell >= 0 ? cells.p[cell] : null);
      const before = point(path[at - 1]);
      const after = point(path[at + 1]);
      if (before) entryBearing = bearing(center, before);
      if (after) exitBearing = bearing(center, after);
      let toMouth = 0;
      if (at >= 0)
        for (let k = at; k < river.mouthIndex; k++)
          toMouth += Math.hypot(
            cells.p[path[k + 1]][0] - cells.p[path[k]][0],
            cells.p[path[k + 1]][1] - cells.p[path[k]][1]
          );
      // Looking downstream; y grows southward, so a positive cross product is the right bank.
      const own = cells.p[burg.cell];
      const flow = [(after ?? own)[0] - (before ?? own)[0], (after ?? own)[1] - (before ?? own)[1]];
      const offset = [burg.x - own[0], burg.y - own[1]];
      const flowLength = Math.hypot(flow[0], flow[1]);
      const side = flowLength ? (flow[0] * offset[1] - flow[1] * offset[0]) / flowLength : 0;
      const bankSide: BankSide = Math.abs(side) < 0.1 ? "both" : side > 0 ? "right" : "left";
      riverRecord = {
        id: site.riverId,
        flux: site.flux,
        widthM: null as number | null,
        outflow: site.outflow,
        distanceToMouthCells: site.distanceToMouthCells,
        distanceToMouthKm: site.outflow === "ocean" && at >= 0 ? round((toMouth * metersPerMapUnit) / 1000, 2) : null,
        confluenceOrder: site.confluenceOrder,
        curvatureDeg: site.curvatureDeg,
        bankSide
      };
    }
    const haven = cells.haven[burg.cell];
    const coastBearing = site?.seaAccess && haven ? bearing(center, cells.p[haven]) : null;

    let nearestBridgeSkewDeg: number | null = null;
    let nearestDistance = Infinity;
    for (const facilityId of bridgeData?.byBurg.get(id) ?? []) {
      const bridge = bridgeById.get(facilityId);
      if (!bridge) continue;
      const d = Math.hypot(bridge.x - burg.x, bridge.y - burg.y);
      if (d < nearestDistance) [nearestDistance, nearestBridgeSkewDeg] = [d, bridge.skewDeg];
    }

    let descriptor: unknown;
    if (include.includes("descriptor")) {
      try {
        descriptor = getBurgSiteDescriptor(id) ?? null;
      } catch (error) {
        descriptor = { error: error instanceof Error ? error.message : String(error) };
      }
      const exported = descriptor as DescriptorExtract | null;
      const width = exported?.rivers?.find(r => r.riverId === riverRecord?.id)?.widthMeters;
      if (riverRecord && width !== undefined) riverRecord.widthM = width;
      // Without world land connections, the crossings converged for this burg are its bridges.
      if (!bridgeData) {
        let nearest = Infinity;
        for (const c of exported?.fixedCrossings?.crossings ?? []) {
          const skewDeg = round(bridgeSkewDegrees([c.deckB[0] - c.deckA[0], c.deckB[1] - c.deckA[1]], c.tangent));
          descriptorBridges.push({ facilityId: c.id, skewDeg, x: 0, y: 0 });
          const d = Math.hypot(c.q[0], c.q[1]);
          if (d < nearest) [nearest, nearestBridgeSkewDeg] = [d, skewDeg];
        }
      }
    }

    return [
      {
        id,
        name: burg.name,
        cell: burg.cell,
        population: burg.population,
        port: Boolean(burg.port),
        capital: Boolean(burg.capital),
        siteKindIntended: intended,
        siteKindActual: actual,
        seaPort: access.port.sea,
        riverPort: access.port.river,
        lakePort: access.port.lake,
        river: riverRecord,
        relation: {
          riverEntryBearingDeg: entryBearing,
          riverExitBearingDeg: exitBearing,
          coastBearingDeg: coastBearing,
          nearestBridgeSkewDeg
        },
        waterfrontCheck: { ok: !burg.waterfrontCheck, alerts: burg.waterfrontCheck?.issues ?? [] },
        ...(descriptor !== undefined ? { descriptor } : {})
      }
    ];
  });

  return {
    map: {
      seed: worldContext.seed,
      labOptions: pack.riverPortLab?.options ?? null,
      shortfall: pack.riverPortLab?.shortfall ?? null,
      cells: cells.i.length,
      landCells: Array.from(cells.h).filter(h => h >= 20).length,
      riverCount: pack.rivers?.length ?? 0,
      burgCount: liveBurgs().length,
      historicalPeriod: worldContext.options.historicalPeriod ?? null,
      bridgeViolations: bridgeData
        ? summarizeBridges(bridgeData.bridges, "landConnections")
        : include.includes("descriptor")
          ? summarizeBridges(descriptorBridges, "descriptor")
          : null
    },
    burgs
  };
}
