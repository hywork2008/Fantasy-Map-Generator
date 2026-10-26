import type { CropResidueState } from "../generators/cropResidues";
import { getEconomySlice, peekEconomySlice } from "./economyApi";

export function getCropResidueState(create = false): CropResidueState | null {
  const slice = create ? getEconomySlice() : peekEconomySlice();
  if (!slice) return null;
  if (slice.cropResidues === undefined && create) slice.cropResidues = { schemaVersion: 1, cells: {} };
  const state = slice.cropResidues as CropResidueState | undefined;
  if (state && state.schemaVersion !== 1) throw new Error("Unsupported crop residue ledger");
  return state ?? null;
}

export function cropResiduesNeedPhysicalSettlement(): boolean {
  return Object.values(getCropResidueState()?.cells ?? {}).some(cell =>
    cell.lots.some(lot => lot.storedStrawKg + lot.standingStrawKg + lot.stubbleKg > 0)
  );
}
