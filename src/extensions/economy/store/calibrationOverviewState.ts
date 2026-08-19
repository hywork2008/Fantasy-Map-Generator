import { create } from "zustand";
import type { CraftKnowledgeDomain } from "../generators/guildKnowledgeTypes";
import type { OccupationalPool } from "../generators/occupationalCalibration";

export interface CalibrationGoodBreakdown {
  goodName: string;
  provenanceLots: number;
  laborPointsPerLot: number;
  authoredLaborPoints: number;
  inlandShare: number;
}

export interface CalibrationOverviewRow {
  id: string;
  burgId: number;
  burgName: string;
  stateId: number;
  stateName: string;
  pool: OccupationalPool;
  domain: CraftKnowledgeDomain | "construction" | "administration" | "mining" | "smelting" | "trade";
  displayPeople: number;
  laborPeople: number;
  expectedPeople: number;
  expectedPoints: number;
  actualWorkerPoints: number;
  actualPeople: number;
  ratio: number | null;
  demandLots: number;
  laborFromAuthoredLots: number;
  guildCoverage: number | null;
  stock: number | null;
  goods: CalibrationGoodBreakdown[];
}

interface CalibrationOverviewState {
  rows: CalibrationOverviewRow[];
}

export const useCalibrationOverviewState = create<CalibrationOverviewState>(() => ({ rows: [] }));

export const getCalibrationOverviewState = useCalibrationOverviewState.getState;
export const setCalibrationOverviewState = useCalibrationOverviewState.setState;
