import type { FrontierSegment } from "../../../generators/frontierAnalysis";
import { getProvinceThreats } from "../../hostCore";
import type { PackedGraph, State } from "../../hostTypes";
import { Characters } from "../generators/characterLifecycle";
import {
  getCurrentYear,
  getGaelicHoldingPeriod,
  getHoldingsLedger,
  getWorldContext,
  hasHoldingsStore,
  pruneGaelicHoldingPeriods,
  setGaelicHoldingPeriod,
  setHoldingsLedger
} from "../nobilityContext";
import { allocateGaelicHoldings, reconcileGaelicHoldings } from "./allocateGaelic";
import { regimeFor } from "./regime";
import { gaelicTitles } from "./titles";
import type {
  AllocateGaelicInput,
  FeudalRegime,
  GaelicCellInput,
  GaelicPeriod,
  GaelicProvinceInput,
  NobleHolding
} from "./types";

/**
 * Builds the Gaelic ledger and fills its named seats.
 * Death replaces the person and leaves the cells where they are.
 * A changed cell set is followed in place. Only a changed historical period redistributes.
 */

export function regimeForState(state: Pick<State, "i" | "culture" | "form" | "formName">): FeudalRegime | null {
  const world = getWorldContext();
  const culture = world.pack.cultures?.[state.culture];
  return regimeFor({
    cultureBase: culture?.base ?? -1,
    form: state.form,
    formName: state.formName,
    period: world.options?.historicalPeriod
  });
}

/**
 * Drops the ledger of every state that is not in `gaelicStateIds`: destroyed states and states
 * whose culture, form or period no longer selects the Gaelic procedure.
 */
export function pruneStaleHoldings(gaelicStateIds: ReadonlySet<number>): void {
  if (!hasHoldingsStore()) return;
  const ledger = getHoldingsLedger();
  const staleIds = new Set(ledger.filter(holding => !gaelicStateIds.has(holding.stateId)).map(holding => holding.id));
  if (staleIds.size) {
    retireHoldingTitles(staleIds, "Holding ledger dissolved");
    setHoldingsLedger(ledger.filter(holding => gaelicStateIds.has(holding.stateId)));
  }
  pruneGaelicHoldingPeriods(gaelicStateIds);
}

/**
 * Returns false when this state could not be handled (no ledger store, no land, or no
 * medieval period), so the caller can fall back to the frontier-lord procedure.
 */
export function assignGaelicProvinceLords(
  state: Pick<State, "i" | "culture" | "form" | "formName" | "capital" | "racialComposition">,
  segments: readonly FrontierSegment[] | undefined,
  materialize = true
): boolean {
  if (!hasHoldingsStore() || !state.i) return false;
  const period = gaelicPeriod(getWorldContext().options?.historicalPeriod);
  if (!period) return false;
  const input = readHoldingInput(state, period, segments);
  if (!input) return false;

  const ledger = getHoldingsLedger();
  const mine = ledger.filter(holding => holding.stateId === state.i && holding.retiredYear === undefined);
  const others = ledger.filter(holding => holding.stateId !== state.i || holding.retiredYear !== undefined);
  let next: NobleHolding[];
  if (mine.length && getGaelicHoldingPeriod(state.i) === period) {
    // Same period: follow cell changes and keep ids and holders.
    const result = reconcileGaelicHoldings(input, mine, nextHoldingId(ledger));
    if (materialize) retireHoldingTitles(new Set(result.retiredIds));
    next = result.holdings;
  } else {
    // First allocation or a new historical period: redistribute.
    if (materialize) retireHoldingTitles(new Set(mine.map(holding => holding.id)));
    if (materialize && !mine.length) retireLegacyProvinceLords(state.i);
    next = stampIds(allocateGaelicHoldings(input), nextHoldingId(ledger));
    setGaelicHoldingPeriod(state.i, period);
  }
  if (materialize) fillSeats(state, next);
  const retired = materialize
    ? []
    : mine.filter(h => !next.some(n => n.id === h.id)).map(h => ({ ...h, retiredYear: getCurrentYear() }));
  setHoldingsLedger([...others, ...retired, ...next]);
  return true;
}

function gaelicPeriod(period: string | undefined): GaelicPeriod | null {
  if (period === "earlyMedieval" || period === "highMedieval" || period === "lateMedieval") return period;
  return null;
}

export function readHoldingInput(
  state: Pick<State, "i" | "capital">,
  period: GaelicPeriod,
  segments: readonly FrontierSegment[] | undefined
): AllocateGaelicInput | null {
  const world = getWorldContext();
  const pack = world.pack;
  const cells = pack.cells as CellsView | undefined;
  if (!cells?.state) return null;
  const populationRate = numberOr(world.populationRate, 1000);
  const urbanization = numberOr(world.urbanization, 1);
  const distanceScale = numberOr(world.distanceScale, 1);
  const count = cells.i?.length ?? cells.state.length;
  const list: GaelicCellInput[] = [];
  const burgs = pack.burgs ?? [];
  for (let id = 0; id < count; id += 1) {
    if (cells.state[id] !== state.i) continue;
    const height = cells.h?.[id];
    if (typeof height === "number" && height < 20) continue;
    const burgId = cells.burg?.[id] ?? 0;
    const burg = burgId > 0 ? burgs[burgId] : undefined;
    const neighbors = Array.from(cells.c?.[id] ?? []).filter(next => cells.state?.[next] === state.i);
    list.push({
      id,
      provinceId: cells.province?.[id] ?? 0,
      areaKm2: (cells.area?.[id] ?? 0) * distanceScale * distanceScale,
      ruralPeople: (cells.pop?.[id] ?? 0) * populationRate,
      burgId: burg && !burg.removed ? burgId : 0,
      burgName: burg?.name || (burgId > 0 ? `Burg ${burgId}` : ""),
      urbanPeople: burg && !burg.removed ? (burg.population ?? 0) * populationRate * urbanization : 0,
      height: typeof height === "number" ? height : 20,
      neighborIds: neighbors
    });
  }
  if (!list.length) return null;

  const provinces: GaelicProvinceInput[] = [];
  for (const province of pack.provinces ?? []) {
    if (!province?.i || province.removed || province.state !== state.i) continue;
    const seatBurgId = province.burg ?? 0;
    const seatCellId = seatBurgId > 0 ? (burgs[seatBurgId]?.cell ?? 0) : 0;
    provinces.push({
      id: province.i,
      name: province.name || `Province ${province.i}`,
      seatBurgId,
      seatCellId
    });
  }

  const capitalBurg = state.capital ? burgs[state.capital] : undefined;
  const threatened = new Set<number>();
  if (segments?.length) {
    for (const provinceId of getProvinceThreats(pack as PackedGraph, segments as FrontierSegment[]).keys()) {
      if (provinceId) threatened.add(provinceId);
    }
  }

  return {
    stateId: state.i,
    period,
    cells: list,
    provinces,
    capitalBurgId: state.capital ?? 0,
    capitalCellId: capitalBurg && !capitalBurg.removed ? capitalBurg.cell : undefined,
    threatenedProvinceIds: [...threatened]
  };
}

function fillSeats(
  state: Pick<State, "i" | "culture" | "form" | "formName" | "capital" | "racialComposition">,
  holdings: NobleHolding[]
): void {
  const holderByHolding = new Map<number, number>();
  for (const character of getWorldContext().pack.characters ?? []) {
    if (character.dead) continue;
    for (const title of character.titles) {
      if (!title.endYear && title.entityType === "holding") holderByHolding.set(title.entityId, character.i);
    }
  }
  for (const holding of holdings) {
    if (holding.holderKind !== "character") continue;
    const living = holderByHolding.get(holding.id);
    if (living !== undefined) {
      holding.holderCharacterId = living;
      continue;
    }
    const titles = gaelicTitles(holding);
    if (!titles) continue;
    const sheriff = holding.office === "sheriff";
    const appointed = sheriff || (holding.office === "thane" && !holding.hereditary);
    const created = Characters.createHoldingNoble(state, {
      titles,
      landed: !sheriff,
      holdingId: holding.id,
      seatName: holding.seatName || "Holding",
      locationBurgId: holding.seatBurgId || state.capital || 0,
      roleClass: sheriff ? "central_officer" : "province_lord",
      primarySkill: sheriff ? "stewardship" : "martial",
      age: appointed ? "officer" : "ruler"
    });
    holding.holderCharacterId = created.i;
  }
}

/** Frontier margraves from before the ledger existed. The ledger now owns this state's provincial seats. */
function retireLegacyProvinceLords(stateId: number): void {
  const { pack } = getWorldContext();
  const year = getCurrentYear();
  for (const character of pack.characters ?? []) {
    for (let index = character.titles.length - 1; index >= 0; index -= 1) {
      const title = character.titles[index];
      if (title.entityType !== "province" || pack.provinces?.[title.entityId]?.state !== stateId) continue;
      title.endYear = year;
      title.reason = "Holding ledger established";
      character.pastTitles = character.pastTitles ?? [];
      character.pastTitles.push(title);
      character.titles.splice(index, 1);
    }
  }
}

function retireHoldingTitles(holdingIds: ReadonlySet<number>, reason = "Holding redistributed"): void {
  if (!holdingIds.size) return;
  const year = getCurrentYear();
  for (const character of getWorldContext().pack.characters ?? []) {
    const titles = character.titles;
    if (!titles?.length) continue;
    for (let index = titles.length - 1; index >= 0; index -= 1) {
      const title = titles[index];
      if (!title) continue;
      if (title.entityType !== "holding" || !holdingIds.has(title.entityId)) continue;
      title.endYear = year;
      title.reason = reason;
      character.pastTitles = character.pastTitles ?? [];
      character.pastTitles.push(title);
      titles.splice(index, 1);
    }
  }
}

function stampIds(holdings: NobleHolding[], start: number): NobleHolding[] {
  return holdings.map((holding, index) => ({ ...holding, id: start + index }));
}

function nextHoldingId(holdings: readonly NobleHolding[]): number {
  return holdings.reduce((max, holding) => Math.max(max, holding.id), 0) + 1;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

interface CellsView {
  i?: ArrayLike<number>;
  c?: ArrayLike<ArrayLike<number>>;
  state?: ArrayLike<number>;
  province?: ArrayLike<number>;
  area?: ArrayLike<number>;
  pop?: ArrayLike<number>;
  h?: ArrayLike<number>;
  burg?: ArrayLike<number>;
}
