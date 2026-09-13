/**
 * Lich armies raise graves only upon entering enemy land, or when enemies enter their land.
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

function riteZombieShare(cellId: number): number {
  const pack = worldContext.pack;
  const cultureId = pack.cells.culture?.[cellId];
  const rite = getCultureFuneralRite(pack.cultures?.[cultureId ?? 0]);
  if (!rite) return 0.4;
  return FUNERAL_RITE_DEFINITIONS[rite].zombieShare;
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

function addRisenTroops(
  state: State,
  cellId: number,
  skeletons: number,
  zombies: number,
  target?: MilitaryRegiment
): boolean {
  const pack = worldContext.pack;
  const [x, y] = pack.cells.p[cellId] ?? [0, 0];
  const total = skeletons + zombies;
  if (!(total > 0)) return false;

  const existing = target ?? findRisenRegiment(state, cellId);
  if (existing) {
    existing.u[SKELETON_UNIT_NAME] = (existing.u[SKELETON_UNIT_NAME] ?? 0) + skeletons;
    existing.u[ZOMBIE_UNIT_NAME] = (existing.u[ZOMBIE_UNIT_NAME] ?? 0) + zombies;
    existing.a = (existing.a ?? 0) + total;
    if (existing.isRisen) existing.t = existing.a;
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

/** Called once for each actual land-cell entry, before capture can change ownership. */
export function raiseUndeadOnCellEntered(regiment: MilitaryRegiment, cellId: number): boolean {
  const pack = worldContext.pack;
  if (regiment.n || regiment.a <= 0 || regiment.cell !== cellId) return false;
  if (!Number.isInteger(cellId) || !(pack?.cells?.h?.[cellId] >= 20)) return false;
  const entrant = pack.states?.[regiment.state];
  const owner = pack.states?.[pack.cells.state[cellId]];
  if (!entrant?.i || entrant.removed || !owner?.i || owner.removed || owner.i === entrant.i) return false;
  if (entrant.diplomacy?.[owner.i] !== "Enemy" && owner.diplomacy?.[entrant.i] !== "Enemy") return false;
  const attackingLich = isLichState(pack.races, pack.cultures, entrant);
  const defendingLich = isLichState(pack.races, pack.cultures, owner);
  if (attackingLich === defendingLich) return false;

  ensureFuneralRemainsSeeded();
  const funeral = getFuneralState();
  const remains = funeral.remainsByCell[cellId] ?? 0;
  if (!(remains > 0)) return false;
  const lich = attackingLich ? entrant : owner;
  const target = attackingLich ? regiment : lich.military?.find(r => !r.n && r.a > 0 && r.cell === cellId);
  const zombies = rn(remains * riteZombieShare(cellId));
  const skeletons = Math.max(0, rn(remains - zombies));
  if (skeletons + zombies <= 0) return false;
  worldContext.options.military = ensureUndeadMilitaryUnits(worldContext.options.military);
  takeFuneralRemains(cellId, remains);
  addRisenTroops(lich, cellId, skeletons, zombies, target);
  const stored = funeral.raisedByCell[cellId];
  if (stored?.stateId === lich.i) mergeRaised(stored, skeletons, zombies);
  else funeral.raisedByCell[cellId] = { stateId: lich.i, skeletons, zombies };
  return true;
}
