import type { Character } from "./characterTypes";
import type { PersonSlot, WorldRoster } from "./roster/types";

/** Optional economic port. Characters never imports an Economy implementation. */
export interface CharacterFinancePort {
  synchronize(characters: Character[]): void;
  materialize(character: Character, slot: PersonSlot): void;
  rosterReady(roster: WorldRoster): void;
  remove(character: Character): void;
  canRemove(character: Character): boolean;
  describe(slot?: PersonSlot): { total: number; abstract: number; estates: number; balance?: number } | undefined;
  cancel(slot: PersonSlot, recipientSlotId?: string): void;
  previewCorrection(): { count: number; amount: number; token: string };
  applyCorrection(token: string): void;
}
let finance: CharacterFinancePort | undefined;
export function registerCharacterFinance(port: CharacterFinancePort): () => void {
  finance = port;
  return () => {
    if (finance === port) finance = undefined;
  };
}
export function synchronizeCharacterFinance(characters: Character[]): Character[] {
  finance?.synchronize(characters);
  return characters;
}
export function prepareCharacterFinance(character: Character, slot: PersonSlot): void {
  finance?.materialize(character, slot);
}
export function prepareRosterFinance(roster: WorldRoster): void {
  finance?.rosterReady(roster);
}
export function preserveCharacterFinance(character: Character): void {
  if (finance) finance.remove(character);
  else if (character.wealth > 0) throw Error("A financial custodian is required before removing a funded character");
}
export function cancelPersonFinance(slot: PersonSlot, recipientSlotId?: string, balance = 0): void {
  if (finance) finance.cancel(slot, recipientSlotId);
  else if (balance > 0) throw Error("A financial custodian is required to cancel this person");
}

export function canRemoveCharacterFinance(character: Character): boolean {
  if (finance) return finance.canRemove(character);
  return !(character.wealth > 0) && !Object.values(character.inventory ?? {}).some(n => n > 0) && !character.loadout;
}
export function describeCharacterFinance(slot?: PersonSlot) {
  return finance?.describe(slot);
}

export function previewZeroCashCorrection() {
  return finance?.previewCorrection();
}
export function applyZeroCashCorrection(token: string): void {
  if (!finance) throw Error("Economy is required for a cash correction");
  finance.applyCorrection(token);
}
