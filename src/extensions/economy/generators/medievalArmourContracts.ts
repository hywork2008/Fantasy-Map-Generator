/**
 * One piece of medieval arms or armour, priced from the lists people find under
 * "Medieval Price List" and built as a forge recipe from its finished weight.
 *
 * Money: a person's grain for a year is 0.43 SP and about 50–70 pence around 1300
 * (docs/plan/money-supply-mint.md §10.7.2). The midpoint, 60 pence, is 1 SP.
 * Iron Ingot is 1 t, so a recipe amount is kilograms of bar divided by 1,000.
 * Forging keeps four fifths of that bar in the piece (mail, three fifths, because
 * drawing and riveting waste more). Charcoal follows Arms: one tenth of a kilogram
 * of fuel per kilogram of bar, and a sack is 50 kg.
 *
 * These pieces are not given a share of military demand. That budget is counted in
 * lots, and Arms is already a 500 kg lot. A one-piece good with a share of it would
 * take lots away from Arms and still not buy a meaningful number of swords.
 */

import type { CraftKnowledgeDomain } from "./guildKnowledgeTypes";

/** Pence in 1 SP at the grain midpoint above. */
export const MEDIEVAL_PENCE_PER_SP = 60 / 0.43;

/** Finished ferrous mass kept from each kilogram of bar. Mail is lower. */
const PLATE_YIELD = 0.8;
const MAIL_YIELD = 0.7;
/** Kilograms of charcoal burned per kilogram of bar, the Arms ratio (50 kg per 500 kg). */
const CHARCOAL_KG_PER_BAR_KG = 0.1;

const KILOGRAMS = {
  "Iron Ingot": 1000,
  Bronze: 1000,
  Charcoal: 50,
  Leather: 25,
  Cloth: 4000,
  Linen: 200,
  Cotton: 200,
  Wood: 6500
} as const;

export type MedievalArmourPiece = {
  name: string;
  /** Price in English pence (12 pence = 1 shilling, 240 pence = £1). */
  pence: number;
  /** Where the price is written down. */
  source: string;
  /** Ferrous mass still in the finished piece, kg. */
  ironKg: number;
  /** Share of the bar that remains in the piece. */
  yield: number;
  leatherKg: number;
  clothKg: number;
  linenKg: number;
  /** Raw cotton still in the piece. Early aketons were stuffed with it. */
  cottonKg?: number;
  /** Wood put into the forge, including what is cut away. */
  woodKg: number;
  /** Wood still in the piece. */
  woodInPieceKg: number;
  /** A bronze bar of the same mass, for a smith without iron. Plate and mail stay iron. */
  bronze: boolean;
  icon: string;
  color: string;
  heavy: boolean;
  /** Person-months at the Spinning Wheel scale, where 0.0001 is about three days. */
  labor: number;
  craft: CraftKnowledgeDomain;
  kgPerLiter: number;
};

/**
 * Prices are the recorded sale, not a reconstruction. Weights are typical finished
 * pieces of that kind (a knee-length hauberk, a field bard, a ready-made harness),
 * used only to size the bar.
 */
export const MEDIEVAL_ARMOUR_PIECES: readonly MedievalArmourPiece[] = [
  {
    name: "Peasant Sword",
    pence: 6,
    source: "Dyer, via Hodges: a peasant's sword, 6d, 1340s",
    ironKg: 0.75,
    yield: PLATE_YIELD,
    leatherKg: 0.06,
    clothKg: 0,
    linenKg: 0,
    woodKg: 0.12,
    woodInPieceKg: 0.09,
    bronze: true,
    icon: "good-arms",
    color: "#6b6b6b",
    heavy: false,
    labor: 0.00003,
    craft: "metallurgy",
    kgPerLiter: 0.8
  },
  {
    name: "Sword",
    pence: 24,
    source: "Thorold Rogers: six swords at 2s each in 1368; one sword at 2s 2d in 1296. This uses 2s",
    ironKg: 1.1,
    yield: PLATE_YIELD,
    leatherKg: 0.08,
    clothKg: 0,
    linenKg: 0,
    woodKg: 0.16,
    woodInPieceKg: 0.12,
    bronze: true,
    icon: "good-arms",
    color: "#4a4a4a",
    heavy: false,
    labor: 0.0002,
    craft: "metallurgy",
    kgPerLiter: 0.8
  },
  {
    name: "Longbow",
    pence: 12,
    source: "Thorold Rogers, as averaged by the NBER wage paper: 12d. One of the two observations includes arrows",
    ironKg: 0,
    yield: PLATE_YIELD,
    leatherKg: 0,
    clothKg: 0,
    linenKg: 0,
    woodKg: 1.8,
    woodInPieceKg: 1.2,
    bronze: false,
    icon: "good-wood",
    color: "#8b5a2b",
    heavy: false,
    labor: 0.0001,
    craft: "woodworking",
    kgPerLiter: 0.3
  },
  {
    name: "Crossbow",
    pence: 25,
    source: "Thorold Rogers: twelve crossbows at 2s 1d each, Tickhill, 1312",
    ironKg: 0.55,
    yield: PLATE_YIELD,
    leatherKg: 0.1,
    clothKg: 0,
    linenKg: 0,
    woodKg: 3.2,
    woodInPieceKg: 2.4,
    bronze: true,
    icon: "good-arms",
    color: "#5c4033",
    heavy: false,
    labor: 0.0002,
    craft: "woodworking",
    kgPerLiter: 0.4
  },
  {
    name: "Shield",
    pence: 9,
    source: "Thorold Rogers: eight shields for 6s, Framlingham, 1308",
    ironKg: 0.4,
    yield: PLATE_YIELD,
    leatherKg: 0.4,
    clothKg: 0,
    linenKg: 0,
    woodKg: 3,
    woodInPieceKg: 2.2,
    bronze: true,
    icon: "good-arms",
    color: "#7a6a4f",
    heavy: false,
    labor: 0.00007,
    craft: "woodworking",
    kgPerLiter: 0.3
  },
  {
    name: "Mail Hauberk",
    pence: 1200,
    source: "Hodges, from Gies: mail 100s, 12th century, date marked uncertain on the list",
    ironKg: 10,
    yield: MAIL_YIELD,
    leatherKg: 0.2,
    clothKg: 0,
    linenKg: 0,
    woodKg: 0,
    woodInPieceKg: 0,
    bronze: false,
    icon: "good-arms",
    color: "#8a9196",
    heavy: true,
    labor: 0.002,
    craft: "metallurgy",
    kgPerLiter: 0.4
  },
  {
    name: "Iron Cap",
    pence: 48,
    source: "Thorold Rogers, as averaged by the NBER wage paper: iron caps at 4s (1308) and a bacinet at 4s 6d (1312)",
    ironKg: 1.5,
    yield: PLATE_YIELD,
    leatherKg: 0.2,
    clothKg: 0,
    linenKg: 0,
    woodKg: 0,
    woodInPieceKg: 0,
    bronze: true,
    icon: "good-arms",
    color: "#6e757a",
    heavy: false,
    labor: 0.00007,
    craft: "metallurgy",
    kgPerLiter: 0.8
  },
  {
    name: "Bascinet",
    pence: 200,
    source: "ffoulkes, via Hodges: a bascinet 13s 4d plus 3s 4d to line it, 1369",
    ironKg: 2.3,
    yield: PLATE_YIELD,
    leatherKg: 0.15,
    clothKg: 0.35,
    linenKg: 0,
    woodKg: 0,
    woodInPieceKg: 0,
    bronze: false,
    icon: "good-arms",
    color: "#3e4650",
    heavy: false,
    labor: 0.0002,
    craft: "metallurgy",
    kgPerLiter: 0.8
  },
  {
    name: "Pair of Plates",
    pence: 240,
    source: "Thorold Rogers: one pair of plates and a gorget, 20s, Tickhill, 1312",
    ironKg: 7,
    yield: PLATE_YIELD,
    leatherKg: 0.4,
    clothKg: 1.2,
    linenKg: 0,
    woodKg: 0,
    woodInPieceKg: 0,
    bronze: false,
    icon: "good-arms",
    color: "#5a5348",
    heavy: true,
    labor: 0.0005,
    craft: "metallurgy",
    kgPerLiter: 0.6
  },
  {
    name: "Leather Armor",
    pence: 60,
    source: "Dyer, via Hodges: armour in a merchant's house, possibly leather, 5s, 1285–1290",
    ironKg: 0.12,
    yield: PLATE_YIELD,
    leatherKg: 2.2,
    clothKg: 0,
    linenKg: 1.6,
    woodKg: 0,
    woodInPieceKg: 0,
    bronze: false,
    icon: "good-leather",
    color: "#6b4423",
    heavy: false,
    labor: 0.0002,
    craft: "leather",
    kgPerLiter: 0.35
  },
  {
    name: "Gauntlets",
    pence: 45,
    source: "Thorold Rogers, as averaged by the NBER wage paper: plate gloves at 5s (1369) and 2s 6d (1385)",
    ironKg: 0.85,
    yield: PLATE_YIELD,
    leatherKg: 0.25,
    clothKg: 0,
    linenKg: 0,
    woodKg: 0,
    woodInPieceKg: 0,
    bronze: false,
    icon: "good-arms",
    color: "#555555",
    heavy: false,
    labor: 0.0002,
    craft: "metallurgy",
    kgPerLiter: 0.6
  },
  {
    name: "Squire's Armor",
    pence: 1200,
    source: "Norman and Pottinger, via Hodges: a squire's armour £5 to £6 16s 8d in 1441. This uses the low end, £5",
    ironKg: 15,
    yield: PLATE_YIELD,
    leatherKg: 0.9,
    clothKg: 0.7,
    linenKg: 0,
    woodKg: 0,
    woodInPieceKg: 0,
    bronze: false,
    icon: "good-arms",
    color: "#4d463c",
    heavy: true,
    labor: 0.001,
    craft: "metallurgy",
    kgPerLiter: 0.6
  },
  {
    name: "Milanese Armor",
    pence: 2000,
    source: "Norman and Pottinger, via Hodges: ready-made Milanese armour, £8 6s 8d, 1441",
    ironKg: 22,
    yield: PLATE_YIELD,
    leatherKg: 1.3,
    clothKg: 0.9,
    linenKg: 0,
    woodKg: 0,
    woodInPieceKg: 0,
    bronze: false,
    icon: "good-arms",
    color: "#b08d57",
    heavy: true,
    labor: 0.002,
    craft: "metallurgy",
    kgPerLiter: 0.6
  },
  {
    name: "Horse Bard",
    pence: 960,
    source:
      "The equipment-cost table in Technology and Military Policy in Medieval England (c. 1250–1350) adds £4 of barding to the dearer covered horse. Hodges records no horse armour",
    ironKg: 20,
    yield: PLATE_YIELD,
    leatherKg: 2.2,
    clothKg: 1.5,
    linenKg: 0,
    woodKg: 0,
    woodInPieceKg: 0,
    bronze: false,
    icon: "good-harnesses",
    color: "#6a5a48",
    heavy: true,
    labor: 0.001,
    craft: "metallurgy",
    kgPerLiter: 0.5
  },
  {
    name: "Aketon",
    pence: 12,
    source:
      "Thorold Rogers, vol. 2 p. 559: five aketons at 1s each, Tickhill, 1312. The D&D padded armor. Seven ells of linen and a little over a pound of cotton, from the 1209–1213 wardrobe rolls",
    ironKg: 0,
    yield: PLATE_YIELD,
    leatherKg: 0,
    clothKg: 0,
    linenKg: 1.5,
    cottonKg: 0.6,
    woodKg: 0,
    woodInPieceKg: 0,
    bronze: false,
    icon: "good-cloth",
    color: "#d9d3c5",
    heavy: false,
    labor: 0.0001,
    craft: "textiles",
    kgPerLiter: 0.25
  },
  {
    name: "Habergeon",
    pence: 165,
    source:
      "Thorold Rogers, vol. 2 p. 559: habergeons at Tickhill, 1312, entered at 22s, 13s 9d and 6s. This uses the middle line, 13s 9d. The D&D chain shirt, shorter than the hauberk",
    ironKg: 7,
    yield: MAIL_YIELD,
    leatherKg: 0.15,
    clothKg: 0,
    linenKg: 0,
    woodKg: 0,
    woodInPieceKg: 0,
    bronze: false,
    icon: "good-arms",
    color: "#9aa3a8",
    heavy: true,
    labor: 0.0012,
    craft: "metallurgy",
    kgPerLiter: 0.4
  },
  {
    name: "Jack",
    pence: 240,
    source:
      "Thorold Rogers, vol. 2 p. 559: one jack at 20s, Southampton, 1385. The line does not say the jack held plates. The bar is a light jack of plates, which is what separates this price from the 1s aketon",
    ironKg: 3,
    yield: PLATE_YIELD,
    leatherKg: 1,
    clothKg: 0,
    linenKg: 1.5,
    woodKg: 0,
    woodInPieceKg: 0,
    bronze: false,
    icon: "good-cloth",
    color: "#6e6248",
    heavy: false,
    labor: 0.0004,
    craft: "metallurgy",
    kgPerLiter: 0.45
  },
  {
    name: "Brigandine",
    pence: 400,
    source:
      "Tellers' Rolls, about 1465: 36 brigandines for the Calais garrison at £1 13s 4d each, the same full price as the dearer brigandines in Sir John Howard's 1468 accounts. The 16s 8d lines there are halves. This is the coat the D&D studded leather is drawn from",
    ironKg: 8,
    yield: PLATE_YIELD,
    leatherKg: 1.8,
    clothKg: 0,
    linenKg: 0.6,
    woodKg: 0,
    woodInPieceKg: 0,
    bronze: false,
    icon: "good-leather",
    color: "#5c3a28",
    heavy: true,
    labor: 0.0008,
    craft: "metallurgy",
    kgPerLiter: 0.5
  },
  {
    name: "Poleaxe",
    pence: 28,
    source:
      "Thorold Rogers, vol. 2 p. 559: one poleaxe at 2s 4d, Southampton, 1385. The D&D halberd and the pollaxe; the hammer, the beak and the axe share this head",
    ironKg: 1.2,
    yield: PLATE_YIELD,
    leatherKg: 0.05,
    clothKg: 0,
    linenKg: 0,
    woodKg: 1.6,
    woodInPieceKg: 1.2,
    bronze: false,
    icon: "good-arms",
    color: "#4a4038",
    heavy: false,
    labor: 0.0002,
    craft: "metallurgy",
    kgPerLiter: 0.5
  }
];

export const MEDIEVAL_ARMOUR_GOOD_NAMES = MEDIEVAL_ARMOUR_PIECES.map(piece => piece.name);

/** Sale value of one piece, in SP, at 60 pence to the SP. */
export function spFromPence(pence: number): number {
  return Math.round((pence / MEDIEVAL_PENCE_PER_SP) * 100) / 100;
}

function units(kg: number, unitKg: number): number {
  return Math.round((kg / unitKg) * 1e6) / 1e6;
}

/** Finished mass of one piece: the metal that remains, plus leather, cloth, linen and wood. */
export function medievalArmourPieceKg(piece: MedievalArmourPiece): number {
  return piece.ironKg + piece.leatherKg + piece.clothKg + piece.linenKg + (piece.cottonKg ?? 0) + piece.woodInPieceKg;
}

/** Bar, fuel and fittings for one piece. The bronze leg repeats the iron mass. */
export function medievalArmourRecipes(piece: MedievalArmourPiece): Record<string, number>[] {
  const barKg = piece.ironKg / piece.yield;
  const body: Record<string, number> = {};
  if (barKg > 0) {
    body["Iron Ingot"] = units(barKg, KILOGRAMS["Iron Ingot"]);
    body.Charcoal = units(barKg * CHARCOAL_KG_PER_BAR_KG, KILOGRAMS.Charcoal);
  }
  if (piece.leatherKg > 0) body.Leather = units(piece.leatherKg, KILOGRAMS.Leather);
  if (piece.clothKg > 0) body.Cloth = units(piece.clothKg, KILOGRAMS.Cloth);
  if (piece.linenKg > 0) body.Linen = units(piece.linenKg, KILOGRAMS.Linen);
  if ((piece.cottonKg ?? 0) > 0) body.Cotton = units(piece.cottonKg ?? 0, KILOGRAMS.Cotton);
  if (piece.woodKg > 0) body.Wood = units(piece.woodKg, KILOGRAMS.Wood);
  if (!piece.bronze) return [body];
  const bronze = { ...body };
  delete bronze["Iron Ingot"];
  bronze.Bronze = units(barKg, KILOGRAMS.Bronze);
  return [body, bronze];
}

export const MEDIEVAL_ARMOUR_GOODS = MEDIEVAL_ARMOUR_PIECES.map(piece => ({
  name: piece.name,
  warEconomyType: "military" as const,
  tags: ["military"],
  icon: piece.icon,
  color: piece.color,
  // The recorded price. Labour is most of it; the recipe below is only the bar and fittings.
  value: spFromPence(piece.pence),
  chance: 0,
  recipes: medievalArmourRecipes(piece),
  unit: "piece",
  // Left out of the military budget on purpose. See the file comment.
  demandCoverage: {}
}));

export const MEDIEVAL_ARMOUR_LABOR: Readonly<Record<string, number>> = Object.fromEntries(
  MEDIEVAL_ARMOUR_PIECES.map(piece => [piece.name, piece.labor])
);

export const MEDIEVAL_ARMOUR_CRAFT: Readonly<Record<string, CraftKnowledgeDomain>> = Object.fromEntries(
  MEDIEVAL_ARMOUR_PIECES.map(piece => [piece.name, piece.craft])
);
