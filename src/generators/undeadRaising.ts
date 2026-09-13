/**
 * Lich undeath: burial remains in cells touched by a Lich state or regiment rise
 * as skeleton / zombie soldiers of that Lich, hostile to the living owners.
 */
import type { RaisedUndeadAtCell } from "../context/simulationContext";
import { worldContext } from "../context/worldContext";
import { FUNERAL_RITE_DEFINITIONS } from "../data/funeralRites";
import { isLichState } from "../extensions/characters/lichPolicy";
import type { MilitaryRegiment, MilitaryUnit, State } from "../types/models";
import { getCultureFuneralRite } from "../utils/cultureFuneralRite";
import { rn } from "../utils/numberUtils";
import { ensureFuneralRemainsSeeded, getFuneralState, takeFuneralRemains } from "./funeralRites";

export const SKELETON_UNIT_NAME = "skeletons";
export const ZOMBIE_UNIT_NAME = "zombies";

export const UNDEAD_MILITARY_UNITS: MilitaryUnit[] = [
  {
    icon: "💀",
    name: SKELETON_UNIT_NAME,
    rural: 0,
    urban: 0,
    crew: 1,
    power: 0.7,
    type: "melee",
    separate: 0
  },
  {
    icon: "🧟",
    name: ZOMBIE_UNIT_NAME,
    rural: 0,
    urban: 0,
    crew: 1,
    power: 0.55,
    type: "melee",
    separate: 0
  }
];

export function ensureUndeadMilitaryUnits(military: MilitaryUnit[] | undefined): MilitaryUnit[] {
  const list = military ?? [];
  const names = new Set(list.map(unit => unit.name));
  for (const unit of UNDEAD_MILITARY_UNITS) {
    if (!names.has(unit.name)) list.push({ ...unit });
  }
  return list;
}

function lichStateIds(pack: typeof worldContext.pack): number[] {
  const ids: number[] = [];
  for (const state of pack.states ?? []) {
    if (!state?.i || state.removed) continue;
    if (isLichState(pack.races, pack.cultures, state)) ids.push(state.i);
  }
  return ids;
}

function nearestLichStateForCell(cellId: number, lichIds: readonly number[]): number | undefined {
  const pack = worldContext.pack;
  const owner = pack.cells.state?.[cellId];
  if (owner && lichIds.includes(owner)) return owner;

  for (const neighbor of pack.cells.c[cellId] ?? []) {
    const neighborState = pack.cells.state?.[neighbor];
    if (neighborState && lichIds.includes(neighborState)) return neighborState;
  }

  for (const lichId of lichIds) {
    const military = pack.states[lichId]?.military;
    if (!military) continue;
    for (const regiment of military) {
      if (regiment.cell === cellId) return lichId;
      if ((pack.cells.c[cellId] ?? []).includes(regiment.cell)) return lichId;
    }
  }
  return undefined;
}

function riteZombieShare(cellId: number): number {
  const pack = worldContext.pack;
  const cultureId = pack.cells.culture?.[cellId];
  const rite = getCultureFuneralRite(pack.cultures?.[cultureId ?? 0]);
  if (!rite) return 0.4;
  return FUNERAL_RITE_DEFINITIONS[rite].zombieShare;
}

function setEnemy(fromId: number, toId: number): boolean {
  if (!fromId || !toId || fromId === toId) return false;
  const states = worldContext.pack.states;
  const from = states[fromId];
  const to = states[toId];
  if (!from?.diplomacy || !to?.diplomacy) return false;
  let changed = false;
  if (from.diplomacy[toId] !== "Enemy") {
    from.diplomacy[toId] = "Enemy";
    changed = true;
  }
  if (to.diplomacy[fromId] !== "Enemy") {
    to.diplomacy[fromId] = "Enemy";
    changed = true;
  }
  return changed;
}

function mergeRaised(target: RaisedUndeadAtCell, skeletons: number, zombies: number): void {
  target.skeletons += skeletons;
  target.zombies += zombies;
}

function findRisenRegiment(state: State, cellId: number): MilitaryRegiment | undefined {
  return state.military?.find(regiment => regiment.isRisen && regiment.cell === cellId);
}

function nextRegimentIndex(state: State): number {
  const military = state.military ?? [];
  let max = -1;
  for (const regiment of military) if (regiment.i > max) max = regiment.i;
  return max + 1;
}

function addRisenTroops(state: State, cellId: number, skeletons: number, zombies: number): boolean {
  const pack = worldContext.pack;
  const [x, y] = pack.cells.p[cellId] ?? [0, 0];
  const total = skeletons + zombies;
  if (!(total > 0)) return false;

  const existing = findRisenRegiment(state, cellId);
  if (existing) {
    existing.u[SKELETON_UNIT_NAME] = (existing.u[SKELETON_UNIT_NAME] ?? 0) + skeletons;
    existing.u[ZOMBIE_UNIT_NAME] = (existing.u[ZOMBIE_UNIT_NAME] ?? 0) + zombies;
    existing.a = (existing.a ?? 0) + total;
    existing.t = Math.max(existing.t ?? 0, existing.a);
    return true;
  }

  if (!state.military) state.military = [];
  const regiment: MilitaryRegiment = {
    i: nextRegimentIndex(state),
    t: total,
    a: total,
    s: 0,
    cell: cellId,
    x,
    y,
    bx: x,
    by: y,
    u: {
      ...(skeletons > 0 ? { [SKELETON_UNIT_NAME]: skeletons } : {}),
      ...(zombies > 0 ? { [ZOMBIE_UNIT_NAME]: zombies } : {})
    },
    n: 0,
    type: "melee",
    name: `${state.name} Risen Host`,
    state: state.i,
    isRisen: true,
    homeProvince: pack.cells.province?.[cellId] ?? 0,
    quality: 1,
    icon: skeletons >= zombies ? "💀" : "🧟"
  };
  state.military.push(regiment);
  return true;
}

/** Copy live risen regiments into funeral.raisedByCell before Military.generate wipes them. */
export function snapshotRisenRegiments(): void {
  const pack = worldContext.pack;
  const funeral = getFuneralState();
  const raised: Record<number, RaisedUndeadAtCell> = {};
  for (const state of pack.states ?? []) {
    if (!state?.i || state.removed) continue;
    for (const regiment of state.military ?? []) {
      if (!regiment.isRisen) continue;
      const skeletons = Math.max(0, regiment.u[SKELETON_UNIT_NAME] ?? 0);
      const zombies = Math.max(0, regiment.u[ZOMBIE_UNIT_NAME] ?? 0);
      if (skeletons + zombies <= 0) continue;
      const cellId = regiment.cell;
      const current = raised[cellId];
      if (current && current.stateId === state.i) mergeRaised(current, skeletons, zombies);
      else raised[cellId] = { stateId: state.i, skeletons, zombies };
    }
  }
  funeral.raisedByCell = raised;
}

/** Recreate risen regiments from funeral.raisedByCell after Military.generate. */
export function reinjectRaisedUndead(): void {
  const pack = worldContext.pack;
  if (!pack?.states) return;
  if (worldContext.options) {
    worldContext.options.military = ensureUndeadMilitaryUnits(worldContext.options.military);
  }
  const funeral = getFuneralState();
  for (const [rawCellId, entry] of Object.entries(funeral.raisedByCell)) {
    const cellId = Number(rawCellId);
    const state = pack.states[entry.stateId];
    if (!state?.i || state.removed) continue;
    addRisenTroops(state, cellId, entry.skeletons, entry.zombies);
  }
}

/**
 * Raise every remaining grave in the Lich undeath aura (owned cells, adjacent cells,
 * and cells occupied by a Lich regiment). Raised troops join the nearest Lich state
 * and that state becomes Enemy of the living owner.
 */
export function raiseUndeadWhereLichPresent(): boolean {
  const pack = worldContext.pack;
  if (!pack?.cells || !pack.states) return false;
  const lichIds = lichStateIds(pack);
  if (!lichIds.length) return false;

  if (worldContext.options) {
    worldContext.options.military = ensureUndeadMilitaryUnits(worldContext.options.military);
  }

  const funeral = getFuneralState();
  const remainEntries = Object.entries(funeral.remainsByCell);
  if (!remainEntries.length) return false;

  // Freeze ownership before spawning: newly risen hosts extend the aura next tick.
  const eligibleCells: Array<{ cellId: number; remains: number; lichId: number }> = [];
  for (const [rawCellId, remains] of remainEntries) {
    if (!(remains > 0)) continue;
    const cellId = Number(rawCellId);
    if (!Number.isInteger(cellId) || cellId < 0) continue;
    const lichId = nearestLichStateForCell(cellId, lichIds);
    if (lichId) eligibleCells.push({ cellId, remains, lichId });
  }

  let changed = false;
  for (const { cellId, remains, lichId } of eligibleCells) {
    const lichState = pack.states[lichId];
    if (!lichState) continue;

    const taken = takeFuneralRemains(cellId, remains);
    if (!(taken > 0)) continue;

    const zombieShare = riteZombieShare(cellId);
    const zombies = rn(taken * zombieShare);
    const skeletons = Math.max(0, rn(taken - zombies));
    if (skeletons + zombies <= 0) continue;

    addRisenTroops(lichState, cellId, skeletons, zombies);
    const stored = funeral.raisedByCell[cellId];
    if (stored && stored.stateId === lichId) mergeRaised(stored, skeletons, zombies);
    else funeral.raisedByCell[cellId] = { stateId: lichId, skeletons, zombies };

    const livingOwner = pack.cells.state?.[cellId];
    if (livingOwner && livingOwner !== lichId && !isLichState(pack.races, pack.cultures, pack.states[livingOwner])) {
      if (setEnemy(lichId, livingOwner)) changed = true;
    }
    changed = true;
  }
  return changed;
}

export function runUndeadRaising(): boolean {
  ensureFuneralRemainsSeeded();
  return raiseUndeadWhereLichPresent();
}
