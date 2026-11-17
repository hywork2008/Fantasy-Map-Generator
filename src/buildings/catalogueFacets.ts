import { HISTORICAL_PERIODS, type HistoricalPeriod } from "../types/historicalPeriod";
import type { LandmarkModel } from "./landmarks/architectureKit";
import type { MedievalModel } from "./medieval/modelKit";
import type { ModelFacets, ModelKind, ModelRegion } from "./modelFacets";
import type { PlaceableObject } from "./placeableObjects";
import type { BuildingRecord } from "./record";

/**
 * Catalogue facets of the registered models (docs/plan/model-viewer-rename-and-catalogue-facets.md, stage 2).
 * A model's own `facets` field overrides the tables here.
 */

/** Inclusive run of Historical period values, oldest first. */
function span(from: HistoricalPeriod, to: HistoricalPeriod): HistoricalPeriod[] {
  return HISTORICAL_PERIODS.slice(HISTORICAL_PERIODS.indexOf(from), HISTORICAL_PERIODS.indexOf(to) + 1);
}
const ALL = [...HISTORICAL_PERIODS];
/** Antiquity to the eve of the steam era: vernacular forms that outlived the Middle Ages. */
const PRE_STEAM = span("classicalAntiquity", "preIndustrialEra");
const MEDIEVAL = span("earlyMedieval", "lateMedieval");
const HIGH_LATE = span("highMedieval", "lateMedieval");
/** Medieval forms still built or in use until industrialization. */
const MEDIEVAL_ON = span("earlyMedieval", "preIndustrialEra");
const HIGH_ON = span("highMedieval", "preIndustrialEra");
const LATE_ON = span("lateMedieval", "preIndustrialEra");
const EU: ModelRegion[] = ["european"];
const ANY: ModelRegion[] = ["any"];

function f(
  kind: ModelKind,
  periods: readonly HistoricalPeriod[],
  regions: readonly ModelRegion[],
  uses: readonly string[],
  years?: readonly [number, number]
): ModelFacets {
  return { kind, periods, regions, uses, ...(years ? { years } : {}) };
}
const s = (periods: readonly HistoricalPeriod[], regions: readonly ModelRegion[], ...uses: string[]) =>
  f("structure", periods, regions, uses);
const prop = (periods: readonly HistoricalPeriod[], regions: readonly ModelRegion[], ...uses: string[]) =>
  f("prop", periods, regions, uses);
const tree = (regions: readonly ModelRegion[], ...uses: string[]) => f("flora", ALL, regions, uses);

/** Defaults by medieval task number; ids below take precedence. */
const MEDIEVAL_TASKS: Record<number, ModelFacets> = {
  2: s(PRE_STEAM, ANY, "agriculture", "boundary"),
  3: s(MEDIEVAL_ON, EU, "agriculture", "storage"),
  4: s(MEDIEVAL_ON, EU, "agriculture", "livestock"),
  5: prop(PRE_STEAM, ANY, "livestock"),
  6: s(MEDIEVAL_ON, EU, "market", "trade"),
  7: s(MEDIEVAL_ON, EU, "dwelling"),
  8: s(HIGH_ON, EU, "dwelling", "trade"),
  9: f("vehicle", PRE_STEAM, ANY, ["transport"]),
  10: s(MEDIEVAL_ON, EU, "baking", "food"),
  11: s(MEDIEVAL_ON, EU, "smithing"),
  12: s(HIGH_ON, EU, "lodging"),
  13: prop(MEDIEVAL_ON, ANY, "fuel", "storage"),
  14: s(MEDIEVAL, EU, "worship"),
  15: s(HIGH_ON, EU, "brewing", "food"),
  16: s(MEDIEVAL_ON, EU, "agriculture", "storage"),
  17: s(HIGH_ON, EU, "storage", "trade"),
  18: s(HIGH_ON, EU, "livestock", "market", "trade"),
  19: prop(MEDIEVAL_ON, EU, "burial"),
  20: s(HIGH_ON, EU, "textiles"),
  21: s(HIGH_ON, EU, "woodworking"),
  22: s(MEDIEVAL_ON, EU, "tanning"),
  23: f("ship", PRE_STEAM, EU, ["fishing", "transport"]),
  25: s(LATE_ON, EU, "civic", "storage"),
  26: s(HIGH_ON, EU, "civic", "market"),
  27: s(HIGH_LATE, EU, "guild", "textiles", "trade"),
  28: s(HIGH_ON, EU, "guild"),
  29: s(MEDIEVAL_ON, EU, "masonry"),
  30: s(MEDIEVAL_ON, EU, "lime-burning", "masonry"),
  31: s(HIGH_ON, EU, "textiles"),
  32: s(MEDIEVAL, EU, "monastic", "worship"),
  33: s(HIGH_LATE, EU, "monastic", "worship"),
  34: s(MEDIEVAL_ON, EU, "pottery"),
  35: s(HIGH_ON, EU, "harbor", "trade"),
  36: s(MEDIEVAL_ON, EU, "justice"),
  37: s(HIGH_ON, EU, "glassware", "guild"),
  38: s(LATE_ON, EU, "printing"),
  39: s(LATE_ON, EU, "guild", "instrument-making"),
  40: s(MEDIEVAL_ON, EU, "masonry", "storage"),
  41: s(MEDIEVAL_ON, EU, "monastic", "worship"),
  42: s(span("lateMedieval", "maritimeEra"), ["european", "middle-eastern"], "lodging", "trade"),
  43: tree(ANY, "woodland"),
  44: s(PRE_STEAM, ANY, "burial"),
  45: s(HIGH_ON, EU, "dwelling"),
  46: s(span("ageOfExploration", "preIndustrialEra"), EU, "military"),
  47: s(PRE_STEAM, ANY, "crossing"),
  48: s(HIGH_ON, EU, "guild"),
  49: s(HIGH_ON, EU, "guild", "market"),
  50: s(HIGH_ON, EU, "dwelling"),
  51: s(HIGH_ON, EU, "crafts", "dwelling"),
  59: prop(HIGH_ON, EU, "market"),
  60: prop(MEDIEVAL_ON, EU, "burial", "worship")
};

/** Dedicated trade workshops share task numbers with other studies, so they are keyed by trade. */
const TRADE_WORKSHOP_USES: Record<string, string[]> = {
  "dedicated-bakehouse": ["baking", "food"],
  "dedicated-smithy": ["smithing"],
  "dedicated-farrier": ["farriery", "smithing"],
  "dedicated-cooperage": ["cooperage"],
  "dedicated-wet-tannery": ["tanning"],
  "dedicated-ropewalk": ["ropemaking"],
  "dedicated-butchery": ["butchery", "food"],
  "dedicated-chandlery": ["chandlery"],
  "dedicated-metalwares": ["metalwares"],
  "dedicated-fishmongery": ["fishmongery", "food"],
  "dedicated-cutlery": ["cutlery"],
  "dedicated-lime-tile-yard": ["lime-burning", "tile-making"],
  "dedicated-glaziers-workshop": ["glazing"],
  "dedicated-horse-mill": ["milling"]
};

const MEDIEVAL_IDS: Record<string, ModelFacets> = {
  "two-wheel-farm-cart": f("vehicle", PRE_STEAM, ANY, ["agriculture", "transport"]),
  "town-church-parish": s(HIGH_LATE, EU, "worship"),
  "town-church-large": s(HIGH_LATE, EU, "worship"),
  "town-church-collegiate": s(HIGH_LATE, EU, "worship"),
  "printers-guild-hall": s(LATE_ON, EU, "guild", "printing"),
  "cobblers-workshop": s(HIGH_ON, EU, "leather", "shoemaking"),
  "tailors-workshop": s(HIGH_ON, EU, "tailoring", "textiles"),
  "coopers-workshop": s(HIGH_ON, EU, "cooperage", "woodworking"),
  "farriers-workshop": s(MEDIEVAL_ON, EU, "farriery", "smithing"),
  "leather-guild-hall": s(HIGH_ON, EU, "guild", "leather"),
  "woodworking-guild-hall": s(HIGH_ON, EU, "guild", "woodworking"),
  "masonry-guild-hall": s(HIGH_ON, EU, "guild", "masonry"),
  "metallurgy-guild-hall": s(HIGH_ON, EU, "guild", "smithing"),
  "covered-market-hall": s(HIGH_ON, EU, "market", "trade"),
  "corner-jettied-shop-house": s(HIGH_ON, EU, "dwelling", "trade"),
  "double-jettied-merchant-house": s(HIGH_ON, EU, "dwelling", "trade"),
  "pillory-and-stocks": prop(HIGH_ON, EU, "justice"),
  "lych-gate": s(MEDIEVAL_ON, EU, "burial", "worship"),
  // Trees (task 43): native range and principal cultivation.
  "arabica-coffee": tree(["african", "middle-eastern"], "orchard"),
  cacao: tree(["american"], "orchard"),
  "sweet-chestnut": tree(["european", "mediterranean"], "orchard", "woodland"),
  lemon: tree(["mediterranean", "middle-eastern", "south-asian"], "orchard"),
  "common-fig": tree(["mediterranean", "middle-eastern"], "orchard"),
  "european-plum": tree(EU, "orchard"),
  "european-pear": tree(EU, "orchard"),
  "domestic-apple": tree(EU, "orchard"),
  "scots-pine": tree(EU, "woodland"),
  "european-hornbeam": tree(EU, "woodland"),
  "pedunculate-oak": tree(EU, "woodland"),
  "european-beech": tree(EU, "woodland"),
  "garden-parkland": tree(EU, "ornamental", "woodland"),
  "norway-spruce": tree(EU, "woodland"),
  "silver-birch": tree(EU, "woodland"),
  "sacred-yew": tree(EU, "sacred", "woodland"),
  "date-palm": tree(["middle-eastern", "african"], "orchard"),
  "date-palm-orchard": tree(["middle-eastern", "african"], "orchard"),
  "date-palm-orchard-male": tree(["middle-eastern", "african"], "orchard"),
  "date-palm-orchard-young": tree(["middle-eastern", "african"], "orchard"),
  "umbrella-thorn": tree(["african", "middle-eastern"], "woodland"),
  saxaul: tree(["middle-eastern", "east-asian"], "woodland"),
  kapok: tree(["american", "african"], "woodland"),
  "western-red-cedar": tree(["american"], "woodland"),
  "black-alder": tree(EU, "wetland", "woodland"),
  olive: tree(["mediterranean"], "orchard"),
  "olive-orchard": tree(["mediterranean"], "orchard"),
  "silver-fir": tree(EU, "woodland"),
  "red-mangrove": tree(["american", "african"], "wetland"),
  tamarisk: tree(["mediterranean", "middle-eastern"], "woodland"),
  rowan: tree(EU, "woodland"),
  "canary-pine": tree(["african"], "woodland"),
  "mediterranean-cypress": tree(["mediterranean", "middle-eastern"], "ornamental", "sacred"),
  "oriental-evergreen": tree(["east-asian"], "ornamental", "sacred"),
  "sacred-bodhi-and-fig": tree(["south-asian"], "sacred"),
  "peaceful-willow": tree(["east-asian"], "ornamental", "wetland"),
  // Cemetery facilities (task 44): traditions from several culture areas.
  "ossuary-charnel-house": s(MEDIEVAL_ON, EU, "burial"),
  "preaching-cross-calvary": s(MEDIEVAL_ON, EU, "burial", "worship"),
  "mausoleum-dome": s(HIGH_ON, ["middle-eastern", "south-asian"], "burial"),
  "stupa-chorten": s(PRE_STEAM, ["south-asian", "east-asian"], "burial", "worship"),
  "cremation-pyre-platform": s(PRE_STEAM, ["south-asian"], "burial"),
  "tower-of-silence": s(PRE_STEAM, ["middle-eastern", "south-asian"], "burial"),
  "ancestral-hall": s(PRE_STEAM, ["east-asian"], "burial", "worship"),
  "terrace-horseshoe": s(PRE_STEAM, ["east-asian"], "burial"),
  "linear-avenue-monuments": s(PRE_STEAM, ["east-asian"], "burial"),
  "columbarium-walls": s(PRE_STEAM, ["mediterranean", "east-asian"], "burial"),
  "mourning-cloister": s(MEDIEVAL_ON, EU, "burial", "worship"),
  "cairns-and-steles": prop(PRE_STEAM, ANY, "burial"),
  "flat-ground-markers": prop(PRE_STEAM, ANY, "burial"),
  "bone-cleaning-table": prop(PRE_STEAM, ["east-asian"], "burial"),
  "incense-candle-stand": prop(PRE_STEAM, ANY, "burial", "worship"),
  "skull-shelf": prop(MEDIEVAL_ON, EU, "burial"),
  "high-stone-wall": s(PRE_STEAM, ANY, "boundary", "burial"),
  "low-curb-or-hedge": s(PRE_STEAM, ANY, "boundary", "burial"),
  "ditch-and-rampart": s(PRE_STEAM, ANY, "boundary", "burial"),
  "monumental-gate-pylon": s(PRE_STEAM, ANY, "boundary", "burial"),
  // Task 46 also holds two lodging courtyards beside the citadel.
  "earthen-courtyard-caravanserai": s(MEDIEVAL_ON, ["middle-eastern"], "lodging", "trade"),
  "wayside-courtyard-inn": s(HIGH_ON, EU, "lodging"),
  // Bridges (task 47).
  "modular-lifting-river-bridge": s(HIGH_ON, EU, "crossing"),
  "timber-rope-suspension-bridge": s(PRE_STEAM, ["american", "south-asian", "east-asian"], "crossing"),
  "timber-rope-suspension-bridge-long": s(PRE_STEAM, ["american", "south-asian", "east-asian"], "crossing")
};

const kebab = (value: string) => value.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);

/** Facets of a medieval study; throws when neither the model nor the tables cover it. */
export function medievalFacets(model: Pick<MedievalModel, "id" | "task" | "facets">): ModelFacets {
  if (model.facets) return model.facets;
  const byId = MEDIEVAL_IDS[model.id];
  if (byId) return byId;
  if (model.id.startsWith("trade-workshop.")) {
    const uses = TRADE_WORKSHOP_USES[model.id.slice("trade-workshop.".length)];
    if (!uses) throw new Error(`Missing facets for ${model.id}`);
    return s(HIGH_ON, EU, ...uses);
  }
  const byTask = MEDIEVAL_TASKS[model.task];
  if (!byTask) throw new Error(`Missing facets for ${model.id}`);
  // A trade workhome adds its trade, the last id segment, to the shared workhome tags.
  if (model.task === 51) return { ...byTask, uses: [...byTask.uses, kebab(model.id.split(".").at(-1)!)].sort() };
  return byTask;
}

const GOTHIC = HIGH_LATE;
const ROMANESQUE = span("earlyMedieval", "highMedieval");
const EU_MED: ModelRegion[] = ["european", "mediterranean"];
const LANDMARK_IDS: Record<string, ModelFacets> = {
  brugesCityHall: s(["lateMedieval"], EU, "civic"),
  milan: s(LATE_ON, EU_MED, "worship"),
  pisa: s(ROMANESQUE, EU_MED, "worship"),
  modena: s(ROMANESQUE, EU_MED, "worship"),
  santAmbrogio: s(ROMANESQUE, EU_MED, "worship"),
  conques: s(ROMANESQUE, EU, "monastic", "worship"),
  mariaLaach: s(ROMANESQUE, EU, "monastic", "worship"),
  vezelay: s(ROMANESQUE, EU, "monastic", "worship")
};

/** Facets of a landmark; imaginary landmarks belong to no period or region of the real world. */
export function landmarkFacets(model: Pick<LandmarkModel, "id" | "style" | "facets">): ModelFacets {
  if (model.facets) return model.facets;
  if (LANDMARK_IDS[model.id]) return LANDMARK_IDS[model.id];
  if (model.style === "Imaginary") return s(ALL, ANY, "fantasy");
  return s(model.style === "Gothic" ? GOTHIC : ROMANESQUE, EU, "worship");
}

const WATER_MILL = s(PRE_STEAM, EU, "milling");
const PLACEABLE_IDS: Record<string, ModelFacets> = {
  trebuchet: f("weapon", HIGH_LATE, ["european", "middle-eastern"], ["military", "siege"]),
  batteringRam: f("weapon", span("classicalAntiquity", "lateMedieval"), EU, ["military", "siege"]),
  siegeTower: f("weapon", span("classicalAntiquity", "lateMedieval"), EU, ["military", "siege"]),
  hotAirBalloon: f("vehicle", span("preIndustrialEra", "rocketryEra"), ANY, ["aviation"], [1783, 2100]),
  airship: f("vehicle", span("steamEra", "petroleumEra"), ANY, ["aviation", "transport"], [1852, 1940]),
  steamLocomotive: f("vehicle", span("steamEra", "petroleumEra"), ANY, ["railway", "transport"]),
  minecart: f("vehicle", span("lateMedieval", "steamEra"), EU, ["mining", "transport"]),
  medievalWagon: f("vehicle", MEDIEVAL, EU, ["transport"]),
  coveredWagon: f("vehicle", span("preIndustrialEra", "steamEra"), ["european", "american"], ["transport"]),
  nobleCarriage: f("vehicle", span("lateMedieval", "ageOfExploration"), EU, ["transport"]),
  warWagon: f("vehicle", ["lateMedieval"], EU, ["military"]),
  postMill: s(MEDIEVAL_ON, EU, "milling"),
  towerMill: s(LATE_ON, EU, "milling"),
  waterMill: WATER_MILL,
  waterMillLowBankShallowForward: WATER_MILL,
  waterMillLowBankShallowReverse: WATER_MILL,
  waterMillLowBankDeepForward: WATER_MILL,
  waterMillLowBankDeepReverse: WATER_MILL,
  earlyFieldCannon: f("weapon", span("lateMedieval", "ageOfExploration"), EU, ["artillery", "military"]),
  medievalWell: s(MEDIEVAL_ON, EU, "water"),
  publicBasin: s(MEDIEVAL_ON, EU_MED, "water"),
  spring: s(PRE_STEAM, ANY, "water"),
  washhouse: s(MEDIEVAL_ON, EU, "laundry", "water")
};

/** Facets of a placeable object; throws for an object no table covers. */
export function placeableFacets(object: Pick<PlaceableObject, "id" | "facets">): ModelFacets {
  const facets = object.facets ?? PLACEABLE_IDS[object.id];
  if (!facets) throw new Error(`Missing facets for ${object.id}`);
  return facets;
}

/** Record regions are real places; this maps each record to a culture area without changing its hashed JSON. */
const RECORD_REGIONS: Record<string, ModelRegion[]> = {
  "basilica-temple": ANY,
  beaumaris: EU,
  "castel-del-monte": EU_MED,
  "fixture-courtyard-keep": ANY,
  "krak-inner-ward": ["middle-eastern"],
  "langeais-keep": EU,
  "loches-donjon": EU,
  nunney: EU,
  "orford-keep": EU,
  "vincennes-donjon": EU,
  "white-tower": EU
};
const RECORD_USES: Record<BuildingRecord["kind"], string[]> = {
  castle: ["fortification", "military"],
  temple: ["worship"],
  monastery: ["monastic", "worship"],
  house: ["dwelling"],
  watermill: ["milling"],
  dungeon: ["fantasy"]
};

/** Facets derived from a catalogue record's kind and period plus its mapped culture area. */
export function recordFacets(record: Pick<BuildingRecord, "id" | "kind" | "period">): ModelFacets {
  const regions = RECORD_REGIONS[record.id];
  if (!regions) throw new Error(`Missing region for ${record.id}`);
  return s([record.period], regions, ...RECORD_USES[record.kind]);
}
