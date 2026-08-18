/**
 * Consecutive-year practice stocks for laboratory glass, pozzolan chemistry, and obsidian use.
 * Design: docs/plan/chemistry-medicine-knowledge-accumulation.md §3.3
 */

import {
  getChemMedPracticeRecords,
  getGoods,
  getMarkets,
  getSimulationYear,
  getWorldContext,
  setChemMedPracticeRecords
} from "../economyContext";
import type { ChemMedPracticeRecord } from "./chemistryTypes";
import { clamp01 } from "./chemMedCommon";

const POZZOLAN_GAIN = 1 / 8;
const OBSIDIAN_GAIN = 1 / 8;
const INTERRUPT_DECAY = 0.15;

function recordFor(stateId: number, records: ChemMedPracticeRecord[]): ChemMedPracticeRecord {
  const existing = records.find(entry => entry.stateId === stateId);
  if (existing) return existing;
  const created: ChemMedPracticeRecord = {
    stateId,
    labGlassPracticeYears: 0,
    pozzolanPractice: 0,
    obsidianPractice: 0
  };
  records.push(created);
  return created;
}

export function recordLabGlassPractice(stateId: number, year: number): void {
  const records = [...getChemMedPracticeRecords()];
  const row = recordFor(stateId, records);
  row.labGlassPracticeYears = row.lastLabGlassYear === year - 1 ? row.labGlassPracticeYears + 1 : 1;
  row.lastLabGlassYear = year;
  setChemMedPracticeRecords(records);
}

export function recordObsidianPractice(stateId: number, year: number): void {
  const records = [...getChemMedPracticeRecords()];
  const row = recordFor(stateId, records);
  row.obsidianPractice = clamp01((row.lastObsidianYear === year - 1 ? row.obsidianPractice : 0) + OBSIDIAN_GAIN);
  row.lastObsidianYear = year;
  setChemMedPracticeRecords(records);
}

export function settleChemMedPracticeDecay(): void {
  const year = getSimulationYear();
  const records = [...getChemMedPracticeRecords()];
  const roman = getGoods().find(good => good.name === "Roman Concrete");
  const markets = getMarkets();
  const pack = getWorldContext().pack;

  const romanByState = new Set<number>();
  if (roman) {
    for (const market of markets) {
      const stock = market.goods[roman.i]?.stock ?? 0;
      if (stock <= 0) continue;
      const burg = pack.burgs?.[market.centerBurgId];
      if (burg?.state) romanByState.add(burg.state);
    }
  }

  const stateIds = new Set<number>([
    ...records.map(row => row.stateId),
    ...romanByState,
    ...(pack.states ?? []).filter(state => state?.i && !state.removed).map(state => state.i)
  ]);

  for (const stateId of stateIds) {
    if (!stateId) continue;
    const row = recordFor(stateId, records);
    if (romanByState.has(stateId)) {
      row.pozzolanPractice = clamp01((row.lastPozzolanYear === year - 1 ? row.pozzolanPractice : 0) + POZZOLAN_GAIN);
      row.lastPozzolanYear = year;
    } else if ((row.pozzolanPractice ?? 0) > 0 && row.lastPozzolanYear !== year) {
      row.pozzolanPractice = clamp01(row.pozzolanPractice - INTERRUPT_DECAY);
    }
    if (row.lastLabGlassYear !== year && row.lastLabGlassYear !== year - 1) {
      row.labGlassPracticeYears = 0;
    }
    if (row.lastObsidianYear !== year && (row.obsidianPractice ?? 0) > 0) {
      row.obsidianPractice = clamp01(row.obsidianPractice - INTERRUPT_DECAY);
    }
  }
  setChemMedPracticeRecords(records);
}

export function getPracticeForState(stateId: number): ChemMedPracticeRecord | undefined {
  return getChemMedPracticeRecords().find(row => row.stateId === stateId);
}
