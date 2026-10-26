import type { MedievalModel } from "../buildings/medieval/modelKit";

export function wikipediaLink(article: string): HTMLAnchorElement {
  const link = document.createElement("a");
  link.href = `https://en.wikipedia.org/wiki/${encodeURIComponent(article.replaceAll(" ", "_"))}`;
  link.textContent = `Wikipedia (English): ${article}`;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

export const catalogueWikipedia: Record<string, string> = {
  beaumaris: "Beaumaris Castle",
  "castel-del-monte": "Castel del Monte, Apulia",
  "fixture-courtyard-keep": "Keep",
  "krak-inner-ward": "Krak des Chevaliers",
  "langeais-keep": "Château de Langeais",
  "loches-donjon": "Château de Loches",
  nunney: "Nunney Castle",
  "orford-keep": "Orford Castle",
  "vincennes-donjon": "Château de Vincennes",
  "white-tower": "White Tower (Tower of London)",
  "basilica-temple": "Basilica"
};

export const landmarkWikipedia: Record<string, string> = {
  amiens: "Amiens Cathedral",
  brugesCityHall: "Bruges City Hall",
  burgos: "Burgos Cathedral",
  chartres: "Chartres Cathedral",
  pisa: "Pisa Cathedral",
  milan: "Milan Cathedral",
  "notre-dame-paris": "Notre-Dame de Paris",
  saintSernin: "Basilica of Saint-Sernin, Toulouse",
  cologne: "Cologne Cathedral",
  mariaLaach: "Maria Laach Abbey",
  durham: "Durham Cathedral",
  conques: "Abbey Church of Sainte-Foy",
  salisbury: "Salisbury Cathedral",
  reims: "Reims Cathedral",
  modena: "Modena Cathedral",
  vezelay: "Vézelay Abbey",
  sainteChapelle: "Sainte-Chapelle",
  santiago: "Santiago de Compostela Cathedral",
  speyer: "Speyer Cathedral",
  santAmbrogio: "Basilica of Sant'Ambrogio"
};

export const containerWikipedia: Record<string, string> = {
  barrel: "Barrel",
  crate: "Crate",
  sack: "Bag",
  basket: "Basket"
};
export const wallWikipedia: Record<string, string> = {
  "town-curtain-wall": "Curtain wall (fortification)",
  "town-mural-tower": "Fortified tower",
  "town-gate": "City gate"
};

const taskArticles: Record<number, string> = {
  2: "Fence",
  3: "Barn",
  4: "Stable",
  5: "Manger",
  6: "Market stall",
  7: "House",
  8: "Shophouse",
  9: "Cart",
  10: "Bakery",
  11: "Forge",
  12: "Inn",
  13: "Firewood",
  14: "Parish church",
  15: "Brewery",
  16: "Granary",
  17: "Warehouse",
  18: "Livestock",
  19: "Headstone",
  20: "Weaving",
  21: "Woodworking",
  22: "Tanning (leather)",
  23: "Fishing vessel",
  25: "Granary",
  26: "Town hall",
  27: "Cloth hall",
  28: "Guildhall",
  29: "Stonemasonry",
  30: "Lime kiln",
  31: "Bleachfield",
  32: "Abbey",
  33: "Mendicant orders",
  34: "Pottery",
  35: "Treadwheel crane",
  36: "Gallows",
  37: "Glass production",
  38: "Printing press",
  39: "Musical instrument",
  40: "Sand",
  41: "Eastern Christian monasticism",
  42: "Caravanserai",
  45: "Jettying"
};

const modelArticles: Record<string, string> = {
  "wattle-fence": "Wattle (construction)",
  "simple-timber-gate": "Wicket gate",
  "hay-shelter": "Hay barrack",
  "cattle-byre": "Barn",
  pigsty: "Pigsty",
  "chicken-coop": "Chicken coop",
  "stone-water-trough": "Watering trough",
  "half-timber-farmhouse": "Timber framing",
  "stone-cottage": "Cottage",
  "wooden-wheelbarrow": "Wheelbarrow",
  "two-person-handbarrow": "Handbarrow",
  "communal-bread-oven": "Communal oven",
  "farriers-workshop": "Farrier",
  "brushwood-faggots": "Faggot (unit)",
  "charcoal-bin": "Charcoal",
  "village-chapel": "Chapel",
  "wooden-grave-cross": "Christian cross",
  "churchyard-slabs": "Ledger stone",
  "tailors-workshop": "Tailor",
  "cobblers-workshop": "Shoemaking",
  "coopers-workshop": "Cooper (profession)",
  "joiners-workshop": "Joiner",
  "open-rowing-boat": "Rowboat",
  "covered-market-hall": "Market hall",
  "harbor-winch-crane": "Crane (machine)",
  "printers-guild-hall": "Guildhall",
  "garden-parkland": "Tilia cordata",
  "sacred-yew": "Taxus baccata",
  "mediterranean-cypress": "Cupressus sempervirens",
  "oriental-evergreen": "Evergreen",
  "sacred-bodhi-and-fig": "Ficus religiosa",
  "peaceful-willow": "Willow",
  "ossuary-charnel-house": "Charnel house",
  "preaching-cross-calvary": "Preaching cross",
  "mausoleum-dome": "Mausoleum",
  "stupa-chorten": "Stupa",
  "cremation-pyre-platform": "Pyre",
  "tower-of-silence": "Tower of Silence",
  "ancestral-hall": "Ancestral shrine",
  "stepped-tumuli-mounds": "Tumulus",
  "columbarium-walls": "Columbarium",
  "cairns-and-steles": "Cairn",
  "flat-ground-markers": "Headstone",
  "terrace-horseshoe": "Chinese ancestral veneration",
  "linear-avenue-monuments": "Funerary art",
  "bone-cleaning-table": "Secondary burial",
  "incense-candle-stand": "Censer",
  "skull-shelf": "Tzompantli",
  "high-stone-wall": "Defensive wall",
  "low-curb-or-hedge": "Hedge",
  "ditch-and-rampart": "Rampart (fortification)",
  "monumental-gate-pylon": "Pylon (architecture)",
  "mourning-cloister": "Cloister"
};

export function medievalWikipediaArticle(model: Pick<MedievalModel, "id" | "task">): string {
  const article = modelArticles[model.id] ?? taskArticles[model.task];
  if (!article) throw new Error(`Missing Wikipedia article for ${model.id}`);
  return article;
}
