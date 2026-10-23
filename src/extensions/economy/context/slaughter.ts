/** Persisted carcass transactions; authoritative live lots remain in livestockLots. */
import type { CarcassPortion, SlaughterReceipt } from "../generators/slaughterTransactions";
import { peekEconomySlice } from "./economyApi";

export interface OwnedSlaughterReceipt extends SlaughterReceipt {
  operationId: string;
  physicalInput: { characterId: number; goodId: number; marketUnits: number };
}
export interface SlaughterLedger {
  schemaVersion: 1;
  nextBatchId: number;
  receipts: Record<string, OwnedSlaughterReceipt>;
  portions: Record<string, CarcassPortion>;
}

function isTable(value: unknown): boolean {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
export function getSlaughterLedger(): SlaughterLedger | null {
  const stored = peekEconomySlice()?.slaughter;
  if (stored === undefined) return null;
  if (
    !stored ||
    typeof stored !== "object" ||
    Array.isArray(stored) ||
    (stored as SlaughterLedger).schemaVersion !== 1 ||
    !isTable((stored as SlaughterLedger).receipts) ||
    !isTable((stored as SlaughterLedger).portions)
  )
    throw new Error("Unsupported slaughter ledger");
  return stored as SlaughterLedger;
}
