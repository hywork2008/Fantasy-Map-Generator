import type { WinterSlaughterState } from "../generators/winterSlaughter";
import { getWorldContext, peekEconomySlice } from "./economyApi";

export function isWinterSlaughterExperimentEnabled(): boolean {
  const options = getWorldContext().options;
  return options.winterLivestockSlaughter === "experimental-temperate" && options.ruralEcosystemDetail !== "simplified";
}

export function getWinterSlaughterState(): WinterSlaughterState | null {
  const state = peekEconomySlice()?.winterSlaughter;
  if (state === undefined) return null;
  if (!state || typeof state !== "object" || (state as WinterSlaughterState).schemaVersion !== 1) {
    throw new Error("Unsupported winter slaughter ledger");
  }
  return state as WinterSlaughterState;
}

/** Coarse economic rates cannot replace outstanding physical curing and feeding periods. */
export function winterSlaughterNeedsPhysicalSettlement(): boolean {
  if (isWinterSlaughterExperimentEnabled()) return true;
  const state = getWinterSlaughterState();
  return Boolean(
    state &&
      (Object.values(state.jobs).some(job => job.status === "processing") ||
        Object.values(state.stocks).some(stock => stock.remainingKg > 0))
  );
}
