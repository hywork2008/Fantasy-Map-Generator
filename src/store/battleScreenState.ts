import { create } from "zustand";
import type { MilitaryUnit } from "../modules/military-generator";

export type BattleSide = "attackers" | "defenders";

export interface BattleRegimentDisplay {
  key: string;
  stateIndex: number;
  regimentIndex: number;
  regimentName: string;
  stateFullName: string;
  stateColor: string;
  icon: string;
  distanceLabel: string;
  initialUnits: Record<string, number>;
  casualties: Record<string, number>;
  survivors: Record<string, number>;
  initialTotal: number;
}

export interface BattleForcesDisplay {
  regiments: BattleRegimentDisplay[];
  morale: number;
  power: number;
  phase: string;
  die: number;
}

interface BattleScreenState {
  name: string;
  type: string;
  place: string;
  attackers: BattleForcesDisplay;
  defenders: BattleForcesDisplay;
  nameSectionVisible: boolean;
  militaryUnits: MilitaryUnit[];
}

interface BattleScreenStore extends BattleScreenState {
  setBattleState: (patch: Partial<BattleScreenState>) => void;
  setSideDie: (side: BattleSide, die: number) => void;
  setSidePhase: (side: BattleSide, phase: string) => void;
  setSideMorale: (side: BattleSide, morale: number) => void;
  setSidePower: (side: BattleSide, power: number) => void;
  addRegimentToSide: (side: BattleSide, regiment: BattleRegimentDisplay) => void;
  updateRegimentCasualties: (
    side: BattleSide,
    key: string,
    casualties: Record<string, number>,
    survivors: Record<string, number>
  ) => void;
  reset: () => void;
}

const emptyForces = (): BattleForcesDisplay => ({
  regiments: [],
  morale: 100,
  power: 0,
  phase: "",
  die: 1
});

const initialState: BattleScreenState = {
  name: "",
  type: "field",
  place: "",
  attackers: emptyForces(),
  defenders: emptyForces(),
  nameSectionVisible: false,
  militaryUnits: []
};

export const useBattleScreenState = create<BattleScreenStore>()(set => ({
  ...initialState,

  setBattleState: patch => set(state => ({ ...state, ...patch })),

  setSideDie: (side, die) =>
    set(state => ({
      [side]: { ...state[side], die }
    })),

  setSidePhase: (side, phase) =>
    set(state => ({
      [side]: { ...state[side], phase }
    })),

  setSideMorale: (side, morale) =>
    set(state => ({
      [side]: { ...state[side], morale }
    })),

  setSidePower: (side, power) =>
    set(state => ({
      [side]: { ...state[side], power }
    })),

  addRegimentToSide: (side, regiment) =>
    set(state => ({
      [side]: {
        ...state[side],
        regiments: [...state[side].regiments, regiment]
      }
    })),

  updateRegimentCasualties: (side, key, casualties, survivors) =>
    set(state => ({
      [side]: {
        ...state[side],
        regiments: state[side].regiments.map(r =>
          r.key === key ? { ...r, casualties: { ...casualties }, survivors: { ...survivors } } : r
        )
      }
    })),

  reset: () => set({ ...initialState, attackers: emptyForces(), defenders: emptyForces() })
}));

export const getBattleScreenState = useBattleScreenState.getState;
export const setBattleScreenState = useBattleScreenState.setState;
