/** Cross-extension notification of a committed personal inventory movement. */
import { simEvents } from "./events";

export const CHARACTER_INVENTORY_TRANSFER_EVENT = "fmg:character-inventory-transferred";
export type CharacterInventoryContainer =
  | { characterId: number; container: "inventory" }
  | { characterId: number; container: "loadout"; slot: "body" | "weapon" | "accessory" | "mount" };
export interface CharacterInventoryTransfer {
  from: CharacterInventoryContainer;
  to: CharacterInventoryContainer;
  goodId: number;
  units: number;
  fromOpeningUnits: number;
  toOpeningUnits: number;
}

function isContainer(value: unknown): value is CharacterInventoryContainer {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(row.characterId) &&
    (row.characterId as number) > 0 &&
    (row.container === "inventory" ||
      (row.container === "loadout" && ["body", "weapon", "accessory", "mount"].includes(String(row.slot))))
  );
}
export function isCharacterInventoryTransfer(value: unknown): value is CharacterInventoryTransfer {
  if (!value || typeof value !== "object") return false;
  const row = value as CharacterInventoryTransfer;
  return (
    isContainer(row.from) &&
    isContainer(row.to) &&
    Number.isSafeInteger(row.goodId) &&
    row.goodId >= 0 &&
    Number.isFinite(row.units) &&
    row.units > 0 &&
    Number.isFinite(row.fromOpeningUnits) &&
    Number.isFinite(row.toOpeningUnits) &&
    row.toOpeningUnits >= 0 &&
    row.fromOpeningUnits + 1e-9 >= row.units
  );
}

/** Emit only after the caller has committed both physical containers. No world state is held here. */
export function notifyCharacterInventoryTransfers(transfers: readonly CharacterInventoryTransfer[]): void {
  for (const transfer of transfers) {
    if (!isCharacterInventoryTransfer(transfer)) continue;
    if (
      transfer.from.characterId === transfer.to.characterId &&
      transfer.from.container === transfer.to.container &&
      (transfer.from.container === "inventory" ||
        (transfer.to.container === "loadout" && transfer.from.slot === transfer.to.slot))
    )
      continue;
    simEvents.dispatchEvent(new CustomEvent(CHARACTER_INVENTORY_TRANSFER_EVENT, { detail: transfer }));
  }
}
