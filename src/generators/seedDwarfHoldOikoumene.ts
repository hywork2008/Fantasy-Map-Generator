/**
 * Dwarf hold seeding — Phase 2 of docs/plan/underground-realm-and-supernatural-areas.md §3.4.
 *
 * Claims the best available `wildCavern` SubterraneanDomain (produced by `caveSystems.ts`, Phase
 * 1) for the Dwarf culture, the same "guarantee a native settlement candidate at a protected
 * anchor" idea as `giantHighlandOikoumene.ts`, but domain-based rather than watershed-based, and
 * capacity comes from `undergroundFoodWeb.ts`'s computed formula rather than a flat multiplier
 * (docs §4, §7.1).
 *
 * Two call sites cooperate (docs §3.1, §3.4, §7.3):
 *   - `seedDwarfHoldOikoumene` itself runs between `Cultures.expand` and
 *     `applyInitialSettlementPattern`, exactly like Giant. It repaints culture/capacity/`s` at the
 *     domain, which is enough for `standard` maps (legacy all-suitable-cell candidate pool).
 *   - `withDwarfMountainRegion` runs *after* `applyInitialSettlementPattern` returns, injecting a
 *     `"mountain"` SettlementRegion + a `mandatoryCapital` SettlementNode into the Foundation plan
 *     for `frontier`/`marches`/etc — `giantHighlandOikoumene.ts`'s call site (inside
 *     `Burgs.generate`, after Foundation) is a known constraint to avoid repeating, not a
 *     precedent to imitate (docs §7.3): calling only the `cells.s` boost after Foundation would
 *     risk the one-cell-enclave failure `dwarf.md` §4 warns about.
 */
import type { WorldContext } from "../context/worldContext";
import { isFantasyCulturesSet } from "../data/raceCivicStance";
import { getRaceById } from "../data/races";
import type { SubterraneanDomain } from "../types/models";
import type { SettlementFoundationPlan, SettlementNode, SettlementRegion } from "../types/settlementFoundation";
import { createInitialPopulationCohorts } from "./initialPopulationCohorts";
import { computeUndergroundDomainCapacity } from "./undergroundFoodWeb";

export interface DwarfHoldOikoumene {
  cultureId: number;
  raceId: number;
  domain: SubterraneanDomain;
  anchorCell: number;
}

/**
 * Seeds the Dwarf hold after Cultures.expand and before Settlement Foundation. No-op (returns
 * null) unless the map is a Fantasy culture set, a Dwarf culture exists, and at least one
 * `wildCavern` domain was generated (docs §3.3's oikoumene-land-share-independent guarantee: "no
 * mountains ⇒ no forced Dwarf nation").
 */
export function seedDwarfHoldOikoumene(
  world: WorldContext,
  culturesSet: string | undefined,
  initialPopulationSaturation: number
): DwarfHoldOikoumene | null {
  if (!isFantasyCulturesSet(culturesSet)) return null;
  const { pack } = world;
  const dwarfCultures = pack.cultures.filter(
    culture => culture?.i && getRaceById(pack.races, culture.race)?.key === "dwarf"
  );
  if (!dwarfCultures.length) return null;

  const wildCaverns = (pack.subterraneanDomains ?? []).filter(domain => domain.kind === "wildCavern");
  if (!wildCaverns.length) return null;

  const domain = [...wildCaverns].sort((a, b) => b.voidVolume - a.voidVolume || a.i - b.i)[0]!;
  const dwarfCulture = [...dwarfCultures].sort((a, b) => a.i - b.i)[0]!;
  const dwarfRace = getRaceById(pack.races, dwarfCulture.race);
  const populationCapacityMultiplier = dwarfRace?.environmentalSurvival?.populationCapacityMultiplier ?? 0.3;

  const anchorCell = pickAnchorCell(pack.cells, domain);

  // Claim the domain for this culture before repainting cells, so the reference-density filter
  // below (which reads culture race) already sees the new ownership — same ordering as
  // giantHighlandOikoumene.ts.
  domain.kind = "dwarfHold";
  domain.raceId = dwarfCulture.race;
  dwarfCulture.center = anchorCell;
  dwarfCulture.type = "Highland";
  for (const cell of domain.cells) pack.cells.culture[cell] = dwarfCulture.i;

  const isOrdinaryHumanCell = (cell: number): boolean => {
    const culture = pack.cultures[pack.cells.culture[cell]];
    const race = getRaceById(pack.races, culture?.race);
    return (pack.cells.capacity[cell] ?? 0) > 0 && !race?.environmentalSurvival;
  };
  const allCells = Array.from(pack.cells.i);
  const humanCells = allCells.filter(isOrdinaryHumanCell);
  const humanArea = humanCells.reduce((sum, cell) => sum + Math.max(pack.cells.area[cell] ?? 0, 1), 0);
  const humanCapacity = humanCells.reduce((sum, cell) => sum + Math.max(pack.cells.capacity[cell] ?? 0, 0), 0);
  const referenceHumanDensity = humanArea > 0 ? humanCapacity / humanArea : 0.1;
  const meanArea =
    allCells.reduce((sum, cell) => sum + Math.max(pack.cells.area[cell] ?? 0, 1), 0) / Math.max(allCells.length, 1);
  const highestHumanSuitability = Math.max(1, ...humanCells.map(cell => pack.cells.s[cell] ?? 0));
  const saturation = Math.min(0.6, Math.max(0.05, initialPopulationSaturation));

  if (!pack.cells.subterraneanCapacity || pack.cells.subterraneanCapacity.length !== pack.cells.i.length) {
    pack.cells.subterraneanCapacity = new Float32Array(pack.cells.i.length);
  }

  const capacityByCell = computeUndergroundDomainCapacity(
    domain.cells,
    pack.cells,
    { temperature: world.grid.cells.temp, precipitation: world.grid.cells.prec, gridIndexByCell: pack.cells.g },
    world.biomesData,
    referenceHumanDensity,
    populationCapacityMultiplier
  );

  for (const cell of domain.cells) {
    const capacity = capacityByCell.get(cell) ?? 0;
    pack.cells.subterraneanCapacity[cell] = capacity;
    // §7.2: capacity itself (the terrain ceiling) must rise too, or the next annual food
    // reconcile clamps subsistenceCapacity back to ~0 on a mountain cell with no surface capacity.
    pack.cells.capacity[cell] = Math.max(pack.cells.capacity[cell] ?? 0, capacity);
    // §7.1: additive with surface subsistence, not `max()` — a cell can have both a little
    // pastoral support and a fungus farm at once.
    if (pack.cells.subsistenceCapacity) {
      pack.cells.subsistenceCapacity[cell] = Math.min(
        pack.cells.capacity[cell],
        (pack.cells.subsistenceCapacity[cell] ?? 0) + capacity
      );
    }
    const area = Math.max(pack.cells.area[cell] ?? 0, 1);
    pack.cells.s[cell] = Math.max(pack.cells.s[cell] ?? 0, Math.max(1, Math.round((capacity * meanArea) / area)));
    const cohorts = createInitialPopulationCohorts(capacity, saturation);
    pack.cells.pop[cell] = cohorts.population;
    pack.cells.children[cell] = cohorts.children;
    pack.cells.maleAdults[cell] = cohorts.maleAdults;
    pack.cells.femaleAdults[cell] = cohorts.femaleAdults;
    pack.cells.elders[cell] = cohorts.elders;
  }

  // Same "beat human lowland capitals without raising real capacity" trick as Giant — needed for
  // the `standard` pattern's legacy candidate pool, which has no Foundation region to inject into.
  pack.cells.s[anchorCell] = Math.max(pack.cells.s[anchorCell], Math.ceil(highestHumanSuitability * 4));

  // Non-null: the dwarfCultures filter above already required getRaceById(..., culture.race) to
  // resolve to the "dwarf" race, which is impossible with culture.race undefined.
  return { cultureId: dwarfCulture.i, raceId: dwarfCulture.race!, domain, anchorCell };
}

function pickAnchorCell(cells: { h: ArrayLike<number> }, domain: SubterraneanDomain): number {
  const pool = domain.entrances.length ? domain.entrances : domain.cells;
  return [...pool].sort((a, b) => (cells.h[b] ?? 0) - (cells.h[a] ?? 0))[0]!;
}

/**
 * Injects a `"mountain"` SettlementRegion + `mandatoryCapital` SettlementNode for the Dwarf hold
 * into a Foundation plan (`frontier`/`marches`/etc only — `standard` has no plan and doesn't need
 * one; see module doc-comment). No-op when `hold` is null or `plan` is undefined.
 */
export function withDwarfMountainRegion(
  plan: SettlementFoundationPlan | undefined,
  hold: DwarfHoldOikoumene | null
): SettlementFoundationPlan | undefined {
  if (!plan || !hold) return plan;
  // Already present (idempotent re-entry, e.g. Playwright "regenerate" without a full reload).
  if (plan.regions.some(region => region.kind === "mountain" && region.center === hold.anchorCell)) return plan;

  const region: SettlementRegion = {
    id: plan.regions.length,
    kind: "mountain",
    center: hold.anchorCell,
    cells: hold.domain.cells
  };
  const node: SettlementNode = {
    id: plan.nodes.length,
    regionId: region.id,
    cell: hold.anchorCell,
    role: "center",
    // Large but finite: `ensureMandatoryCapitals` is what actually guarantees selection, this
    // score just keeps the node competitive if it also happens to win farthest-point selection
    // on its own merits. Infinity is avoided so it can't skew any average/sum a future caller
    // might compute over `plan.nodes`.
    score: Math.max(1000, hold.domain.voidVolume),
    mandatoryCapital: true
  };

  return {
    regions: [...plan.regions, region],
    nodes: [...plan.nodes, node],
    links: plan.links
  };
}
