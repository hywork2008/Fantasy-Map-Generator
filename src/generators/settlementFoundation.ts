import { getInitialSettlementPatternPreset } from "../data/initialSettlementPatterns";
import type {
  SettlementFoundationPlan,
  SettlementLink,
  SettlementNode,
  SettlementRegion
} from "../types/settlementFoundation";
import type { InitialSettlementPattern } from "../types/WorldState";
import { createInitialPopulationCohorts } from "./initialPopulationCohorts";

type MutableNumberColumn = ArrayLike<number> & { [index: number]: number; fill(value: number): unknown };

/** The environmental and demographic columns needed by the Settlement Foundation Module. */
export interface SettlementFoundationCells {
  readonly i: ArrayLike<number>;
  readonly c: readonly (readonly number[])[];
  readonly s: ArrayLike<number>;
  readonly capacity: ArrayLike<number>;
  readonly h: ArrayLike<number>;
  readonly p: readonly (readonly [number, number])[];
  readonly r?: ArrayLike<number>;
  readonly harbor?: ArrayLike<number>;
  readonly t?: ArrayLike<number>;
  readonly biomeCode?: ArrayLike<number>;
  readonly conf?: ArrayLike<number>;
  readonly danger?: ArrayLike<number>;
  readonly g?: ArrayLike<number>;
  readonly pop: MutableNumberColumn;
  readonly children: MutableNumberColumn;
  readonly maleAdults: MutableNumberColumn;
  readonly femaleAdults: MutableNumberColumn;
  readonly elders: MutableNumberColumn;
}

export interface SettlementClimate {
  readonly temperature?: ArrayLike<number>;
  readonly precipitation?: ArrayLike<number>;
}

export interface SettlementFoundationResult {
  readonly plan: SettlementFoundationPlan;
  readonly settledCellCount: number;
  readonly suitableCellCount: number;
  readonly settledCapacity: number;
  readonly totalCapacity: number;
  readonly totalPopulation: number;
}

type ResourceKind = SettlementRegion["kind"];

/** Claimable land cell used for region growth (resource cores + hinterland). */
type SettledSite = {
  readonly id: number;
  readonly capacity: number;
  readonly score: number;
  readonly kind: ResourceKind;
  readonly x: number;
  readonly y: number;
  readonly isResource: boolean;
};

/**
 * Builds the pre-polity human geography for non-standard worlds. Its small
 * interface owns resource screening, compact settlement regions, settlement
 * nodes, links, and the population cohort placement derived from that plan.
 */
export function createSettlementFoundation(
  cells: SettlementFoundationCells,
  climate: SettlementClimate,
  pattern: Exclude<InitialSettlementPattern, "standard">,
  initialPopulationSaturation: number,
  random: () => number = Math.random,
  minimumRegionCount = 0,
  /**
   * Optional override for share of suitable capacity that becomes oikoumene
   * (settled footprint). When omitted, uses the pattern preset's settledFootprint.
   */
  oikoumeneLandShare?: number
): SettlementFoundationResult {
  const preset = getInitialSettlementPatternPreset(pattern);
  const saturation = clamp(initialPopulationSaturation, 0, 1);
  const { sites, resources, totalCapacity } = collectSites(cells, climate, random);
  clearPopulation(cells);

  if (!sites.length || !resources.length || saturation === 0) {
    return emptyFoundationResult(sites.length, totalCapacity);
  }

  const regionCount = selectRegionCount(preset.settlementRegionCount, resources.length, random, minimumRegionCount);
  const centers = selectRegionCenters(resources, regionCount, random);
  const footprint =
    oikoumeneLandShare !== undefined && Number.isFinite(oikoumeneLandShare)
      ? clamp(oikoumeneLandShare, 0.1, 0.95)
      : preset.settledFootprint;
  // Footprint is a share of *habitable land capacity* (not only river/coast cores).
  // Expanding only through resource-screened candidates left thin corridors that
  // made Marches/45% look identical to Frontier/30% on normal climate maps.
  const targetCapacity = totalCapacity * footprint;
  const regions = buildRegions(cells, sites, centers, targetCapacity, preset.settlementClustering, footprint);
  const sitesById = new Map(sites.map(site => [site.id, site]));
  const selected = regions
    .flatMap(region => region.cells.map(id => sitesById.get(id)))
    .filter((site): site is SettledSite => site !== undefined);
  const settledCapacity = selected.reduce((sum, site) => sum + site.capacity, 0);
  // Population density within the oikoumene: global saturation vs settled capacity.
  const populationScale = settledCapacity
    ? Math.min(1, (totalCapacity * Math.max(saturation, 0.15)) / settledCapacity)
    : 0;
  const totalPopulation = placeCohorts(cells, selected, populationScale);
  const nodes = createNodes(regions, sites, random);
  const links = createLinks(nodes, sites);

  return {
    plan: { regions, nodes, links },
    settledCellCount: selected.length,
    suitableCellCount: sites.length,
    settledCapacity,
    totalCapacity,
    totalPopulation
  };
}

/**
 * Habitable land forms the claimable field. Resource sites (river/lake/coast/
 * spring) score higher and become region centers; hinterland fills out polity
 * islands so oikoumene land share maps to visible land coverage.
 *
 * Suitability already comes from rankCells (`s` / `capacity`). We do not
 * re-filter hinterland with a second precipitation gate — that left only thin
 * river corridors and made land-share changes invisible.
 */
function collectSites(
  cells: SettlementFoundationCells,
  climate: SettlementClimate,
  random: () => number
): { sites: SettledSite[]; resources: SettledSite[]; totalCapacity: number } {
  const sites: SettledSite[] = [];
  const resources: SettledSite[] = [];
  let totalCapacity = 0;

  for (let index = 0; index < cells.i.length; index++) {
    const id = cells.i[index];
    const capacity = cells.capacity[id] ?? 0;
    // rankCells already zeroed uninhabitable / zero-habitability land.
    if ((cells.s[id] ?? 0) <= 0 || capacity <= 0 || (cells.h[id] ?? 0) < 20) continue;

    const temperature = getClimateValue(climate.temperature, cells.g?.[id] ?? id, 12);
    const precipitation = getClimateValue(climate.precipitation, cells.g?.[id] ?? id, 45);
    const danger = cells.danger?.[id] ?? 0;
    const terrainScore = getTerrainScore(cells.h[id] ?? 0);
    const forestResourceScore = isForestBiomeCode(cells.biomeCode?.[id]) ? 1.12 : 1;
    const [x, y] = cells.p[id];
    const resourceKind = getResourceKind(cells, id, climate);
    const climateScore = getClimateScore(temperature, precipitation, resourceKind);

    // Extreme temperature still blocks settlement even if residual capacity remains.
    if (temperature < -18 || temperature > 42) continue;

    totalCapacity += capacity;

    if (resourceKind && climateScore > 0) {
      const resourceBonus =
        resourceKind === "river" ? 1.35 : resourceKind === "lake" ? 1.2 : resourceKind === "coast" ? 1.1 : 0.9;
      const site: SettledSite = {
        id,
        capacity,
        kind: resourceKind,
        x,
        y,
        isResource: true,
        score:
          capacity *
          resourceBonus *
          climateScore *
          terrainScore *
          forestResourceScore *
          Math.max(0.05, 1 - danger / 160) *
          (0.97 + random() * 0.06)
      };
      sites.push(site);
      resources.push(site);
      continue;
    }

    // Hinterland: any remaining suitable land is claimable countryside.
    const livability = getLivabilityScore(temperature, precipitation, resourceKind);
    sites.push({
      id,
      capacity,
      kind: "spring",
      x,
      y,
      isResource: false,
      score:
        capacity *
        0.35 *
        Math.max(0.2, livability || 0.45) *
        terrainScore *
        Math.max(0.05, 1 - danger / 160) *
        (0.97 + random() * 0.06)
    });
  }

  return { sites, resources, totalCapacity };
}

function getResourceKind(
  cells: SettlementFoundationCells,
  id: number,
  climate: SettlementClimate
): ResourceKind | null {
  if (cells.r?.[id]) return "river";
  if (cells.harbor?.[id]) return cells.t?.[id] === 1 ? "coast" : "lake";
  if (cells.t?.[id] === 1) return "coast";
  if ((cells.conf?.[id] ?? 0) > 0) return "spring";
  // Rain-fed land is represented as a local spring-like resource. It is a
  // fallback only; rivers, lakes, and coasts always outrank it.
  const precipitation = getClimateValue(climate.precipitation, cells.g?.[id] ?? id, 45);
  return precipitation >= 45 ? "spring" : null;
}

function getClimateScore(temperature: number, precipitation: number, kind: ResourceKind | null): number {
  if (!kind) return 0;
  if (temperature < -18 || temperature > 42) return 0;
  // The current climate model has no separate growing-season column. This
  // temperature-derived score is the local growing-season adapter until one
  // exists in WorldContext.
  const growingSeasonScore = temperature < -5 ? 0.2 : temperature < 2 ? 0.5 : temperature > 34 ? 0.55 : 1;
  const precipitationScore =
    precipitation < 8 ? (kind === "river" || kind === "lake" ? 0.2 : 0) : precipitation < 20 ? 0.55 : 1;
  return growingSeasonScore * precipitationScore;
}

/** Livability for hinterland claimability (0 = exclude from oikoumene field). */
function getLivabilityScore(temperature: number, precipitation: number, kind: ResourceKind | null): number {
  if (temperature < -18 || temperature > 42) return 0;
  const growingSeasonScore = temperature < -5 ? 0.2 : temperature < 2 ? 0.5 : temperature > 34 ? 0.55 : 1;
  if (kind === "river" || kind === "lake") {
    const precipitationScore = precipitation < 8 ? 0.25 : precipitation < 20 ? 0.6 : 1;
    return growingSeasonScore * precipitationScore;
  }
  // Non-water hinterland needs some rainfall; true desert stays wild.
  if (precipitation < 8) return 0;
  const precipitationScore = precipitation < 20 ? 0.35 : precipitation < 45 ? 0.7 : 1;
  return growingSeasonScore * precipitationScore;
}

function getTerrainScore(height: number): number {
  if (height >= 70) return 0.2;
  if (height >= 55) return 0.55;
  return 1;
}

/** Forest resource bonus uses the catalog forest tag when biomesData is available. */
function isForestBiomeCode(biomeCode: number | undefined, isForest?: (code: number) => boolean): boolean {
  if (biomeCode === undefined) return false;
  if (isForest) return isForest(biomeCode);
  // Fallback when only a bare code is available (legacy tests): historical forest band
  return biomeCode >= 5 && biomeCode <= 9;
}

function getClimateValue(column: ArrayLike<number> | undefined, index: number, fallback: number): number {
  return column?.[index] ?? fallback;
}

function selectRegionCount(
  range: readonly [number, number],
  resourceCount: number,
  random: () => number,
  minimumRegionCount: number
): number {
  const [minimum, maximum] = range;
  if (resourceCount === 0) return 0;
  const selected = minimum + Math.floor(random() * (maximum - minimum + 1));
  return Math.min(resourceCount, Math.max(selected, Math.max(0, Math.floor(minimumRegionCount))));
}

function selectRegionCenters(resources: SettledSite[], count: number, random: () => number): SettledSite[] {
  const ranked = [...resources].sort((a, b) => b.score - a.score || a.id - b.id);
  const centers: SettledSite[] = [ranked[0]];
  const diagonal = Math.max(
    1,
    Math.hypot(
      Math.max(...resources.map(site => site.x)) - Math.min(...resources.map(site => site.x)),
      Math.max(...resources.map(site => site.y)) - Math.min(...resources.map(site => site.y))
    )
  );

  while (centers.length < count) {
    const next = ranked
      .filter(site => !centers.includes(site))
      .map(site => {
        const nearest = Math.min(...centers.map(center => Math.hypot(site.x - center.x, site.y - center.y)));
        const quality = site.score / ranked[0].score;
        // Foundation regions are the starting points for separate polities.
        // Once the best site is chosen, geographic separation is deliberately
        // more important than a small local resource-score advantage.
        const score = (nearest / diagonal) * 0.76 + quality * 0.24;
        return { site, score: score * (0.98 + random() * 0.04) };
      })
      .sort((a, b) => b.score - a.score || b.site.score - a.site.score || a.site.id - b.site.id)[0]?.site;
    if (!next) break;
    centers.push(next);
  }

  return centers;
}

function buildRegions(
  cells: SettlementFoundationCells,
  sites: SettledSite[],
  centers: SettledSite[],
  targetCapacity: number,
  settlementClustering: number,
  footprint: number
): SettlementRegion[] {
  const sitesById = new Map(sites.map(site => [site.id, site]));
  const claimed = new Set<number>();
  const totalCenterScore = centers.reduce((sum, center) => sum + center.score, 0) || centers.length;
  const maxHops = getMaximumRegionHops(sites.length, settlementClustering, footprint, centers.length);

  return centers.map((center, id) => {
    const budget = targetCapacity * (center.score / totalCenterScore);
    const cellsInRegion = expandCompactRegion(cells, sitesById, center.id, budget, claimed, maxHops);
    const kind = center.kind;
    return { id, kind, center: center.id, cells: cellsInRegion };
  });
}

function expandCompactRegion(
  cells: SettlementFoundationCells,
  sitesById: ReadonlyMap<number, SettledSite>,
  center: number,
  capacityBudget: number,
  claimed: Set<number>,
  maximumHops: number
): number[] {
  const queued = new Set<number>([center]);
  const queue = [{ cell: center, hops: 0 }];
  const selected: number[] = [];
  let capacity = 0;

  while (queue.length && capacity < capacityBudget) {
    const { cell: current, hops } = queue.shift()!;
    const site = sitesById.get(current);
    if (site && !claimed.has(current)) {
      selected.push(current);
      claimed.add(current);
      capacity += site.capacity;
    }

    if (hops >= maximumHops) continue;
    for (const neighbor of cells.c[current] ?? []) {
      // Grow through any claimable habitable site (resource core or hinterland).
      if (queued.has(neighbor) || claimed.has(neighbor) || !sitesById.has(neighbor)) continue;
      queued.add(neighbor);
      queue.push({ cell: neighbor, hops: hops + 1 });
    }
  }

  // A neighbouring region can have claimed every nearby site. Retaining
  // its resource center is more important than silently dropping that region.
  if (!selected.length && sitesById.has(center)) {
    selected.push(center);
    claimed.add(center);
  }
  return selected;
}

/**
 * Region growth hop cap. Must be large enough that regions can actually meet
 * their capacity budget for the requested oikoumene footprint; previously a
 * tiny hop radius made Marches/45% look identical to Frontier/30%.
 *
 * Approximate: N regions of hop-radius r cover ~N·r² of the habitable field.
 * We scale r with sqrt(habitable · footprint / N).
 */
function getMaximumRegionHops(
  habitableCount: number,
  settlementClustering: number,
  footprint: number,
  regionCount: number
): number {
  const compactness = clamp(settlementClustering, 0, 1);
  const n = Math.max(1, regionCount);
  const share = clamp(footprint, 0.1, 0.95);
  // Cells per region if footprint were filled evenly.
  const cellsPerRegion = Math.max(8, (habitableCount * share) / n);
  // BFS hop radius for a compact blob ~ sqrt(area); inflate when clustering is low.
  const radius = Math.sqrt(cellsPerRegion) * (1.2 + (1 - compactness) * 0.9);
  return Math.max(10, Math.min(100, Math.round(radius)));
}

function createNodes(
  regions: readonly SettlementRegion[],
  sites: SettledSite[],
  random: () => number
): SettlementNode[] {
  const sitesById = new Map(sites.map(site => [site.id, site]));
  const nodes: SettlementNode[] = [];

  for (const region of regions) {
    const regionSites = region.cells
      .map(id => sitesById.get(id))
      .filter((site): site is SettledSite => site !== undefined)
      // Prefer resource cores for burgs/nodes; hinterland only if needed.
      .sort((a, b) => Number(b.isResource) - Number(a.isResource) || b.score - a.score);
    // Node density scales with region size but stays sparse enough for polity capitals.
    const desiredNodes = Math.max(1, Math.min(regionSites.length, Math.ceil(Math.sqrt(regionSites.length) * 1.35)));
    const chosen: SettledSite[] = [];
    const center = sitesById.get(region.center);
    if (center) chosen.push(center);

    while (chosen.length < desiredNodes) {
      const next = regionSites
        .filter(site => !chosen.includes(site))
        .map(site => ({
          site,
          score:
            site.score *
            (site.isResource ? 1.25 : 0.85) *
            Math.min(...chosen.map(node => Math.max(1, Math.hypot(site.x - node.x, site.y - node.y)))) *
            (0.99 + random() * 0.02)
        }))
        .sort((a, b) => b.score - a.score)[0]?.site;
      if (!next) break;
      chosen.push(next);
    }

    for (const site of chosen) {
      nodes.push({
        id: nodes.length,
        regionId: region.id,
        cell: site.id,
        role: site.id === region.center ? "center" : "village",
        score: site.score
      });
    }
  }
  return nodes;
}

function createLinks(nodes: readonly SettlementNode[], sites: SettledSite[]): SettlementLink[] {
  const siteByCell = new Map(sites.map(site => [site.id, site]));
  const links: SettlementLink[] = [];

  for (const node of nodes) {
    const earlier = nodes.filter(other => other.regionId === node.regionId && other.id < node.id);
    if (!earlier.length) continue;
    const nearest = earlier.reduce(
      (best, other) => {
        const distance = squaredDistance(node, other, siteByCell);
        return distance < best.distance ? { node: other, distance } : best;
      },
      { node: earlier[0], distance: Infinity }
    ).node;
    const from = siteByCell.get(node.cell)!;
    const to = siteByCell.get(nearest.cell)!;
    links.push({ fromNodeId: nearest.id, toNodeId: node.id, kind: getLinkKind(from, to) });
  }
  return links;
}

function squaredDistance(left: SettlementNode, right: SettlementNode, sites: ReadonlyMap<number, SettledSite>): number {
  const from = sites.get(left.cell)!;
  const to = sites.get(right.cell)!;
  return (from.x - to.x) ** 2 + (from.y - to.y) ** 2;
}

function getLinkKind(from: SettledSite, to: SettledSite): SettlementLink["kind"] {
  if (from.kind === "river" && to.kind === "river" && from.isResource && to.isResource) return "river";
  if (from.kind === "coast" && to.kind === "coast" && from.isResource && to.isResource) return "coastal";
  return "trail";
}

function placeCohorts(cells: SettlementFoundationCells, selected: readonly SettledSite[], scale: number): number {
  let totalPopulation = 0;
  for (const site of selected) {
    const cohorts = createInitialPopulationCohorts(site.capacity, scale);
    cells.pop[site.id] = cohorts.population;
    cells.children[site.id] = cohorts.children;
    cells.maleAdults[site.id] = cohorts.maleAdults;
    cells.femaleAdults[site.id] = cohorts.femaleAdults;
    cells.elders[site.id] = cohorts.elders;
    totalPopulation += cohorts.population;
  }
  return totalPopulation;
}

function clearPopulation(cells: SettlementFoundationCells): void {
  cells.pop.fill(0);
  cells.children.fill(0);
  cells.maleAdults.fill(0);
  cells.femaleAdults.fill(0);
  cells.elders.fill(0);
}

function emptyFoundationResult(suitableCellCount: number, totalCapacity: number): SettlementFoundationResult {
  return {
    plan: { regions: [], nodes: [], links: [] },
    settledCellCount: 0,
    suitableCellCount,
    settledCapacity: 0,
    totalCapacity,
    totalPopulation: 0
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
