import { create } from "zustand";
import type { CraftKnowledgeDomain } from "../generators/guildKnowledgeTypes";

export interface GuildOverviewRow {
  id: string; // `${burgId}:${domain}`
  burgId: number;
  burgName: string;
  stateId: number;
  stateName: string;
  domain: CraftKnowledgeDomain;
  stock: number;
  bonus: number;
  treasury: number;
}

interface GuildOverviewState {
  rows: GuildOverviewRow[];
}

export const useGuildOverviewState = create<GuildOverviewState>(() => ({ rows: [] }));

export const getGuildOverviewState = useGuildOverviewState.getState;
export const setGuildOverviewState = useGuildOverviewState.setState;
