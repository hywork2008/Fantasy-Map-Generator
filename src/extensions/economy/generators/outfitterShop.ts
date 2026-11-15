/**
 * Buys one outfitter piece into `character.kit`.
 * The counter does not use market stock, merchant ledgers, or GOODS_DATA ids.
 */

import { simEvents } from "../../../simulation/events";
import { rn } from "../../hostUtils";
import { getWorldContext } from "../economyContext";
import {
  ADVENTURING_KIT,
  type AdventuringKitPiece,
  adventuringKitValue,
  getAdventuringKitPiece
} from "./adventuringKitContracts";

export type OutfitterPurchaseResult = { ok: boolean; message: string };

export interface OutfitterRow {
  id: string;
  name: string;
  pence: number;
  value: number;
  source: string;
  held: number;
}

export interface OutfitterSnapshot {
  characterName: string;
  burgName: string;
  wealth: number;
  rows: OutfitterRow[];
}

export function getOutfitterSnapshot(characterId: number | null): OutfitterSnapshot | null {
  if (characterId === null) return null;
  const { pack } = getWorldContext();
  const character = pack.characters?.find(candidate => candidate.i === characterId && !candidate.dead);
  const burg = character?.location === undefined ? undefined : pack.burgs[character.location];
  if (!character || !burg || burg.removed) return null;
  return {
    characterName: character.name,
    burgName: burg.name ?? `Burg ${burg.i ?? character.location}`,
    wealth: character.wealth ?? 0,
    rows: ADVENTURING_KIT.map(piece => ({
      id: piece.id,
      name: piece.name,
      pence: piece.pence,
      value: adventuringKitValue(piece),
      source: piece.source,
      held: character.kit?.[piece.id] ?? 0
    }))
  };
}

/**
 * Read-only check. A refused buy publishes no world commit, so the dialog
 * asks here for the message the runtime does not return.
 */
export function quoteOutfitterPurchase(characterId: number, pieceId: string, count: number): OutfitterPurchaseResult {
  if (!Number.isInteger(count) || count <= 0) return { ok: false, message: "Buy a whole number of pieces." };
  const piece: AdventuringKitPiece | undefined = getAdventuringKitPiece(pieceId);
  if (!piece) return { ok: false, message: "That piece is not sold here." };
  const { pack } = getWorldContext();
  const character = pack.characters?.find(candidate => candidate.i === characterId && !candidate.dead);
  if (!character) return { ok: false, message: "That character cannot buy here." };
  const burg = character.location === undefined ? undefined : pack.burgs[character.location];
  if (!burg || burg.removed) return { ok: false, message: "The outfitter sells only in a living burg." };

  const total = rn(adventuringKitValue(piece) * count, 2);
  if ((character.wealth ?? 0) + 1e-7 < total) return { ok: false, message: "Character cannot afford this purchase." };
  return { ok: true, message: "" };
}

/** Debit personal wealth and add whole pieces. There is no resale. */
export function buyOutfitterPiece(characterId: number, pieceId: string, count: number): OutfitterPurchaseResult {
  const quote = quoteOutfitterPurchase(characterId, pieceId, count);
  if (!quote.ok) return quote;
  const piece = getAdventuringKitPiece(pieceId);
  const { pack } = getWorldContext();
  const character = pack.characters?.find(candidate => candidate.i === characterId && !candidate.dead);
  if (!piece || !character) return { ok: false, message: "That character cannot buy here." };

  const total = rn(adventuringKitValue(piece) * count, 2);
  character.kit ??= {};
  character.kit[piece.id] = (character.kit[piece.id] ?? 0) + count;
  character.wealth = rn((character.wealth ?? 0) - total, 2);
  simEvents.dispatchEvent(new CustomEvent("fmg:character-inventory-changed", { detail: { characterId: character.i } }));
  return { ok: true, message: "Purchase completed." };
}
