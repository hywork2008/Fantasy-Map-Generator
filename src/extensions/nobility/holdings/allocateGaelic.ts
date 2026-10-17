import type { AllocateGaelicInput, GaelicCellInput, GaelicPeriod, GaelicProvinceInput, NobleHolding } from "./types";

/**
 * Scottish-shaped ledger for name base 22 (Ireland, Wales, and Scotland share
 * that base). km² only limits how a block grows. Seat counts come from people
 * and towns. See docs/plan/medieval-european-nobility-holdings.md.
 */

export const GAELIC_FEE_DENSITY = 0.35;

const EARL_PEOPLE = 60_000;
const EARL_MIN_PEOPLE = 4_000;
const BARON_PEOPLE = 20_000;
const THANAGE_PEOPLE: Record<GaelicPeriod, number> = {
  earlyMedieval: 12_000,
  highMedieval: 24_000,
  lateMedieval: 60_000
};
const DEMESNE_SHARE: Record<GaelicPeriod, number> = {
  earlyMedieval: 0.2,
  highMedieval: 0.25,
  lateMedieval: 0.25
};
const CROWN_SHARE: Record<GaelicPeriod, number> = {
  earlyMedieval: 0,
  highMedieval: 0.1,
  lateMedieval: 0.15
};
const CHURCH_SHARE = 0.15;
const THANAGE_TARGET_KM2 = 800;
const THANAGE_MAX_KM2 = 1_500;
const BARONY_MIN_KM2 = 400;
const BARONY_MAX_KM2 = 4_000;
const SHERIFF_SPLIT_KM2 = 8_000;
const SHERIFF_EACH_KM2 = 4_000;
const HIGHLAND_RELIEF = 15;

/** England's fee formula, scaled by a regime density. Result is an integer quota, not a person. */
export function knightFeesFor(areaKm2: number, people: number, density: number): number {
  if (!(areaKm2 > 0) || !(people > 0) || !(density > 0)) return 0;
  const gross = (areaKm2 / 17) * density;
  const rounded = Math.round(Math.min(gross, people / 400));
  if (rounded <= 0) return 0;
  return Math.min(rounded, Math.floor(gross));
}

interface Working {
  readonly input: AllocateGaelicInput;
  readonly byId: Map<number, GaelicCellInput>;
  readonly provinceCells: Map<number, number[]>;
  readonly taken: Set<number>;
  readonly highland: Set<number>;
  readonly threatened: Set<number>;
  readonly separated: Set<number>;
  nextId: number;
  readonly holdings: NobleHolding[];
}

export function allocateGaelicHoldings(input: AllocateGaelicInput): NobleHolding[] {
  if (!input.cells.length) return [];
  const byId = new Map(input.cells.map(cell => [cell.id, cell]));
  const provinceCells = new Map<number, number[]>();
  for (const cell of input.cells) {
    const list = provinceCells.get(cell.provinceId);
    if (list) list.push(cell.id);
    else provinceCells.set(cell.provinceId, [cell.id]);
  }
  const work: Working = {
    input,
    byId,
    provinceCells,
    taken: new Set(),
    highland: input.period === "earlyMedieval" ? new Set() : highlandCells(input.cells),
    threatened: new Set(input.threatenedProvinceIds ?? []),
    separated: input.period === "lateMedieval" ? separatedProvinces(input, byId) : new Set(),
    nextId: 1,
    holdings: []
  };

  placeCrown(work);
  if (input.period !== "earlyMedieval") placeChurch(work);
  placeProvincialLords(work);
  placeTownHoldings(work);
  placeKin(work);
  if (input.period !== "earlyMedieval") placeSheriffs(work);
  for (const holding of work.holdings) {
    if (holding.holderKind === "character" && holding.office === "sheriff") continue;
    holding.knightFees = knightFeesFor(
      areaOf(work, holding.cellIds),
      peopleOf(work, holding.cellIds),
      GAELIC_FEE_DENSITY
    );
  }
  return work.holdings;
}

function highlandCells(cells: readonly GaelicCellInput[]): Set<number> {
  if (cells.length < 4) return new Set();
  const heights = cells.map(cell => cell.height);
  if (Math.max(...heights) - Math.min(...heights) < HIGHLAND_RELIEF) return new Set();
  const sorted = heights.slice().sort((a, b) => a - b);
  const threshold = sorted[Math.floor(0.6 * (sorted.length - 1))] ?? 0;
  const candidates = cells.filter(cell => cell.burgId <= 0 && cell.height >= threshold);
  if (candidates.length < cells.length * 0.15) return new Set();
  const ranked = candidates.slice().sort((a, b) => b.height - a.height || b.id - a.id);
  const cap = ranked.length > cells.length * 0.45 ? Math.max(1, Math.round(cells.length * 0.4)) : ranked.length;
  return new Set(ranked.slice(0, cap).map(cell => cell.id));
}

function separatedProvinces(input: AllocateGaelicInput, byId: Map<number, GaelicCellInput>): Set<number> {
  const capital = input.capitalCellId;
  if (capital === undefined || !byId.has(capital)) return new Set();
  const reached = new Set<number>();
  const seen = new Set<number>([capital]);
  const queue = [capital];
  while (queue.length) {
    const current = queue.shift();
    if (current === undefined) break;
    const cell = byId.get(current);
    if (!cell) continue;
    reached.add(cell.provinceId);
    for (const next of cell.neighborIds) {
      if (seen.has(next) || !byId.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  const separated = new Set<number>();
  for (const province of input.provinces) {
    if (!reached.has(province.id)) separated.add(province.id);
  }
  return separated;
}

function placeCrown(work: Working): void {
  const start = work.input.capitalCellId;
  if (start === undefined || !work.byId.has(start)) return;
  const share = CROWN_SHARE[work.input.period];
  const target =
    share <= 0
      ? 0
      : areaOf(
          work,
          work.input.cells.map(cell => cell.id)
        ) * share;
  const cellIds =
    share <= 0
      ? [start]
      : grow(
          work,
          start,
          () => true,
          () => true,
          (_ids, area) => area >= target
        );
  if (!cellIds.length) return;
  work.taken.add(start);
  for (const id of cellIds) work.taken.add(id);
  const capital = work.byId.get(start);
  push(work, {
    dignity: null,
    office: "none",
    tenure: "demesne",
    cellIds,
    holderKind: "crown",
    hereditary: false,
    frontier: false,
    seatName: capital?.burgName || "Crown",
    seatBurgId: work.input.capitalBurgId
  });
}

function placeChurch(work: Working): void {
  const seed = work.input.cells
    .filter(
      cell =>
        cell.burgId > 0 &&
        cell.id !== work.input.capitalCellId &&
        !work.taken.has(cell.id) &&
        !work.highland.has(cell.id)
    )
    .sort(byTownThenId)[0];
  if (!seed) return;
  const pool = work.input.cells.filter(cell => !work.highland.has(cell.id));
  const target =
    areaOf(
      work,
      pool.map(cell => cell.id)
    ) * CHURCH_SHARE;
  if (!(target > 0)) return;
  const cellIds = grow(
    work,
    seed.id,
    id => !work.highland.has(id),
    () => true,
    (_ids, area) => area >= target
  );
  for (const id of cellIds) work.taken.add(id);
  push(work, {
    dignity: null,
    office: "abbotTemporal",
    tenure: "ecclesiastical",
    cellIds,
    holderKind: "abbey",
    hereditary: false,
    frontier: false,
    seatName: seed.burgName || "Abbey",
    seatBurgId: seed.burgId
  });
}

function placeProvincialLords(work: Working): void {
  const ranked = work.input.provinces
    .filter(province => (work.provinceCells.get(province.id)?.length ?? 0) > 0)
    .slice()
    .sort(
      (a, b) =>
        peopleOf(work, work.provinceCells.get(b.id) ?? []) - peopleOf(work, work.provinceCells.get(a.id) ?? []) ||
        a.id - b.id
    );
  const totalPeople = peopleOf(
    work,
    work.input.cells.map(cell => cell.id)
  );
  const quota =
    ranked.length === 0 || totalPeople < EARL_MIN_PEOPLE
      ? 0
      : Math.min(ranked.length, Math.max(1, Math.floor(totalPeople / EARL_PEOPLE)));
  const placed = new Set<number>();
  for (const province of ranked) {
    if (placed.size >= quota) break;
    if (placeProvincialLord(work, province)) placed.add(province.id);
  }
  if (work.input.period !== "lateMedieval") return;
  for (const province of ranked) {
    if (!work.separated.has(province.id) || placed.has(province.id)) continue;
    if (placeProvincialLord(work, province)) placed.add(province.id);
  }
}

function placeProvincialLord(work: Working, province: GaelicProvinceInput): boolean {
  const cells = work.provinceCells.get(province.id) ?? [];
  const start = pickDemesneStart(work, cells, province.seatCellId);
  if (start === undefined) return false;
  const share = DEMESNE_SHARE[work.input.period];
  const targetCount = cells.length <= 1 ? 1 : Math.min(cells.length - 1, Math.max(1, Math.round(cells.length * share)));
  const targetArea = areaOf(work, cells) * share;
  const provinceSet = new Set(cells);
  const cellIds = grow(
    work,
    start,
    id => provinceSet.has(id),
    ids => ids.length < targetCount,
    (ids, area) => area >= targetArea || ids.length >= targetCount
  );
  for (const id of cellIds) work.taken.add(id);
  const early = work.input.period === "earlyMedieval";
  push(work, {
    dignity: early ? null : "count",
    office: early ? "mormaer" : "none",
    tenure: early ? "kinLand" : "fief",
    cellIds,
    holderKind: "character",
    hereditary: true,
    frontier: work.threatened.has(province.id),
    seatName: province.name,
    seatBurgId: province.seatBurgId
  });
  return true;
}

function pickDemesneStart(work: Working, cells: readonly number[], seat: number): number | undefined {
  const free = cells.filter(id => !work.taken.has(id));
  if (!free.length) return undefined;
  const lowland = free.filter(id => !work.highland.has(id));
  const pool = new Set(lowland.length ? lowland : free);
  if (pool.has(seat)) return seat;
  const seen = new Set<number>([seat]);
  const queue = [seat];
  while (queue.length) {
    const current = queue.shift();
    if (current === undefined) break;
    for (const next of neighbors(work, current)) {
      if (seen.has(next) || !cells.includes(next)) continue;
      seen.add(next);
      if (pool.has(next)) return next;
      queue.push(next);
    }
  }
  return free.slice().sort((a, b) => height(work, a) - height(work, b) || a - b)[0];
}

function placeTownHoldings(work: Working): void {
  const pool = work.input.cells.filter(cell => !work.taken.has(cell.id) && !work.highland.has(cell.id));
  const late = work.input.period === "lateMedieval";
  const towns = pool
    .filter(
      cell => cell.burgId > 0 && cell.id !== work.input.capitalCellId && !(late && work.separated.has(cell.provinceId))
    )
    .sort(byTownThenId);
  const poolPeople = peopleOf(
    work,
    pool.map(cell => cell.id)
  );
  const thaneTarget = Math.floor(
    peopleOf(
      work,
      work.input.cells.map(cell => cell.id)
    ) / THANAGE_PEOPLE[work.input.period]
  );
  const baronTarget = work.input.period === "earlyMedieval" ? 0 : Math.floor(poolPeople / BARON_PEOPLE);
  const baronSlots = Math.min(baronTarget, towns.length);
  const thaneSlots = Math.min(thaneTarget, Math.max(0, towns.length - baronSlots));
  const thaneTowns = towns.slice(0, thaneSlots);
  const baronTowns = towns.slice(thaneSlots, thaneSlots + baronSlots);
  for (const town of [...thaneTowns, ...baronTowns]) work.taken.add(town.id);

  for (const town of thaneTowns) {
    const cellIds = growTown(work, town.id, THANAGE_TARGET_KM2, THANAGE_MAX_KM2);
    push(work, {
      dignity: null,
      office: "thane",
      tenure: "thanage",
      cellIds,
      holderKind: "character",
      hereditary: work.input.period !== "earlyMedieval",
      frontier: false,
      seatName: town.burgName || "Thanage",
      seatBurgId: town.burgId
    });
  }
  for (const town of baronTowns) {
    const slots = Math.max(1, baronTowns.length);
    const target = clamp(
      areaOf(
        work,
        pool.map(cell => cell.id)
      ) / slots,
      BARONY_MIN_KM2,
      BARONY_MAX_KM2
    );
    const cellIds = growTown(work, town.id, target, BARONY_MAX_KM2);
    push(work, {
      dignity: "baron",
      office: "none",
      tenure: "fief",
      cellIds,
      holderKind: "character",
      hereditary: true,
      frontier: false,
      seatName: town.burgName || "Barony",
      seatBurgId: town.burgId
    });
  }
}

function growTown(work: Working, start: number, targetKm2: number, maxKm2: number): number[] {
  const provinceId = work.byId.get(start)?.provinceId;
  const startArea = areaOfCell(work, start);
  return grow(
    work,
    start,
    id => id === start || (work.byId.get(id)?.provinceId === provinceId && !work.highland.has(id)),
    (_ids, area, nextArea) => area < 200 || (area < targetKm2 && area + nextArea <= maxKm2),
    (_ids, area) => startArea >= maxKm2 || area >= targetKm2
  );
}

function placeKin(work: Working): void {
  const groups = new Map<number, number[]>();
  for (const cell of work.input.cells) {
    if (work.taken.has(cell.id)) continue;
    const list = groups.get(cell.provinceId);
    if (list) list.push(cell.id);
    else groups.set(cell.provinceId, [cell.id]);
  }
  const provinces = new Map(work.input.provinces.map(province => [province.id, province]));
  for (const [provinceId, cellIds] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    const province = provinces.get(provinceId);
    for (const id of cellIds) work.taken.add(id);
    // One kin-land per contiguous block, so every holding stays one connected piece.
    for (const block of connectedBlocks(work.byId, cellIds)) {
      push(work, {
        dignity: null,
        office: "none",
        tenure: "kinLand",
        cellIds: block,
        holderKind: "kindred",
        hereditary: false,
        frontier: false,
        seatName: province?.name ?? "Kin-land",
        seatBurgId: 0
      });
    }
  }
}

function connectedBlocks(byId: ReadonlyMap<number, GaelicCellInput>, ids: readonly number[]): number[][] {
  const pool = new Set(ids);
  const blocks: number[][] = [];
  for (const start of [...ids].sort((a, b) => a - b)) {
    if (!pool.has(start)) continue;
    pool.delete(start);
    const block = [start];
    for (let head = 0; head < block.length; head += 1) {
      for (const next of byId.get(block[head])?.neighborIds ?? []) {
        if (!pool.has(next)) continue;
        pool.delete(next);
        block.push(next);
      }
    }
    blocks.push(block);
  }
  return blocks;
}

function placeSheriffs(work: Working): void {
  for (const province of work.input.provinces.slice().sort((a, b) => a.id - b.id)) {
    const cells = work.provinceCells.get(province.id) ?? [];
    if (!cells.length) continue;
    const area = areaOf(work, cells);
    const count = area > SHERIFF_SPLIT_KM2 ? Math.max(1, Math.round(area / SHERIFF_EACH_KM2)) : 1;
    for (let index = 0; index < count; index += 1) {
      push(work, {
        dignity: null,
        office: "sheriff",
        tenure: "feeQuotaOnly",
        cellIds: [],
        provinceIds: [province.id],
        holderKind: "character",
        hereditary: false,
        frontier: false,
        seatName: province.name,
        seatBurgId: province.seatBurgId
      });
    }
  }
}

function derivedFields(
  byId: ReadonlyMap<number, GaelicCellInput>,
  cellIds: readonly number[]
): Pick<NobleHolding, "provinceIds" | "burgIds" | "knightFees"> {
  let areaKm2 = 0;
  let people = 0;
  const provinces = new Set<number>();
  const burgs = new Set<number>();
  for (const id of cellIds) {
    const cell = byId.get(id);
    if (!cell) continue;
    areaKm2 += cell.areaKm2;
    people += cell.ruralPeople + cell.urbanPeople;
    provinces.add(cell.provinceId);
    if (cell.burgId > 0) burgs.add(cell.burgId);
  }
  return {
    provinceIds: [...provinces],
    burgIds: [...burgs],
    knightFees: knightFeesFor(areaKm2, people, GAELIC_FEE_DENSITY)
  };
}

export interface ReconcileResult {
  holdings: NobleHolding[];
  /** Holdings dropped because they lost every cell or their province. Their holders lose the title. */
  retiredIds: number[];
}

/**
 * Follows a changed cell set without redistributing the state. Lost cells leave their
 * holding, new cells join the neighbouring holding, and ids and holders stay. A holding
 * left with no land (or a sheriff whose province is gone) is retired.
 */
export function reconcileGaelicHoldings(
  input: AllocateGaelicInput,
  existing: readonly NobleHolding[],
  firstNewId: number
): ReconcileResult {
  const byId = new Map(input.cells.map(cell => [cell.id, cell]));
  const provinceIds = new Set(input.provinces.map(province => province.id));
  const retiredIds: number[] = [];
  const holdings: NobleHolding[] = [];
  const owner = new Map<number, NobleHolding>();

  for (const old of existing) {
    const keep = old.cellIds.filter(id => byId.has(id));
    const landless = old.office === "sheriff";
    const gone = landless ? !old.provinceIds.some(id => provinceIds.has(id)) : keep.length === 0;
    if (gone) {
      retiredIds.push(old.id);
      continue;
    }
    const holding: NobleHolding = { ...old, cellIds: keep };
    if (!landless && keep.length !== old.cellIds.length) Object.assign(holding, derivedFields(byId, keep));
    holdings.push(holding);
    for (const id of keep) owner.set(id, holding);
  }

  let nextId = firstNewId;
  const touched = new Set<NobleHolding>();
  const added = input.cells.filter(cell => !owner.has(cell.id)).sort((a, b) => a.id - b.id);
  // Repeat until no cell can attach to an owned neighbour, then open kin-land for the rest.
  let pending = added;
  while (pending.length) {
    const rest: GaelicCellInput[] = [];
    for (const cell of pending) {
      const target = pickNeighbourOwner(cell, owner);
      if (!target) {
        rest.push(cell);
        continue;
      }
      target.cellIds.push(cell.id);
      owner.set(cell.id, target);
      touched.add(target);
    }
    if (rest.length === pending.length) {
      const [seed] = rest;
      const province = input.provinces.find(candidate => candidate.id === seed.provinceId);
      const kin: NobleHolding = {
        id: nextId,
        stateId: input.stateId,
        dignity: null,
        office: "none",
        tenure: "kinLand",
        cellIds: [seed.id],
        provinceIds: [],
        burgIds: [],
        knightFees: 0,
        holderKind: "kindred",
        hereditary: false,
        frontier: false,
        seatName: province?.name ?? "Kin-land",
        seatBurgId: 0
      };
      nextId += 1;
      holdings.push(kin);
      owner.set(seed.id, kin);
      touched.add(kin);
      pending = rest.slice(1);
    } else {
      pending = rest;
    }
  }
  for (const holding of touched) Object.assign(holding, derivedFields(byId, holding.cellIds));
  return { holdings, retiredIds };
}

function pickNeighbourOwner(cell: GaelicCellInput, owner: ReadonlyMap<number, NobleHolding>): NobleHolding | undefined {
  const votes = new Map<NobleHolding, number>();
  for (const next of cell.neighborIds) {
    const holding = owner.get(next);
    if (holding) votes.set(holding, (votes.get(holding) ?? 0) + 1);
  }
  let best: NobleHolding | undefined;
  let bestKey: [number, number, number] | undefined;
  for (const [holding, count] of votes) {
    // Same-province neighbour first, then most shared edges, then lowest id.
    const key: [number, number, number] = [holding.provinceIds.includes(cell.provinceId) ? 0 : 1, -count, holding.id];
    if (
      !bestKey ||
      key[0] < bestKey[0] ||
      (key[0] === bestKey[0] && (key[1] < bestKey[1] || (key[1] === bestKey[1] && key[2] < bestKey[2])))
    ) {
      best = holding;
      bestKey = key;
    }
  }
  return best;
}

function push(
  work: Working,
  partial: Omit<NobleHolding, "id" | "stateId" | "provinceIds" | "burgIds" | "knightFees"> & {
    provinceIds?: number[];
  }
): void {
  const { provinceIds: explicitProvinces, ...rest } = partial;
  const provinceIds = explicitProvinces ?? [...new Set(rest.cellIds.map(id => work.byId.get(id)?.provinceId ?? 0))];
  const burgIds = [...new Set(rest.cellIds.map(id => work.byId.get(id)?.burgId ?? 0).filter(id => id > 0))];
  work.holdings.push({
    ...rest,
    id: work.nextId,
    stateId: work.input.stateId,
    provinceIds,
    burgIds,
    knightFees: 0
  });
  work.nextId += 1;
}

function grow(
  work: Working,
  start: number,
  allow: (id: number) => boolean,
  canAdd: (ids: number[], area: number, nextArea: number) => boolean,
  done: (ids: number[], area: number) => boolean
): number[] {
  if (!work.byId.has(start)) return [];
  const ids = [start];
  work.taken.add(start);
  let area = areaOfCell(work, start);
  if (!(area > 0) || done(ids, area)) return ids;
  const queue = [start];
  const seen = new Set<number>([start]);
  while (queue.length) {
    const current = queue.shift();
    if (current === undefined) break;
    for (const next of neighbors(work, current)) {
      if (seen.has(next) || work.taken.has(next) || !allow(next)) continue;
      const nextArea = areaOfCell(work, next);
      if (!canAdd(ids, area, nextArea)) continue;
      seen.add(next);
      work.taken.add(next);
      ids.push(next);
      area += nextArea;
      queue.push(next);
      if (done(ids, area)) return ids;
    }
  }
  return ids;
}

function neighbors(work: Working, id: number): number[] {
  const cell = work.byId.get(id);
  if (!cell) return [];
  return cell.neighborIds
    .filter(next => next !== id && work.byId.has(next))
    .slice()
    .sort((a, b) => height(work, a) - height(work, b) || a - b);
}

function areaOf(work: Working, ids: readonly number[]): number {
  let total = 0;
  for (const id of ids) total += areaOfCell(work, id);
  return total;
}

function areaOfCell(work: Working, id: number): number {
  return work.byId.get(id)?.areaKm2 ?? 0;
}

function peopleOf(work: Working, ids: readonly number[]): number {
  let total = 0;
  for (const id of ids) {
    const cell = work.byId.get(id);
    if (!cell) continue;
    total += cell.ruralPeople + cell.urbanPeople;
  }
  return total;
}

function height(work: Working, id: number): number {
  return work.byId.get(id)?.height ?? 0;
}

function byTownThenId(a: GaelicCellInput, b: GaelicCellInput): number {
  return b.urbanPeople - a.urbanPeople || a.id - b.id;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
