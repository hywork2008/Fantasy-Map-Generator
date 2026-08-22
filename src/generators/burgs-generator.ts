import { max as d3max, mean } from "d3";
import { type Quadtree, quadtree } from "d3-quadtree";
import type { AppServices } from "../context/appServices";
import { appServices } from "../context/appServices";
import { simulationContext } from "../context/simulationContext";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { worldContext } from "../context/worldContext";
import {
  isArableBiome,
  isColdBiome,
  isDesertBiome,
  isForestBiome,
  isNomadicBiome,
  isSnowBiome
} from "../data/biomeCatalog";
import { getRaceById } from "../data/races";
import { removeBurgIcon, removeBurgLabel } from "../renderers";
import { COArenderer } from "../renderers/emblem-renderer";
import { bindSimulationBurg } from "../runtime/simulationBurgState";
import { countBurgRoadLegs } from "../services/burgSiteDescriptor";
import { tip } from "../services/tooltipService";
import { useOptionsState } from "../store/optionsState";
import type { Burg, Route } from "../types/models";
import type { WorldState } from "../types/WorldState";
import { each, findCell, gauss, minmax, normalize, P, rn } from "../utils";
import { ERROR, TIME, WARN } from "../utils/debug";
import { normalizeFrontierStartMode } from "../utils/frontierStartMode";
import { normalizeHeightExponent } from "../utils/height";
import { isCapitalOnlyPolityRealm, normalizeInitialPolityRealmSize } from "../utils/initialPolityScope";
import { buildBurgDemographics } from "./burgDemographics";
import { COA, type Emblem } from "./emblem/generator";
import { NON_NAVIGABLE_LAKE_GROUPS } from "./features";
import {
  analyzeFrontiers,
  type FrontierSegment,
  getChronicleContestedBurgs,
  normalizeHabitability
} from "./frontierAnalysis";
import { selectFrontierStartCapitals } from "./frontierStartPlacement";
import { type GiantHighlandOikoumene, seedGiantHighlandOikoumene } from "./giantHighlandOikoumene";
import {
  chooseLowerGiantWaterworksSite,
  hasGiantGravityWaterRouteToCell,
  highestWaterSourceElevation,
  isGiantWaterworksState
} from "./giantWaterworksSiting";
import { evaluateHarborElevation } from "./harborSiteConditions";
import {
  collectStartingRealmCells,
  getInitialPolityCapitalCount,
  selectInitialPolityCapitalNodes
} from "./initialPolities";
import { Names } from "./names-generator";
import { Rivers } from "./river-generator";
import { Routes } from "./routes-generator";
import { getCellSubsistenceCapacity } from "./subsistenceCapacity";
import type { Point } from "./voronoi";

const MAX_STRATEGIC_CITADEL_BONUS = 0.5;
/** A formal lake port requires at least this share of the packed map. */
const MIN_LAKE_PORT_SHARE = 0.003;
/** Prevents a tiny map or a malformed feature from promoting puddles. */
const MIN_LAKE_PORT_CELLS = 4;
const MIN_LAKE_PORTS = 2;
const MAX_LAKE_PORTS = 6;
/**
 * Rural `cells.pop` units that make a burg-less state holding count as a
 * settled overseas landmass. Cell Info people = pop × populationRate
 * (default 1000), so 1 unit is about a hamlet.
 */
const MIN_OVERSEAS_RURAL_POP = 1;
/**
 * Keep a newly founded harbour town this many map units inland of the voronoi
 * shore. The SVG coastline is a smoothed path inside the raw cell edge; a
 * 95% slide puts the icon in the drawn sea on small isles, while leaving the
 * town at the centre of a large river cell that only nicks the ocean stretches
 * the port/searoute to a distant coastal neighbour.
 */
const MIN_PORT_INLAND_GAP = 2;

interface StrategicContext {
  frontiers: Map<number, FrontierSegment[]>;
  contestedBurgs: Set<number>;
  meanS: number;
  maxS: number;
}

type PortCandidate = {
  burg: Burg;
  haven: number | null; // adjacent water cell for coastal ports; null for river ports
  portFeatureId: number; // the water/drain feature the port trades on
  landFeature: number; // the landmass the burg sits on
  waterKind: "sea" | "lake" | "river";
  preferred: boolean; // safe harbour, capital harbour, or river port — promoted unconditionally
};

export type BurgShiftOptions = {
  /**
   * After states own territory, a polity that already has towns on two or more
   * sea landmasses (continent / island / isle) must also have a sea port on
   * each of those landmasses so intra-state searoutes can form.
   */
  connectStateLandmasses?: boolean;
};

class BurgModule {
  worldContext: WorldContext = worldContext;
  viewContext: Readonly<ViewContext> = viewContext;
  appServices: AppServices = appServices;
  /** Burgs founded as overseas harbours: keep the town on the cell centre; the anchor sits at sea. */
  private landmassPortBurgIds = new Set<number>();

  // Assign port feature ids to burgs and position them appropriately
  shift(options: BurgShiftOptions = {}) {
    if (options.connectStateLandmasses) this.ensureStateLandmassPorts();

    // States are known on the second shift during generation. Giant settlements retain their
    // distinct highland ecology, but a gravity-fed Roman aqueduct may not cross an uncuttable
    // ridge. Resite only the waterworks placement; never use human food or climate suitability.
    this.resiteGiantWaterworksSettlements();

    const { cells, burgs } = this.worldContext.pack;
    const riversById = new Map(this.worldContext.pack.rivers.map(river => [river.i, river]));
    for (const burg of burgs) {
      if (burg.i && !burg.lock) delete burg.port;
    }

    const candidatesByWater = this.collectPortCandidates(burgs);
    for (const candidates of candidatesByWater.values()) {
      if (!candidates.length) continue;
      const lockedLakePorts = candidates[0].waterKind === "lake" ? this.getLockedLakePorts(candidates[0].haven) : [];
      for (const candidate of this.selectPorts(candidates, lockedLakePorts, {
        byState: Boolean(options.connectStateLandmasses)
      })) {
        this.promoteToPort(candidate, riversById);
      }
    }

    // Shift non-port river burgs slightly toward the bank
    for (const burg of burgs) {
      if (!burg.i || burg.lock || burg.port || !cells.r[burg.cell]) continue;
      const [x, y] = this.shiftTowardsRiverBank(burg.cell, riversById);
      burg.x = x;
      burg.y = y;
    }

    this.landmassPortBurgIds.clear();
  }

  private resiteGiantWaterworksSettlements(): void {
    const { pack } = this.worldContext;
    const { burgs, cells, cultures, races, states } = pack;
    const highestSourceElevation = highestWaterSourceElevation(cells);
    if (highestSourceElevation === null || !states?.length) return;

    const culturesSet = useOptionsState.getState().culturesSet;
    for (const burg of burgs) {
      if (!burg.i || burg.removed || !burg.state) continue;
      if (!isGiantWaterworksState({ stateId: burg.state, states, cultures, races, culturesSet })) continue;
      const stateId = burg.state;
      const hasGravityRoute = hasGiantGravityWaterRouteToCell({
        cells,
        stateId,
        targetCell: burg.cell
      });
      if (cells.h[burg.cell] < highestSourceElevation && hasGravityRoute) continue;

      const targetCell = chooseLowerGiantWaterworksSite({
        cells,
        stateId,
        fromCell: burg.cell,
        highestSourceElevation,
        isSiteEligible: cell =>
          !cells.burg[cell] && hasGiantGravityWaterRouteToCell({ cells, stateId, targetCell: cell })
      });
      if (targetCell === undefined) continue;

      cells.burg[burg.cell] = 0;
      burg.cell = targetCell;
      [burg.x, burg.y] = cells.p[targetCell];
      burg.feature = cells.f[targetCell];
      cells.burg[targetCell] = burg.i;

      if (burg.capital) {
        const state = states[burg.state] ?? states.find(candidate => candidate?.i === burg.state);
        if (state) state.center = targetCell;
      }
    }
  }

  /**
   * Elevation Unsuitable gate (docs/plan/harbor-siting.md §3.1/§5.2): a burg cell whose land-side
   * elevation exceeds HARBOR_ELEVATION_UNSUITABLE_MIN_M (>100m) has no feasible footing for a
   * formal harbor/shipyard, regardless of coastalHabitat. Below that, elevation only degrades
   * capacity (`elevationFactor`, applied in portCapacity.ts) — it never excludes the candidate.
   */
  private elevationAllowsFormalHarbor(cellId: number): boolean {
    const heightExponent = normalizeHeightExponent(useOptionsState.getState().heightExponent);
    const { tier } = evaluateHarborElevation(this.worldContext.pack.cells.h[cellId], heightExponent);
    return tier !== "unsuitable";
  }

  private collectPortCandidates(burgs: Burg[]): Map<number, PortCandidate[]> {
    const { cells, features } = this.worldContext.pack;
    const temp = this.worldContext.grid.cells.temp;

    const byWater = new Map<number, PortCandidate[]>();
    const addCandidate = (selectionFeatureId: number, candidate: PortCandidate) => {
      if (!byWater.has(selectionFeatureId)) byWater.set(selectionFeatureId, []);
      byWater.get(selectionFeatureId)!.push(candidate);
    };

    for (const burg of burgs) {
      if (!burg.i || burg.lock) continue;
      const haven = cells.haven[burg.cell];
      const landFeature = cells.f[burg.cell];

      if (haven) {
        const harbor = cells.harbor[burg.cell];
        if (!harbor) continue;
        const featureId = cells.f[haven];
        const feature = features[featureId];
        if (!feature || feature.cells <= 1) continue;
        if (NON_NAVIGABLE_LAKE_GROUPS.has(feature.group)) continue;
        if (temp[cells.g[burg.cell]] <= 0) continue; // frozen
        if (!this.elevationAllowsFormalHarbor(burg.cell)) continue;

        const isLake = feature.type === "lake";
        if (isLake && this.getLakePortCapacity(feature) === 0) continue;

        const portFeatureId = isLake ? this.resolveLakePortFeature(featureId) : featureId;
        const preferred = (harbor && Boolean(burg.capital)) || harbor === 1;
        // A lake must compete only with settlements on that lake. Grouping an
        // outlet lake under the ocean feature used to make every lake shore a
        // preferred ocean port.
        const selectionFeatureId = isLake ? -featureId : featureId;
        addCandidate(selectionFeatureId, {
          burg,
          haven,
          portFeatureId,
          landFeature,
          waterKind: isLake ? "lake" : "sea",
          preferred
        });
      } else {
        if (!Rivers.isNavigable(burg.cell)) continue;
        const portFeatureId = Rivers.resolveDrainFeature(burg.cell);
        if (!portFeatureId) continue;
        addCandidate(portFeatureId, {
          burg,
          haven: null,
          portFeatureId,
          landFeature,
          waterKind: "river",
          preferred: true
        });
      }
    }

    return byWater;
  }

  private getLockedLakePorts(haven: number | null): Burg[] {
    if (haven === null) return [];
    const { burgs, cells } = this.worldContext.pack;
    const lakeFeatureId = cells.f[haven];
    return burgs.filter(
      burg =>
        burg.i && burg.lock && burg.port && cells.haven[burg.cell] && cells.f[cells.haven[burg.cell]] === lakeFeatureId
    );
  }

  /**
   * A state that already holds two or more sea landmasses (continent, island,
   * or isle) needs a sea port on each settled one. Rural population is assigned
   * from habitability before burg placement, and states later flood-fill across
   * water, so a fertile island can be fully owned and populated with zero
   * towns. Those holdings still need a harbour or they stay off the searoute
   * network.
   */
  ensureStateLandmassPorts(): void {
    const { pack } = this.worldContext;
    const { burgs, cells, features } = pack;
    if (!burgs?.length || !cells.i?.length || !features?.length) return;

    const holdings = new Map<string, { stateId: number; landFeatureId: number; pop: number; hasBurg: boolean }>();
    const holdingKey = (stateId: number, landFeatureId: number) => `${stateId}:${landFeatureId}`;
    const addHolding = (stateId: number, landFeatureId: number) => {
      const key = holdingKey(stateId, landFeatureId);
      const existing = holdings.get(key);
      if (existing) return existing;
      const created = { stateId, landFeatureId, pop: 0, hasBurg: false };
      holdings.set(key, created);
      return created;
    };

    for (const cellId of cells.i) {
      if (cells.h[cellId] < 20) continue;
      const stateId = cells.state[cellId];
      if (!stateId) continue;
      const landFeatureId = this.getSeaLandmassId(cells.f[cellId]);
      if (landFeatureId === null) continue;
      addHolding(stateId, landFeatureId).pop += cells.pop?.[cellId] ?? 0;
    }

    for (const burg of burgs) {
      if (!burg.i || burg.removed || !burg.state) continue;
      const landFeatureId = this.getSeaLandmassId(cells.f[burg.cell]);
      if (landFeatureId === null) continue;
      addHolding(burg.state, landFeatureId).hasBurg = true;
    }

    const landFeaturesByState = new Map<number, Set<number>>();
    for (const holding of holdings.values()) {
      if (!holding.hasBurg && holding.pop < MIN_OVERSEAS_RURAL_POP) continue;
      const owned = landFeaturesByState.get(holding.stateId);
      if (owned) owned.add(holding.landFeatureId);
      else landFeaturesByState.set(holding.stateId, new Set([holding.landFeatureId]));
    }

    for (const [stateId, landFeatures] of landFeaturesByState) {
      if (landFeatures.size < 2) continue;
      for (const landFeatureId of landFeatures) {
        if (this.stateHasSeaPortCandidate(stateId, landFeatureId)) continue;
        const cell = this.pickBestStateHarborCell(stateId, landFeatureId);
        if (cell === null) continue;
        this.addGeneratedBurg(cell, stateId);
      }
    }
  }

  private getSeaLandmassId(featureId: number): number | null {
    const feature = this.worldContext.pack.features[featureId];
    if (feature?.type !== "island" || feature.group === "lake_island") return null;
    return feature.i ?? featureId;
  }

  private isViableSeaHarborCell(cellId: number): boolean {
    const { cells, features } = this.worldContext.pack;
    const haven = cells.haven[cellId];
    if (!haven || !cells.harbor[cellId]) return false;
    const feature = features[cells.f[haven]];
    if (feature?.type !== "ocean" || feature.cells <= 1) return false;
    if (this.worldContext.grid.cells.temp[cells.g[cellId]] <= 0) return false;
    return this.elevationAllowsFormalHarbor(cellId);
  }

  private stateHasSeaPortCandidate(stateId: number, landFeatureId: number): boolean {
    const { burgs, cells } = this.worldContext.pack;
    return burgs.some(burg => {
      if (!burg.i || burg.removed || this.getPortState(burg) !== stateId) return false;
      if (cells.f[burg.cell] !== landFeatureId) return false;
      if (burg.lock && burg.port && cells.haven[burg.cell]) {
        const water = this.worldContext.pack.features[cells.f[cells.haven[burg.cell]]];
        return water?.type === "ocean";
      }
      return this.isViableSeaHarborCell(burg.cell);
    });
  }

  private pickBestStateHarborCell(stateId: number, landFeatureId: number): number | null {
    const { cells } = this.worldContext.pack;
    let best: number | null = null;
    let bestHarbor = Number.POSITIVE_INFINITY;
    let bestShore = Number.POSITIVE_INFINITY;
    let bestSuitability = Number.NEGATIVE_INFINITY;
    for (const cellId of cells.i) {
      if (cells.state[cellId] !== stateId || cells.f[cellId] !== landFeatureId) continue;
      if (cells.burg[cellId] || cells.h[cellId] < 20) continue;
      if (!this.isViableSeaHarborCell(cellId)) continue;
      const harbor = cells.harbor[cellId];
      const shore = this.distanceFromCenterToHavenEdge(cellId);
      const suitability = cells.s?.[cellId] ?? 0;
      const betterHarbor = harbor < bestHarbor;
      const closerShore = harbor === bestHarbor && shore < bestShore;
      const betterSite = harbor === bestHarbor && shore === bestShore && suitability > bestSuitability;
      const earlierCell =
        harbor === bestHarbor && shore === bestShore && suitability === bestSuitability && cellId < (best ?? cellId);
      if (betterHarbor || closerShore || betterSite || earlierCell) {
        best = cellId;
        bestHarbor = harbor;
        bestShore = shore;
        bestSuitability = suitability;
      }
    }
    return best;
  }

  private addGeneratedBurg(cell: number, stateId: number): Burg {
    const { pack } = this.worldContext;
    const { cells } = pack;
    const [x, y] = cells.p[cell];
    const burgId = pack.burgs.length;
    const culture = cells.culture[cell] || pack.states[stateId]?.culture || 0;
    const name = Names.getCulture(culture);
    const burg: Burg = {
      cell,
      x,
      y,
      i: burgId,
      state: stateId,
      culture,
      name,
      feature: cells.f[cell],
      capital: 0,
      security: 50,
      sanitation: 50,
      medicalCare: 50,
      stateHistory: [stateId]
    };
    pack.burgs.push(burg);
    cells.burg[cell] = burgId;
    this.landmassPortBurgIds.add(burgId);
    return burg;
  }

  private selectPorts(
    candidates: PortCandidate[],
    lockedLakePorts: Burg[] = [],
    options: { byState?: boolean } = {}
  ): PortCandidate[] {
    const { cells } = this.worldContext.pack;
    const rank = (candidate: PortCandidate) =>
      (candidate.burg.capital ? -1000 : 0) + (candidate.haven !== null ? cells.harbor[candidate.burg.cell] : 0);

    if (candidates[0]?.waterKind === "lake") {
      return this.selectLakePorts(candidates, lockedLakePorts, rank);
    }

    const promoted = new Set<PortCandidate>();
    for (const c of candidates) if (c.preferred) promoted.add(c);

    const groups = new Map<string, PortCandidate[]>();
    for (const c of candidates) {
      const key = options.byState ? `${c.landFeature}:${this.getPortState(c.burg)}` : String(c.landFeature);
      const group = groups.get(key);
      if (group) group.push(c);
      else groups.set(key, [c]);
    }
    for (const group of groups.values()) {
      if (group.some(c => promoted.has(c))) continue; // landmass (or state+landmass) already has a port here
      promoted.add(group.reduce((best, c) => (rank(c) < rank(best) ? c : best)));
    }

    if (promoted.size < 2) {
      const rest = candidates.filter(c => !promoted.has(c)).sort((a, b) => rank(a) - rank(b));
      for (const c of rest) {
        promoted.add(c);
        if (promoted.size >= 2) break;
      }
    }

    if (promoted.size < 2) return []; // a sea route needs two endpoints; a lone port is useless

    return [...promoted];
  }

  /**
   * Lakes get a small, distributed set of representative ports. The capacity
   * scales with the lake's share of the map (2–6), then large multi-State
   * lakes reserve one suitable port for each unrepresented shore State.
   */
  private selectLakePorts(
    candidates: PortCandidate[],
    lockedPorts: Burg[],
    rank: (candidate: PortCandidate) => number
  ): PortCandidate[] {
    const { cells, features } = this.worldContext.pack;
    const haven = candidates[0]?.haven;
    if (haven === null || haven === undefined) return [];
    const lake = features[cells.f[haven]];
    if (!lake) return [];

    const capacity = this.getLakePortCapacity(lake);
    if (capacity === 0 || candidates.length + lockedPorts.length < MIN_LAKE_PORTS) return [];
    const slots = Math.max(0, capacity - lockedPorts.length);
    if (slots === 0) return [];

    const selected: PortCandidate[] = [];
    const occupiedStates = new Set(lockedPorts.map(port => this.getPortState(port)).filter(stateId => stateId !== 0));
    const candidatesByState = new Map<number, PortCandidate[]>();
    for (const candidate of candidates) {
      const stateId = this.getPortState(candidate.burg);
      if (!stateId || occupiedStates.has(stateId)) continue;
      if (!candidatesByState.has(stateId)) candidatesByState.set(stateId, []);
      candidatesByState.get(stateId)!.push(candidate);
    }

    const stateRepresentatives = [...candidatesByState.values()]
      .map(group => group.sort((a, b) => rank(a) - rank(b))[0])
      .sort((a, b) => rank(a) - rank(b));
    for (const representative of stateRepresentatives) {
      if (selected.length >= slots) break;
      const next = this.selectSpacedLakeCandidate([representative], selected, lockedPorts, lake.area, capacity, rank);
      if (next) selected.push(next);
    }

    while (selected.length < slots) {
      const remaining = candidates.filter(candidate => !selected.includes(candidate));
      const next = this.selectSpacedLakeCandidate(remaining, selected, lockedPorts, lake.area, capacity, rank);
      if (!next) break;
      selected.push(next);
    }

    return selected;
  }

  private getLakePortCapacity(lake: { cells: number }): number {
    const { cells } = this.worldContext.pack;
    const totalCells = cells.i?.length ?? cells.f.length;
    const lakeShare = lake.cells / Math.max(totalCells, 1);
    if (lake.cells < MIN_LAKE_PORT_CELLS || lakeShare < MIN_LAKE_PORT_SHARE) return 0;
    const growthSteps = Math.floor(Math.log2(lakeShare / MIN_LAKE_PORT_SHARE));
    return Math.min(MAX_LAKE_PORTS, MIN_LAKE_PORTS + Math.max(0, growthSteps));
  }

  private getPortState(burg: Burg): number {
    return burg.state || this.worldContext.pack.cells.state?.[burg.cell] || 0;
  }

  private selectSpacedLakeCandidate(
    candidates: PortCandidate[],
    selected: PortCandidate[],
    lockedPorts: Burg[],
    lakeArea: number,
    capacity: number,
    rank: (candidate: PortCandidate) => number
  ): PortCandidate | undefined {
    if (!candidates.length) return;
    const existingPorts = [...lockedPorts, ...selected.map(candidate => candidate.burg)];
    if (!existingPorts.length) return [...candidates].sort((a, b) => rank(a) - rank(b))[0];

    const minDistanceSquared = lakeArea > 0 ? lakeArea / capacity ** 2 : 0;
    const distanceToNearestPort = (candidate: PortCandidate) =>
      Math.min(...existingPorts.map(port => (candidate.burg.x - port.x) ** 2 + (candidate.burg.y - port.y) ** 2));
    const spaced = candidates.filter(candidate => distanceToNearestPort(candidate) >= minDistanceSquared);
    if (spaced.length) return [...spaced].sort((a, b) => rank(a) - rank(b))[0];

    return [...candidates].sort((a, b) => {
      const distanceDifference = distanceToNearestPort(b) - distanceToNearestPort(a);
      return distanceDifference || rank(a) - rank(b);
    })[0];
  }

  private promoteToPort(candidate: PortCandidate, riversById: Map<number, { i: number; cells: number[] }>): void {
    const { burg, haven, portFeatureId } = candidate;
    burg.port = portFeatureId;
    if (haven !== null && burg.i && this.landmassPortBurgIds.has(burg.i)) {
      const [x, y] = this.getCoastalBurgPosition(burg.cell, haven);
      burg.x = x;
      burg.y = y;
      return;
    }
    const [x, y] =
      haven !== null ? this.getCloseToEdgePoint(burg.cell, haven) : this.shiftTowardsRiverBank(burg.cell, riversById);
    burg.x = x;
    burg.y = y;
  }

  /**
   * Lake ports trade locally by default. They inherit a downstream sea feature
   * only when every land leg of the outlet chain is navigable, matching the
   * water route pathfinder's ability to sail that chain.
   */
  private resolveLakePortFeature(lakeFeatureId: number): number {
    const { cells, features, rivers } = this.worldContext.pack;
    const riverById = new Map(rivers.map(river => [river.i, river]));
    const visitedLakes = new Set<number>();
    let lake = features[lakeFeatureId];

    while (lake?.type === "lake" && lake.outlet && !visitedLakes.has(lake.i)) {
      visitedLakes.add(lake.i);
      const outlet = riverById.get(lake.outlet);
      if (!outlet) return lakeFeatureId;

      for (const cellId of outlet.cells) {
        if (cellId < 0) return lakeFeatureId;
        const feature = features[cells.f[cellId]];
        if (feature?.type !== "lake" && feature?.type !== "ocean" && !Rivers.isNavigable(cellId)) {
          return lakeFeatureId;
        }
      }

      const lastCell = outlet.cells[outlet.cells.length - 1];
      if (lastCell === undefined || lastCell < 0) return lakeFeatureId;
      const receivingFeature = features[cells.f[lastCell]];
      if (!receivingFeature) return lakeFeatureId;
      if (receivingFeature.type === "ocean") return receivingFeature.i;
      if (receivingFeature.type !== "lake") return lakeFeatureId;
      if (!receivingFeature.outlet) return receivingFeature.i;
      lake = receivingFeature;
    }

    return lakeFeatureId;
  }

  /**
   * Builds a port at one already-established burg when its coast or river is
   * navigable. Unlike `shift`, this preserves every existing port assignment.
   */
  developPort(burg: Burg): boolean {
    if (!burg.i || burg.removed || burg.port) return false;
    const { cells, features } = this.worldContext.pack;
    const haven = cells.haven[burg.cell];

    if (haven) {
      const feature = features[cells.f[haven]];
      if (!cells.harbor[burg.cell] || !feature || feature.cells <= 1 || NON_NAVIGABLE_LAKE_GROUPS.has(feature.group)) {
        return false;
      }
      if (this.worldContext.grid.cells.temp[cells.g[burg.cell]] <= 0) return false;
      if (!this.elevationAllowsFormalHarbor(burg.cell)) return false;
      if (feature.type === "lake" && this.getLakePortCapacity(feature) === 0) return false;
      if (feature.type === "lake" && this.countLakePorts(feature.i) >= this.getLakePortCapacity(feature)) return false;
      const portFeatureId = feature.type === "lake" ? this.resolveLakePortFeature(feature.i) : feature.i;
      this.promoteToPort(
        {
          burg,
          haven,
          portFeatureId,
          landFeature: cells.f[burg.cell],
          waterKind: feature.type === "lake" ? "lake" : "sea",
          preferred: cells.harbor[burg.cell] === 1
        },
        new Map(this.worldContext.pack.rivers.map(river => [river.i, river]))
      );
      return true;
    }

    if (!Rivers.isNavigable(burg.cell)) return false;
    const portFeatureId = Rivers.resolveDrainFeature(burg.cell);
    if (!portFeatureId) return false;
    this.promoteToPort(
      { burg, haven: null, portFeatureId, landFeature: cells.f[burg.cell], waterKind: "river", preferred: true },
      new Map(this.worldContext.pack.rivers.map(river => [river.i, river]))
    );
    return true;
  }

  private countLakePorts(lakeFeatureId: number): number {
    const { burgs, cells } = this.worldContext.pack;
    return burgs.filter(
      burg => burg.i && burg.port && cells.haven[burg.cell] && cells.f[cells.haven[burg.cell]] === lakeFeatureId
    ).length;
  }

  private getSharedEdgeMidpoint(cell1: number, cell2: number): Point | null {
    const { cells, vertices } = this.worldContext.pack;
    const commonVertices = cells.v[cell1].filter((vertex: number) =>
      vertices.c[vertex].some((c: number) => c === cell2)
    );
    if (commonVertices.length < 2) return null;
    const [x1, y1] = vertices.p[commonVertices[0]];
    const [x2, y2] = vertices.p[commonVertices[1]];
    if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) return null;
    return [(x1 + x2) / 2, (y1 + y2) / 2];
  }

  private distanceFromCenterToHavenEdge(cellId: number): number {
    const { cells } = this.worldContext.pack;
    const haven = cells.haven[cellId];
    if (!haven) return 0;
    const edge = this.getSharedEdgeMidpoint(cellId, haven);
    if (!edge) return 0;
    const [x, y] = cells.p[cellId];
    return Math.hypot(x - edge[0], y - edge[1]);
  }

  private getCloseToEdgePoint(cell1: number, cell2: number): [number, number] {
    const { cells } = this.worldContext.pack;
    const [x0, y0] = cells.p[cell1];
    const edge = this.getSharedEdgeMidpoint(cell1, cell2);
    if (!edge) return [x0, y0];
    return [rn(x0 + 0.95 * (edge[0] - x0), 2), rn(y0 + 0.95 * (edge[1] - y0), 2)];
  }

  /**
   * Sit the town on land, just inland of the haven edge. Used for overseas
   * harbour foundations: cell-centre is wrong on a large river cell that only
   * nicks the ocean, and the legacy 95% slide is wrong on a tiny isle.
   */
  private getCoastalBurgPosition(cellId: number, haven: number): Point {
    const { cells } = this.worldContext.pack;
    const [x0, y0] = cells.p[cellId];
    const edge = this.getSharedEdgeMidpoint(cellId, haven);
    if (!edge) return [x0, y0];
    const dx = edge[0] - x0;
    const dy = edge[1] - y0;
    const dist = Math.hypot(dx, dy);
    if (dist <= MIN_PORT_INLAND_GAP) return [x0, y0];
    const t = (dist - MIN_PORT_INLAND_GAP) / dist;
    return [rn(x0 + t * dx, 2), rn(y0 + t * dy, 2)];
  }

  private shiftTowardsRiverBank(cellId: number, riversById: Map<number, { i: number; cells: number[] }>): Point {
    const { cells } = this.worldContext.pack;
    const [x, y] = cells.p[cellId];
    const shift = Math.min(cells.fl[cellId] / 200, 0.6);

    const tangent = this.getRiverTangent(cellId, riversById);
    if (!tangent) {
      const xShifted = cellId % 2 ? x + shift : x - shift;
      const yShifted = cells.r[cellId] % 2 ? y + shift : y - shift;
      return [rn(xShifted, 2), rn(yShifted, 2)];
    }

    const [tx, ty] = tangent;
    const length = Math.hypot(tx, ty);
    const side = cellId % 2 ? 1 : -1;
    const xShifted = x + (-ty / length) * shift * side;
    const yShifted = y + (tx / length) * shift * side;
    return [rn(xShifted, 2), rn(yShifted, 2)];
  }

  private getRiverTangent(cellId: number, riversById: Map<number, { i: number; cells: number[] }>): Point | null {
    const { cells } = this.worldContext.pack;
    const river = riversById.get(cells.r[cellId]);
    if (!river) return null;

    const idx = river.cells.indexOf(cellId);
    if (idx === -1) return null;

    const prevCell = river.cells[idx - 1];
    const nextCell = river.cells[idx + 1];
    const from = prevCell !== undefined && prevCell >= 0 ? cells.p[prevCell] : cells.p[cellId];
    const to = nextCell !== undefined && nextCell >= 0 ? cells.p[nextCell] : cells.p[cellId];

    const tx = to[0] - from[0];
    const ty = to[1] - from[1];
    if (tx === 0 && ty === 0) return null;
    return [tx, ty];
  }

  generate(
    worldContext: WorldContext,
    viewContext: Readonly<ViewContext>,
    appServices: AppServices,
    state: WorldState
  ) {
    this.worldContext = worldContext;
    this.viewContext = viewContext;
    this.appServices = appServices;
    const { grid } = this.worldContext;
    const { pack } = state;
    TIME && console.time("generateBurgs");
    const { cells } = pack;

    let burgs: Burg[] = [0 as unknown as Burg]; // burgs[0] is a sentinel 0, array is 1-indexed
    cells.burg = new Uint16Array(cells.i.length);
    const giantHighlandOikoumene = seedGiantHighlandOikoumene(
      this.worldContext,
      useOptionsState.getState().culturesSet,
      useOptionsState.getState().initialPopulationSaturation / 100
    );

    // The Settlement Foundation owns non-standard Burg candidates. Standard
    // maps remain the legacy adapter, including their all-suitable-cell pool.
    const preservesLegacyCandidates = this.worldContext.options.initialSettlementPattern === "standard";
    const plannedNodes = preservesLegacyCandidates ? [] : (pack.settlementFoundation?.nodes ?? []);
    const plannedNodeByCell = new Map(plannedNodes.map(node => [node.cell, node]));
    const populatedCells = cells.i.filter(
      i =>
        cells.culture[i] &&
        (plannedNodeByCell.has(i) || cells.pop[i] > 0 || (preservesLegacyCandidates && cells.s[i] > 0))
    );
    if (!populatedCells.length) {
      ERROR && console.error("There is no populated cells with culture assigned. Cannot generate states");
      pack.burgs = burgs;
      return burgs;
    }

    let burgsQuadtree = quadtree();

    const generateCapitals = () => {
      if (plannedNodes.length) {
        const capitalsNumber = getInitialPolityCapitalCount(
          pack.settlementFoundation!,
          useOptionsState.getState().statesNumber
        );
        const plannedCapitals =
          this.worldContext.options.initialSettlementPattern === "frontier"
            ? selectFrontierStartCapitals({
                plan: pack.settlementFoundation!,
                pack,
                count: capitalsNumber,
                startMode: normalizeFrontierStartMode(this.worldContext.options.frontierStartMode),
                realmSize: normalizeInitialPolityRealmSize(this.worldContext.options.initialPolityRealmSize),
                spacing: this.worldContext.options.frontierPolitySpacing
              })
            : selectInitialPolityCapitalNodes(pack.settlementFoundation!, cells.p, capitalsNumber);
        for (const node of plannedCapitals) {
          const cell = node.cell;
          const [x, y] = cells.p[cell];
          burgs.push({ cell, x, y });
        }
        burgs.forEach((burg, burgId) => {
          if (!burgId) return;
          burg.i = burgId;
          burg.state = burgId;
          burg.culture = cells.culture[burg.cell];
          burg.name = Names.getCultureShort(worldContext, viewContext, appServices, burg.culture);
          burg.feature = cells.f[burg.cell];
          burg.capital = 1;
          cells.burg[burg.cell] = burgId;
        });
        return;
      }

      const randomize = (score: number) => score * (0.5 + Math.random() * 0.5);
      const score = new Int16Array(cells.s.map(randomize));
      const sorted = populatedCells.sort((a, b) => score[b] - score[a]);

      const capitalsNumber = getCapitalsNumber();
      let spacing = (worldContext.graphWidth + worldContext.graphHeight) / 2 / capitalsNumber; // min distance between capitals

      for (let i = 0; burgs.length <= capitalsNumber; i++) {
        const cell = sorted[i];
        const [x, y] = cells.p[cell];

        if (burgsQuadtree.find(x, y, spacing) === undefined) {
          burgs.push({ cell, x, y });
          burgsQuadtree.add([x, y]);
        }

        // reset if all cells were checked
        if (i === sorted.length - 1) {
          WARN && console.warn("Cannot place capitals with current spacing. Trying again with reduced spacing");
          burgsQuadtree = quadtree();
          i = -1;
          burgs = [0 as unknown as Burg];
          spacing /= 1.2;
        }
      }

      burgs.forEach((burg, burgId) => {
        if (!burgId) return;
        burg.i = burgId;
        burg.state = burgId;
        burg.culture = cells.culture[burg.cell];
        burg.name = Names.getCultureShort(worldContext, viewContext, appServices, burg.culture);
        burg.feature = cells.f[burg.cell];
        burg.capital = 1;
        cells.burg[burg.cell] = burgId;
      });
    };

    const generateTowns = () => {
      const burgsNumber = getTownsNumber();
      const realmCells = getStartingRealmCellSet();
      const placedCells = plannedNodes.length
        ? [...plannedNodes]
            .filter(node => !cells.burg[node.cell] && (!realmCells || realmCells.has(node.cell)))
            .sort((a, b) => b.score - a.score)
            .slice(0, burgsNumber)
            .map(node => node.cell)
        : this.placeTowns(populatedCells, burgsNumber, burgsQuadtree);

      for (const cell of placedCells) {
        const [x, y] = cells.p[cell];
        const burgId = burgs.length;
        const culture = cells.culture[cell];
        const name = Names.getCulture(culture);
        const feature = cells.f[cell];
        burgs.push({
          cell,
          x,
          y,
          i: burgId,
          state: 0,
          culture,
          name,
          feature,
          capital: 0
        });
        cells.burg[cell] = burgId;
      }
    };

    generateCapitals();
    ensureGiantSourceCapital(giantHighlandOikoumene);
    if (!isCapitalOnlyPolityRealm(this.worldContext.options.initialPolityRealmSize) || preservesLegacyCandidates) {
      generateTowns();
    }

    for (const burg of burgs) {
      if (!burg.i) continue;
      // Civic-condition simulation has not started yet; every new settlement begins neutral.
      burg.security = 50;
      burg.sanitation = 50;
      burg.waterSecurity = 50;
      // The live simulation clock does not exist yet at this point in generation
      // (initSimulationClock() runs after core generation); the world's declared
      // starting year is the correct "founded" date for every initial Burg.
      burg.foundedYear = worldContext.options.year ?? 0;
    }

    pack.burgs = burgs;
    this.shift();

    TIME && console.timeEnd("generateBurgs");

    function getCapitalsNumber() {
      let number = useOptionsState.getState().statesNumber;

      if (populatedCells.length < number * 10) {
        number = Math.floor(populatedCells.length / 10);
        WARN && console.warn(`Not enough populated cells. Generating only ${number} capitals/states`);
      }

      return number;
    }

    /** Keep the highest protected source in the Giant homeland's first polity. */
    function ensureGiantSourceCapital(giant: GiantHighlandOikoumene | null): void {
      if (!giant || cells.culture[giant.sourceCell] !== giant.cultureId) return;
      if (burgs.some(burg => burg.i && burg.capital && burg.cell === giant.sourceCell)) return;
      const displaced = burgs.at(-1);
      if (!displaced?.i) return;
      burgs.pop();
      cells.burg[displaced.cell] = 0;

      const [x, y] = cells.p[giant.sourceCell];
      burgs.push({
        i: displaced.i,
        state: displaced.i,
        cell: giant.sourceCell,
        x,
        y,
        culture: giant.cultureId,
        name: Names.getCultureShort(worldContext, viewContext, appServices, giant.cultureId),
        feature: cells.f[giant.sourceCell],
        capital: 1
      });
      cells.burg[giant.sourceCell] = displaced.i;
      burgsQuadtree = quadtree(burgs.filter(burg => burg.i).map(burg => [burg.x, burg.y] as [number, number]));
    }

    function getTownsNumber() {
      const manors = useOptionsState.getState().manors;
      const isAuto = manors === 1000; // 1000 is considered as auto
      if (isAuto) return rn(populatedCells.length / 5 / (grid.points.length / 10000) ** 0.8);

      return Math.min(manors, populatedCells.length);
    }

    function getStartingRealmCellSet(): Set<number> | null {
      if (preservesLegacyCandidates || !pack.settlementFoundation) return null;
      const realmSize = normalizeInitialPolityRealmSize(worldContext.options.initialPolityRealmSize);
      if (realmSize <= 1) return new Set();
      const capitals = burgs.filter(burg => burg.i && burg.capital);
      if (!capitals.length) return null;
      const allowedByRegion = pack.settlementFoundation.regions.map(region => new Set(region.cells));
      const cellsInRealm = new Set<number>();
      for (const capital of capitals) {
        const allowed = allowedByRegion.find(region => region.has(capital.cell));
        for (const cellId of collectStartingRealmCells(cells, capital.cell, realmSize, allowed)) {
          cellsInRealm.add(cellId);
        }
      }
      return cellsInRealm;
    }
  }

  /**
   * Quadtree-spaced candidate selection shared by whole-map generation (generateTowns) and
   * scoped regeneration (regenerateInScope). Returns up to `count` cell ids from
   * `candidateCells`, spaced apart via the same shrinking-radius algorithm, without mutating
   * pack — callers are responsible for turning the returned cells into burgs.
   */
  private placeTowns(
    candidateCells: Iterable<number>,
    count: number,
    burgsQuadtree: Quadtree<[number, number]>
  ): number[] {
    const { cells } = this.worldContext.pack;
    const sorted = Array.from(candidateCells);
    const placed: number[] = [];
    if (!count || !sorted.length) return placed;

    const randomize = (score: number) => score * gauss(1, 3, 0, 20, 3);
    const score = new Int16Array(cells.s.map(randomize));
    sorted.sort((a, b) => score[b] - score[a]);

    let spacing = (this.worldContext.graphWidth + this.worldContext.graphHeight) / 150 / (count ** 0.7 / 66);

    for (let added = 0; added < count && spacing > 1; ) {
      for (let i = 0; added < count && i < sorted.length; i++) {
        const cell = sorted[i];
        if (cells.burg[cell]) continue;
        const [x, y] = cells.p[cell];

        const minSpacing = spacing * gauss(1, 0.3, 0.2, 2, 2); // randomize to make placement not uniform
        if (burgsQuadtree.find(x, y, minSpacing) !== undefined) continue; // too close to existing burg

        placed.push(cell);
        burgsQuadtree.add([x, y]);
        added++;
      }

      spacing *= 0.5;
    }

    return placed;
  }

  /**
   * Regenerates non-locked, non-capital burgs within `cellIds` (e.g. one state or province):
   * removes them, places the same number of new burgs among the scope's free populated cells,
   * and rescales the new burgs' population so the scope's total urban population is preserved.
   * Capitals are left untouched — relocating them has much larger ripple effects (diplomacy,
   * state label anchor) than a plain town.
   */
  regenerateInScope(cellIds: Iterable<number>): { addedBurgIds: number[]; removedBurgIds: number[] } {
    const { pack } = this.worldContext;
    const { cells } = pack;
    const scope = new Set(cellIds);

    const targetBurgs = pack.burgs.filter(b => b.i && !b.removed && !b.lock && !b.capital && scope.has(b.cell));
    if (!targetBurgs.length) return { addedBurgIds: [], removedBurgIds: [] };

    const oldUrbanTotal = targetBurgs.reduce((sum, b) => sum + (b.population ?? 0), 0);
    const removedBurgIds = targetBurgs.map(b => b.i as number);
    for (const burgId of removedBurgIds) this.remove(burgId);

    const candidateCells = Array.from(scope).filter(i => cells.s[i] > 0 && cells.culture[i] && !cells.burg[i]);
    const burgsQuadtree = quadtree<[number, number]>(
      pack.burgs.filter(b => b.i && !b.removed).map(b => [b.x, b.y] as [number, number])
    );
    const placedCells = this.placeTowns(candidateCells, removedBurgIds.length, burgsQuadtree);

    const addedBurgIds = placedCells.map(cell => this.add(cells.p[cell]).burgId);

    const rawSum = addedBurgIds.reduce((sum, id) => sum + (pack.burgs[id].population ?? 0), 0);
    if (rawSum > 0) {
      const scale = oldUrbanTotal / rawSum;
      for (const id of addedBurgIds) pack.burgs[id].population = rn((pack.burgs[id].population ?? 0) * scale, 3);
    }

    return { addedBurgIds, removedBurgIds };
  }

  getType(cellId: number, port?: number) {
    const { pack } = this.worldContext;
    const { cells, features } = pack;

    if (port) return "Naval";

    const haven = cells.haven[cellId];
    if (haven !== undefined && features[cells.f[haven]].type === "lake") return "Lake";

    if (cells.h[cellId] > 60) return "Highland";

    if (cells.r[cellId] && cells.fl[cellId] >= 100) return "River";

    const biome = cells.biomeCode[cellId];
    const population = cells.pop[cellId];
    const { biomesData } = this.worldContext;
    if (!cells.burg[cellId] || population <= 5) {
      if (population < 5 && isNomadicBiome(biomesData, biome)) return "Nomadic";
      if (isForestBiome(biomesData, biome)) return "Hunting";
    }

    return "Generic";
  }

  private definePopulation(burg: Burg) {
    const { pack } = this.worldContext;
    const cellId = burg.cell;
    let population = pack.cells.s[cellId] / 5;
    const terrainCapacity = pack.cells.capacity[cellId] ?? 0;
    const localFoodCapacity = getCellSubsistenceCapacity(pack.cells, cellId);
    // Cities begin as service centres of their local rural base. Trade can raise
    // their effective capacity later, but a food-poor cell must not start dense.
    if (terrainCapacity > 0) population *= localFoodCapacity / terrainCapacity;
    if (burg.capital) population *= 1.5;
    const connectivityRate = Routes.getConnectivityRate(cellId);
    if (connectivityRate) population *= connectivityRate;
    const culture = pack.cultures[burg.culture ?? 0];
    if (getRaceById(pack.races, culture?.race)?.key === "giant") {
      // The source cell has an elevated strategic score to guarantee a Giant capital; it must
      // not turn that score into human-scale population.
      population = Math.min(population, Math.max(localFoodCapacity, 0.01));
    }
    population *= gauss(1, 1, 0.25, 4, 5); // randomize
    population += (((burg.i as number) % 100) - (cellId % 100)) / 1000; // unround
    const capacity = rn(Math.max(population, 0.01), 3);

    const initialPopulationSaturation = useOptionsState.getState().initialPopulationSaturation / 100;
    burg.population = rn(capacity * initialPopulationSaturation, 3);
    // Group is usually assigned later in defineGroup(); apply default shares first, then
    // applyDemographics() after the group is known so fort/monastery/etc. get the right mix.
    this.applyDemographics(burg, capacity);
  }

  /**
   * Rebuild age/sex buckets from total population using the burg group's demographic profile.
   * Preserves capacity when already present; pass `capacity` on first population definition.
   */
  applyDemographics(burg: Burg, capacity?: number): void {
    const population = burg.population ?? 0;
    const resolvedCapacity = capacity ?? burg.demographics?.capacity ?? population;
    const effectiveCapacity = burg.demographics?.effectiveCapacity ?? resolvedCapacity;
    burg.demographics = buildBurgDemographics(population, resolvedCapacity, burg.group, effectiveCapacity);
  }

  private defineEmblem(burg: Burg) {
    const { pack } = this.worldContext;
    burg.type = this.getType(burg.cell, burg.port);

    const state = pack.states[burg.state as number];
    const stateCOA = state.coa;

    let kinship = 0.25;
    if (burg.capital) kinship += 0.1;
    else if (burg.port) kinship -= 0.1;
    if (burg.culture !== state.culture) kinship -= 0.25;

    const type = burg.capital && P(0.2) ? "Capital" : burg.type === "Generic" ? "City" : burg.type;
    burg.coa = COA.generate(stateCOA, kinship, null, type);
    burg.coa.shield = COA.getShield(burg.culture!, burg.state!);
  }

  /**
   * Precomputes the data needed to score how strategically important a burg's
   * location is: hostile-border proximity (from Relations History) and
   * agricultural potential ("breadbasket") derived from cell habitability
   * (`cells.s`), which is available long before the optional Economy
   * extension ever runs — see AGENTS.md §7 on not depending on extensions.
   */
  private computeStrategicContext(pack: WorldContext["pack"], currentYear: number): StrategicContext {
    const { cells } = pack;
    const frontiers = analyzeFrontiers(pack, currentYear);
    const contestedBurgs = getChronicleContestedBurgs(pack);

    const populatedScores = Array.from(cells.i)
      .filter(i => cells.pop[i] > 0)
      .map(i => cells.s[i]);
    const meanS = mean(populatedScores) ?? 0;
    const maxS = d3max(populatedScores) ?? 0;

    return { frontiers, contestedBurgs, meanS, maxS };
  }

  /** Combined [0, 1] bonus applied on top of the population-based citadel roll. */
  private getStrategicCitadelBonus(burg: Burg, context: StrategicContext): number {
    const { frontiers, contestedBurgs, meanS, maxS } = context;

    let frontierBonus = 0;
    if (contestedBurgs.has(burg.i ?? -1)) {
      frontierBonus = 1;
    } else {
      const segments = frontiers.get(burg.state ?? 0);
      const segment = segments?.find(s => s.cells.includes(burg.cell));
      if (segment) frontierBonus = minmax(segment.threatWeight, 0, 1);
    }

    const breadbasketBonus = normalizeHabitability(this.worldContext.pack.cells.s[burg.cell], meanS, maxS);

    return minmax(frontierBonus + breadbasketBonus, 0, 1);
  }

  private defineFeatures(burg: Burg, strategicContext: StrategicContext) {
    const { pack } = this.worldContext;
    const pop = burg.population as number;
    const baseCitadel = Boolean(burg.capital || (pop > 50 && P(0.75)) || (pop > 15 && P(0.5)) || P(0.1));
    const strategicBonus = this.getStrategicCitadelBonus(burg, strategicContext) * MAX_STRATEGIC_CITADEL_BONUS;
    burg.citadel = Number(baseCitadel || (strategicBonus > 0 && P(strategicBonus)));
    burg.plaza = Number(
      Routes.isCrossroad(burg.cell) || (Routes.hasRoad(burg.cell) && P(0.7)) || pop > 20 || (pop > 10 && P(0.8))
    );
    burg.walls = Number(burg.capital || pop > 30 || (pop > 20 && P(0.75)) || (pop > 10 && P(0.5)) || P(0.1));
    burg.shanty = Number(pop > 60 || (pop > 40 && P(0.75)) || (pop > 20 && burg.walls && P(0.4)));
    const religion = pack.cells.religion[burg.cell] as number;
    const theocracy = pack.states[burg.state as number].form === "Theocracy";
    burg.temple = Number(
      (religion && theocracy && P(0.5)) || pop > 50 || (pop > 35 && P(0.75)) || (pop > 20 && P(0.5))
    );
  }

  getDefaultGroups() {
    return [
      {
        name: "capital",
        active: true,
        order: 9,
        features: { capital: true },
        preview: "watabou-city"
      },
      {
        name: "city",
        active: true,
        order: 8,
        percentile: 90,
        min: 5,
        preview: "watabou-city"
      },
      {
        name: "fort",
        active: true,
        features: { citadel: true, walls: false, plaza: false, port: false },
        order: 6,
        max: 1
      },
      {
        name: "monastery",
        active: true,
        features: { temple: true, walls: false, plaza: false, port: false },
        order: 5,
        max: 0.8
      },
      {
        name: "caravanserai",
        active: true,
        features: { port: false, plaza: true },
        order: 4,
        max: 0.8,
        biomeTags: ["desert", "nomadic", "scrub"]
      },
      {
        name: "trading_post",
        active: true,
        order: 3,
        features: { plaza: true },
        max: 0.8,
        biomeTags: ["forest", "wetland", "cold", "mountain"]
      },
      {
        name: "village",
        active: true,
        order: 2,
        minZoom: 9.5,
        min: 0.1,
        max: 2,
        preview: "watabou-village"
      },
      {
        name: "hamlet",
        active: true,
        order: 1,
        features: { plaza: false },
        max: 0.1,
        preview: "watabou-village"
      },
      {
        name: "town",
        active: true,
        order: 7,
        isDefault: true,
        preview: "watabou-city"
      }
    ];
  }

  defineGroup(burg: Burg, populations: number[]) {
    const { options, pack } = this.worldContext;
    if (burg.lock && burg.group) {
      // locked burgs: don't change group if it still exists
      const group = options.burgs.groups.find(g => g.name === burg.group);
      if (group) return;
    }

    const defaultGroup = options.burgs.groups.find(g => g.isDefault);
    if (!defaultGroup) {
      ERROR && console.error("No default group defined");
      return;
    }
    burg.group = defaultGroup.name;

    for (const group of options.burgs.groups) {
      if (!group.active) continue;

      if (group.min) {
        const isFit = (burg.population as number) >= group.min;
        if (!isFit) continue;
      }

      if (group.max) {
        const isFit = (burg.population as number) <= group.max;
        if (!isFit) continue;
      }

      if (group.features) {
        const isFit = Object.entries(group.features as Record<string, boolean>).every(
          ([feature, value]) => Boolean(burg[feature as keyof Burg]) === value
        );
        if (!isFit) continue;
      }

      if (group.biomes) {
        const isFit = group.biomes.includes(pack.cells.biomeCode[burg.cell]);
        if (!isFit) continue;
      }

      if (group.biomeTags?.length) {
        const code = pack.cells.biomeCode[burg.cell];
        const tags = this.worldContext.biomesData.tags?.[code] ?? [];
        const isFit = group.biomeTags.some(t => tags.includes(t as (typeof tags)[number]));
        if (!isFit) continue;
      }

      if (group.percentile) {
        const index = populations.indexOf(burg.population as number);
        const isFit = index >= Math.floor((populations.length * group.percentile) / 100);
        if (!isFit) continue;
      }

      burg.group = group.name; // apply fitting group
      return;
    }
  }

  specify(worldContext: WorldContext, viewContext: Readonly<ViewContext>, appServices: AppServices, state: WorldState) {
    this.worldContext = worldContext;
    this.viewContext = viewContext;
    this.appServices = appServices;
    const { pack, options } = state;
    TIME && console.time("specifyBurgs");

    const strategicContext = this.computeStrategicContext(pack, options.year ?? 0);

    pack.burgs.forEach(burg => {
      if (!burg.i || burg.removed || burg.lock) return;
      this.definePopulation(burg);
      this.defineEmblem(burg);
      this.defineFeatures(burg, strategicContext);
    });

    const populations = pack.burgs
      .filter(b => b.i && !b.removed)
      .map(b => b.population as number)
      .sort((a: number, b: number) => a - b); // ascending

    pack.burgs.forEach(burg => {
      if (!burg.i || burg.removed) return;
      this.defineGroup(burg, populations);
      // Re-apply after group so fort / monastery / etc. get specialised age/sex shares.
      if (!burg.lock) this.applyDemographics(burg);
    });

    TIME && console.timeEnd("specifyBurgs");
  }

  private createWatabouCityLinks(burg: Burg) {
    const { pack, seed, populationRate, urbanization } = this.worldContext;
    const cells = pack.cells;
    const { i, name, population: burgPopulation, cell } = burg;
    const burgSeed = String(burg.MFCG ?? seed + String(burg.i).padStart(4, "0"));

    const sizeRaw = 2.13 * ((burgPopulation! * populationRate) / worldContext.urbanDensity) ** 0.385;
    const size = minmax(Math.ceil(sizeRaw), 6, 100);
    const population = rn(burgPopulation! * populationRate * urbanization);

    const river = cells.r[cell] ? 1 : 0;
    const coast = Number((burg.port || 0) > 0);
    const sea = (() => {
      if (!coast || !cells.haven[cell]) return null;

      // calculate see direction: 0 = east, 0.5 = north, 1 = west, 1.5 = south
      const [x1, y1] = cells.p[cell];
      const [x2, y2] = cells.p[cells.haven[cell]];
      const deg = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;

      if (deg <= 0) return rn(normalize(Math.abs(deg), 0, 180), 2);
      return rn(2 - normalize(deg, 0, 180), 2);
    })();

    const biomeCode = cells.biomeCode[cell];
    const farms = +(
      isArableBiome(this.worldContext.biomesData, biomeCode) ||
      (river && isNomadicBiome(this.worldContext.biomesData, biomeCode))
    );

    const citadel = +(burg.citadel as number);
    const urban_castle = +(citadel && each(2)(i as number));

    const hub = Routes.isCrossroad(cell);
    const walls = +(burg.walls as number);
    const plaza = +(burg.plaza as number);
    const temple = +(burg.temple as number);
    const shantytown = +(burg.shanty as number);

    // pass the real number of land-route legs as the gate count; -1 lets watabou decide
    const gates = countBurgRoadLegs(burg) || -1;

    const style = "natural";

    const url = new URL("https://watabou.github.io/city-generator/");
    url.search = new URLSearchParams({
      name: name || "",
      population: population.toString(),
      size: size.toString(),
      seed: burgSeed,
      river: river.toString(),
      coast: coast.toString(),
      farms: farms.toString(),
      citadel: citadel.toString(),
      urban_castle: urban_castle.toString(),
      hub: hub.toString(),
      plaza: plaza.toString(),
      temple: temple.toString(),
      walls: walls.toString(),
      shantytown: shantytown.toString(),
      gates: gates.toString(),
      style
    }).toString();
    if (sea) url.searchParams.append("sea", sea.toString());

    const link = url.toString();
    return { link, preview: `${link}&preview=1` };
  }

  private createWatabouVillageLinks(burg: Burg) {
    const { pack, seed, populationRate, urbanization, grid } = this.worldContext;
    const { cells, features } = pack;
    const { i, population, cell } = burg;

    const burgSeed = seed + String(i).padStart(4, "0");
    const pop = rn(population! * populationRate * urbanization);
    const tags = [];

    if (cells.r[cell] && cells.haven[cell]) tags.push("estuary");
    else if (cells.haven[cell] && features[cells.f[cell]].cells === 1) tags.push("island,district");
    else if (burg.port) tags.push("coast");
    else if (cells.conf[cell]) tags.push("confluence");
    else if (cells.r[cell]) tags.push("river");
    else if (pop < 200 && each(4)(cell)) tags.push("pond");

    const connectivityRate = Routes.getConnectivityRate(cell);
    tags.push(connectivityRate > 1 ? "highway" : connectivityRate === 1 ? "dead end" : "isolated");

    const biome = cells.biomeCode[cell];
    const { biomesData } = this.worldContext;
    const arableHere = isArableBiome(biomesData, biome) || (cells.r[cell] && isNomadicBiome(biomesData, biome));
    if (!arableHere) tags.push("uncultivated");
    else if (each(6)(cell)) tags.push("farmland");

    const temp = grid.cells.temp[cells.g[cell]];
    if (temp <= 0 || temp > 28 || (temp > 25 && each(3)(cell))) tags.push("no orchards");

    if (!burg.plaza) tags.push("no square");
    if (burg.walls) tags.push("palisade");

    if (pop < 100) tags.push("sparse");
    else if (pop > 300) tags.push("dense");

    const width = (() => {
      if (pop > 1500) return 1600;
      if (pop > 1000) return 1400;
      if (pop > 500) return 1000;
      if (pop > 200) return 800;
      if (pop > 100) return 600;
      return 400;
    })();
    const height = rn(width / 2.05);

    const style = (() => {
      if (isDesertBiome(biomesData, biome)) return "sand";
      if (temp <= 5 || isColdBiome(biomesData, biome) || isSnowBiome(biomesData, biome)) return "snow";
      return "default";
    })();

    const url = new URL("https://watabou.github.io/village-generator/");
    url.search = new URLSearchParams({
      pop: pop.toString(),
      name: burg.name || "",
      seed: burgSeed,
      width: width.toString(),
      height: height.toString(),
      style,
      tags: tags.join(",")
    }).toString();

    const link = url.toString();
    return { link, preview: `${link}&preview=1` };
  }

  private createWatabouDwellingLinks(burg: Burg) {
    const { seed, populationRate, urbanization } = this.worldContext;
    const burgSeed = seed + String(burg.i).padStart(4, "0");
    const pop = rn(burg.population! * populationRate * urbanization);

    const tags = (() => {
      if (pop > 200) return ["large", "tall"];
      if (pop > 100) return ["large"];
      if (pop > 50) return ["tall"];
      if (pop > 20) return ["low"];
      return ["small"];
    })();

    const url = new URL("https://watabou.github.io/dwellings/");
    url.search = new URLSearchParams({
      pop: pop.toString(),
      name: "",
      seed: burgSeed,
      tags: tags.join(",")
    }).toString();

    const link = url.toString();
    return { link, preview: `${link}&preview=1` };
  }

  getPreview(burg: Burg): { link: string | null; preview: string | null } {
    const { options } = this.worldContext;
    const previewGeneratorsMap: Record<string, (burg: Burg) => { link: string | null; preview: string | null }> = {
      "watabou-city": (burg: Burg) => this.createWatabouCityLinks(burg),
      "watabou-village": (burg: Burg) => this.createWatabouVillageLinks(burg),
      "watabou-dwelling": (burg: Burg) => this.createWatabouDwellingLinks(burg)
    };
    if (burg.link) return { link: burg.link, preview: burg.link };

    const group = options.burgs.groups.find(g => g.name === burg.group);
    if (!group?.preview || !previewGeneratorsMap[group.preview]) return { link: null, preview: null };

    return previewGeneratorsMap[group.preview](burg);
  }

  add(
    [x, y]: [number, number],
    addOptions: {
      routeStateId?: number;
      allowExternalRouteFallback?: boolean;
      developPort?: boolean;
    } = {}
  ): { burgId: number; newRoute?: Route } {
    const { pack, options } = this.worldContext;
    const { cells } = pack;

    const burgId = pack.burgs.length;
    const cellId = findCell(x, y);
    const culture = cells.culture[cellId as number];
    const name = Names.getCulture(culture);
    const state = cells.state[cellId as number];
    const feature = cells.f[cellId as number];

    const burg: Burg = {
      cell: cellId as number,
      x,
      y,
      i: burgId,
      state,
      culture,
      name,
      feature,
      capital: 0,
      port: 0,
      security: 50,
      sanitation: 50,
      medicalCare: 50,
      // Every post-generation Burg (frontier incorporation's overseas beachheads,
      // rural settlement promotion, interactive placement) is founded at whatever
      // year the live simulation clock currently reads.
      foundedYear: simulationContext.currentYear
    };
    this.definePopulation(burg);
    this.defineEmblem(burg);
    COArenderer.add("burg", burgId, burg.coa as Emblem, x, y);
    this.defineFeatures(burg, this.computeStrategicContext(pack, options.year ?? 0));

    const populations = pack.burgs
      .filter(b => b.i && !b.removed)
      .map(b => b.population as number)
      .sort((a: number, b: number) => a - b); // ascending
    this.defineGroup(burg, populations);
    this.applyDemographics(burg);

    pack.burgs.push(burg);
    // Interactive and simulation-created burgs arrive after the generation
    // pipeline has bound existing burgs, so project this one immediately.
    if (this.worldContext === worldContext) bindSimulationBurg(burg, burgId, simulationContext);
    cells.burg[cellId as number] = burgId;

    if (addOptions.developPort) this.developPort(burg);

    // A new Burg joins the existing network immediately. Frontier outposts and
    // rural settlements do not call this method, so they stay route-free.
    const seaRoute =
      addOptions.routeStateId === undefined || !burg.port
        ? undefined
        : Routes.connectPort(cellId as number, addOptions.routeStateId);
    const stateRoute =
      seaRoute || Routes.hasSeaRoute(cellId as number) || addOptions.routeStateId === undefined
        ? undefined
        : Routes.connectFrontier(cellId as number, addOptions.routeStateId);
    const newRoute =
      seaRoute ??
      stateRoute ??
      (addOptions.routeStateId === undefined || addOptions.allowExternalRouteFallback
        ? Routes.connect(cellId as number)
        : undefined);

    return { burgId, newRoute };
  }

  changeGroup(burg: Burg, group?: string | null) {
    const { pack } = this.worldContext;
    if (group) {
      burg.group = group;
      // Explicit group assignment (e.g. burg editor): rebuild age/sex from the new profile.
      // Auto reassignment paths omit `group` so simulated demographics stay intact.
      this.applyDemographics(burg);
    } else {
      const validBurgs = pack.burgs.filter(b => b.i && !b.removed);
      const populations = validBurgs.map(b => b.population as number).sort((a, b) => a - b);
      this.defineGroup(burg, populations);
    }
  }

  remove(burgId: number) {
    const { pack, notes } = this.worldContext;
    const burg = pack.burgs[burgId];
    if (!burg) return tip(`Burg ${burgId} not found`, false, "error");

    pack.cells.burg[burg.cell] = 0;
    burg.removed = true;

    const noteId = notes.findIndex(note => note.id === `burg${burgId}`);
    if (noteId !== -1) notes.splice(noteId, 1);

    if (burg.coa) {
      delete burg.coa;
    }

    removeBurgIcon(worldContext, viewContext, appServices, burg.i!);
    removeBurgLabel(worldContext, viewContext, appServices, burg.i!);
  }
}
export const Burgs = new BurgModule();
