/**
 * Personal pieces sold at the outfitter, one at a time.
 *
 * These are not GOODS_DATA. That catalogue sells lots: a coil of Ropes, a set of
 * Tools, twenty pairs of Boots. A piece price must not be written back onto those
 * goods, and these pieces do not draw burg stock or military demand.
 *
 * Each row is one English record of one piece. Left out, because no such record
 * was found: a hand torch (Rogers prices torches by the pound, often many pounds
 * of wax and resin), a sack (Rogers vol. IV p. 428 summarises five-bushel sacks
 * as nearly 11d and does not cite one purchase), a rope of a stated length (rope
 * is by the pound, hundredweight, or fathom, and Ropes already covers the coil),
 * and a pickaxe (1410 buys three dung-pykes and a mattock together; Dyer's three
 * mason's tools are unnamed). A halfpenny cook-pot rounds to 0.00 SP and is left out.
 */

import { spFromPence } from "./medievalArmourContracts";

export type AdventuringKitPiece = {
  /** Stable id. Stored on `character.kit`, never as a goods-catalog index. */
  id: string;
  name: string;
  /** English pence for one piece (12 pence = 1 shilling). */
  pence: number;
  /** Where that one piece is priced. */
  source: string;
};

export const ADVENTURING_KIT: readonly AdventuringKitPiece[] = [
  {
    id: "hand-axe",
    name: "Hand Axe",
    pence: 5,
    source: "Dyer, Standards of Living in the Later Middle Ages, p. 170, via Hodges: one axe, 5d, 1457"
  },
  {
    id: "lantern",
    name: "Lantern",
    pence: 6,
    source:
      "Rogers, A History of Agriculture and Prices in England, vol. IV, p. 415: Coleshull, 1435, the sheep-master bought two lanterns at 6d each"
  },
  {
    id: "costrel",
    name: "Costrel",
    pence: 8,
    source:
      "Rogers, A History of Agriculture and Prices in England, vol. IV, p. 633: a costrel, a wooden drinking-bottle, 8d, 1424"
  },
  {
    id: "purse",
    name: "Purse",
    pence: 1.5,
    source: "Dyer, Standards of Living in the Later Middle Ages, p. 79, via Hodges: a gentry purse, 1½d, 1470s"
  }
];

/** Sale value of one piece, in SP, on the same pence scale as the armour contracts. */
export function adventuringKitValue(piece: AdventuringKitPiece): number {
  return spFromPence(piece.pence);
}

export function getAdventuringKitPiece(id: string): AdventuringKitPiece | undefined {
  return ADVENTURING_KIT.find(piece => piece.id === id);
}
