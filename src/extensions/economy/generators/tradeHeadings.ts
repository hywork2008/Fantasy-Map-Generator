/**
 * One trade-statistics heading per catalogue good.
 *
 * `tags` still drive production, demand, and recipes, and one good often carries several.
 * A shipment is counted once, under the heading a customs roll or a trade return would use.
 *
 * Alcoholic drinks are Beverages, not Food. UN SITC keeps section 0 (food and live animals)
 * apart from section 1 (beverages and tobacco). EU VAT Directive 2006/112/EC Annex III allows
 * a reduced rate for foodstuffs, including beverages but excluding alcoholic beverages.
 * UK VAT Notice 701/14 standard-rates beer, cider, perry, wine, and spirits. In medieval
 * England the Assize of Bread and Ale priced ale apart from bread, and tunnage was a wine
 * duty distinct from poundage on other goods. French aides taxed wine as wine.
 *
 * Vinegar is a condiment (food), even though the Harmonized System lists it in the beverages
 * chapter. Pomace is the pressing residue, not a drink. Milk, tea, coffee, cocoa, and spices
 * stay in food: SITC division 07 is inside section 0, and UK VAT can zero-rate those drinks
 * as food. Tobacco is its own excise heading. Slaves are people, not livestock or food.
 * Live animals stay out of food; meat, wool, and cloth are separate goods.
 *
 * Headings follow SITC sections, opened where a staple or an excise had its own roll
 * (textiles, clothing, metals, ships, arms, precious goods).
 */

export const TRADE_HEADINGS = [
  "food",
  "beverages",
  "tobacco",
  "animals",
  "people",
  "crude",
  "fuels",
  "fats",
  "chemicals",
  "leather",
  "wood",
  "textiles",
  "clothing",
  "ceramics",
  "metals",
  "precious",
  "machinery",
  "ships",
  "arms",
  "art",
  "manufactures",
  "other"
] as const;

export type TradeHeadingId = (typeof TRADE_HEADINGS)[number];

export const TRADE_HEADING_LABELS: Record<TradeHeadingId, string> = {
  food: "Food",
  beverages: "Beverages",
  tobacco: "Tobacco",
  animals: "Live animals",
  people: "People",
  crude: "Crude materials",
  fuels: "Fuels",
  fats: "Oils and fats",
  chemicals: "Chemicals",
  leather: "Hides and furs",
  wood: "Wood",
  textiles: "Textiles",
  clothing: "Clothing",
  ceramics: "Stone and ceramic",
  metals: "Base metals",
  precious: "Precious goods",
  machinery: "Machinery",
  ships: "Ships",
  arms: "Arms",
  art: "Works of art",
  manufactures: "Manufactures",
  other: "Other"
};

const HEADING_IDS = new Set<string>(TRADE_HEADINGS);

/** First match wins, so a drink tagged as food still falls back to Beverages. */
const TAG_HEADING: readonly (readonly [string, TradeHeadingId])[] = [
  ["beverage", "beverages"],
  ["tobacco", "tobacco"],
  ["liveAnimal", "animals"],
  ["food", "food"],
  ["freshFood", "food"],
  ["stapleFood", "food"],
  ["stapleCrop", "food"],
  ["preservedFood", "food"],
  ["fodder", "food"],
  ["fuel", "fuels"],
  ["metal", "metals"],
  ["ingot", "metals"],
  ["metalloid", "metals"],
  ["ore", "crude"],
  ["mineral", "crude"],
  ["art", "art"],
  ["clothing", "clothing"],
  ["military", "arms"],
  ["luxury", "precious"],
  ["naval", "ships"],
  ["construction", "ceramics"]
];

export const CATALOG_TRADE_HEADINGS = {
  Wood: "wood",
  Stone: "ceramics",
  Marble: "ceramics",
  "Iron Ore": "crude",
  "Copper Ore": "crude",
  "Tin Ore": "crude",
  "Lead Ore": "crude",
  "Silver Ore": "crude",
  "Gold Ore": "crude",
  "Chromium Ore": "crude",
  "Nickel Ore": "crude",
  "Molybdenum Ore": "crude",
  "Silicon Ore": "crude",
  "Iron Ingot": "metals",
  "Copper Ingot": "metals",
  "Tin Ingot": "metals",
  "Lead Ingot": "metals",
  "Silver Ingot": "precious",
  "Gold Ingot": "precious",
  "Chromium Ingot": "metals",
  "Nickel Ingot": "metals",
  "Molybdenum Ingot": "metals",
  "Silicon Ingot": "metals",
  Grain: "food",
  Wheat: "food",
  Rye: "food",
  Barley: "food",
  Oats: "food",
  Millet: "food",
  Maize: "food",
  Rice: "food",
  Buckwheat: "food",
  Peas: "food",
  "Broad Beans": "food",
  Lentils: "food",
  Chickpeas: "food",
  Soybeans: "food",
  Turnips: "food",
  Potatoes: "food",
  Cattle: "animals",
  Fish: "food",
  Game: "food",
  Wine: "beverages",
  Pomace: "food",
  Olives: "food",
  Honey: "food",
  Salt: "crude",
  Dates: "food",
  Horses: "animals",
  Fodder: "food",
  Elephants: "animals",
  Camels: "animals",
  Hemp: "textiles",
  Pearls: "precious",
  Gemstones: "precious",
  Dyes: "chemicals",
  Incense: "crude",
  Silk: "textiles",
  Spices: "food",
  Cocoa: "food",
  Coffee: "food",
  Rubber: "crude",
  Amber: "precious",
  Furs: "leather",
  Sheep: "animals",
  Slaves: "people",
  Tar: "chemicals",
  Sulfur: "crude",
  Obsidian: "crude",
  Saltpeter: "crude",
  Coal: "fuels",
  Charcoal: "fuels",
  Oil: "fats",
  Mahogany: "wood",
  Whales: "food",
  Sugarcane: "food",
  Tea: "food",
  Tobacco: "tobacco",
  Clay: "crude",
  Brick: "ceramics",
  Firebrick: "ceramics",
  "Volcanic Ash": "crude",
  Pumice: "crude",
  "White sand": "crude",
  Leather: "leather",
  Cloth: "textiles",
  Garments: "clothing",
  Ceramics: "ceramics",
  Glass: "ceramics",
  Lime: "ceramics",
  "Roman Concrete": "ceramics",
  "Slaked Lime": "ceramics",
  Ropes: "textiles",
  Paper: "manufactures",
  Ink: "chemicals",
  Books: "manufactures",
  Sails: "textiles",
  Sloop: "ships",
  Caravel: "ships",
  Galleon: "ships",
  Boots: "clothing",
  "Leather Goods": "clothing",
  Harnesses: "leather",
  Barrels: "wood",
  Bronze: "metals",
  Tools: "machinery",
  Arms: "arms",
  Arrows: "arms",
  Gunpowder: "chemicals",
  Bullets: "arms",
  Muskets: "arms",
  Artillery: "arms",
  Coins: "precious",
  Jewelry: "precious",
  "Preserved food": "food",
  Vinegar: "food",
  Milk: "food",
  Rennet: "food",
  Ash: "crude",
  Cheese: "food",
  "Smoked Cheese": "food",
  Egg: "food",
  Beer: "beverages",
  Cider: "beverages",
  Perry: "beverages",
  Mead: "beverages",
  "Pomace Wine": "beverages",
  Liquor: "beverages",
  Candles: "manufactures",
  "Tallow Candles": "manufactures",
  Soap: "chemicals",
  "Castile Soap": "chemicals",
  Perfume: "chemicals",
  Peat: "fuels",
  Resin: "chemicals",
  "Medicinal herbs": "crude",
  Shellfish: "food",
  Reeds: "crude",
  Goats: "animals",
  Pig: "animals",
  Chicken: "animals",
  Wool: "textiles",
  Flax: "textiles",
  Linen: "textiles",
  Cotton: "textiles",
  Tallow: "fats",
  Meat: "food",
  Beeswax: "fats",
  Flour: "food",
  Bread: "food",
  Timber: "wood",
  Alum: "crude",
  Potash: "crude",
  Slag: "crude",
  Ivory: "precious",
  Coral: "precious",
  Stockfish: "food",
  "Spinning Wheel": "machinery",
  Artworks: "art",
  Sculptures: "art",
  Tapestries: "art",
  Instruments: "manufactures",
  Relics: "manufactures",
  Cats: "animals",
  Dogs: "animals",
  Grapes: "food",
  Apples: "food",
  Pears: "food",
  Plums: "food",
  Figs: "food",
  Lemons: "food",
  "Dried Fruits": "food",
  Raisins: "food",
  Coke: "fuels",
  Steel: "metals",
  "Stainless Steel": "metals",
  "Machine Parts": "machinery",
  "Copper Wire": "metals",
  "Stationary Steam Engine": "machinery",
  Rail: "metals",
  Locomotive: "machinery",
  "Marine Steam Engine": "machinery",
  Steamship: "ships",
  "Lab Glassware": "ceramics",
  "Precision Instruments": "machinery",
  Medicines: "chemicals",
  "Sulfuric Acid": "chemicals",
  Chlorine: "chemicals",
  "Bleaching Powder": "chemicals",
  "Nitric Acid": "chemicals",
  "Coal Tar": "fuels",
  "Synthetic Dye": "chemicals",
  "Soda Ash": "chemicals",
  Barilla: "chemicals",
  "Caustic Soda": "chemicals",
  "Phosphate Rock": "crude",
  Bauxite: "crude",
  Alumina: "chemicals",
  Aluminum: "metals",
  "Light Alloy Parts": "metals",
  Cinnabar: "crude",
  Mercury: "chemicals",
  "Crude Oil": "fuels",
  Kerosene: "fuels",
  "Synthetic Resin": "chemicals",
  "Lubricating Oil": "fuels",
  "Natural Gas": "fuels",
  LNG: "fuels",
  "Phosphate Fertilizer": "chemicals",
  "Synthetic Ammonia": "chemicals",
  "Nitrogen Fertilizer": "chemicals",
  Spelt: "food",
  Chestnuts: "food",
  "Fine Wool Cloth": "textiles",
  "Fine Wool Garments": "clothing",
  "Linen Garments": "clothing",
  "Wool Cloth": "textiles",
  "Wool Garments": "clothing",
  "Wool Blankets": "textiles"
} as const satisfies Record<string, TradeHeadingId>;

export function isTradeHeadingId(value: string | undefined): value is TradeHeadingId {
  return value !== undefined && HEADING_IDS.has(value);
}

function headingFromTags(tags: readonly string[]): TradeHeadingId {
  const present = new Set(tags);
  for (const [tag, heading] of TAG_HEADING) {
    if (present.has(tag)) return heading;
  }
  return "other";
}

/** Shipped heading for a catalogue name. Throws when a new good has not been classified. */
export function catalogTradeHeading(name: string): TradeHeadingId {
  const heading = CATALOG_TRADE_HEADINGS[name as keyof typeof CATALOG_TRADE_HEADINGS];
  if (!heading) throw new Error(`No trade heading for good ${name}`);
  return heading;
}

/** Catalogue name wins. User-added goods use their stored heading, then their tags. */
export function assignedTradeHeading(good: {
  name: string;
  tradeHeading?: string;
  tags?: readonly string[];
}): TradeHeadingId {
  const listed = CATALOG_TRADE_HEADINGS[good.name as keyof typeof CATALOG_TRADE_HEADINGS];
  if (listed) return listed;
  if (isTradeHeadingId(good.tradeHeading)) return good.tradeHeading;
  return headingFromTags(good.tags ?? []);
}

/** Label shown on the trade-volume chart. */
export function tradeHeadingOf(good: { name: string; tradeHeading?: string; tags?: readonly string[] }): string {
  return TRADE_HEADING_LABELS[assignedTradeHeading(good)];
}
