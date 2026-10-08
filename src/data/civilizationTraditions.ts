/**
 * Civilization traditions: which historical civilization a culture's name base
 * evokes, and which faith, fortification and religious houses it had in each
 * Historical period (docs/plan/culture-civilization-overhaul.md).
 *
 * One table drives burial profiles, religion forms, castle styles and
 * monasteries, so a city never mixes a Roman necropolis, an Islamic qal'a and a
 * Franciscan friary by accident. A mix is still possible when the burg's local
 * religion differs from its culture (conquest, conversion), and then it is
 * explicit in the burg descriptor.
 *
 * Conversion follows each civilization's own history only. Conversions that
 * historically came from outside conquest (the Spanish in Mexico and Peru,
 * missionaries in Hawaii) are not applied: a fantasy world has no Spain.
 */

/** Period order shared by FMG (earlyMedieval…) and CE (which adds classicalAntiquity). */
export const TRADITION_PERIODS = [
  "classicalAntiquity",
  "earlyMedieval",
  "highMedieval",
  "lateMedieval",
  "ageOfExploration",
  "maritimeEra",
  "preIndustrialEra",
  "steamEra",
  "industrialChemistryEra",
  "petroleumEra",
  "rocketryEra"
] as const;
export type TraditionPeriod = (typeof TRADITION_PERIODS)[number];

export function periodIndex(period: string | undefined): number {
  const index = TRADITION_PERIODS.indexOf((period ?? "ageOfExploration") as TraditionPeriod);
  return index < 0 ? TRADITION_PERIODS.indexOf("ageOfExploration") : index;
}

export const FAITH_FAMILIES = [
  // Abrahamic
  "latinCatholic",
  "protestant",
  "orthodox",
  "sunni",
  "shia",
  "judaism",
  // Iranian and Dharmic / East Asian
  "zoroastrian",
  "hindu",
  "theravada",
  "mahayana",
  "vajrayana",
  "shintoBuddhist",
  "sinitic",
  "neoConfucian",
  // Pre-conversion and indigenous
  "classicalPolytheism",
  "semiticPolytheism",
  "germanicPagan",
  "celticPagan",
  "slavicPagan",
  "balticFinnicPagan",
  "tengri",
  "shamanic",
  "mesoamerican",
  "andean",
  "polynesian",
  "westAfrican",
  // Fantasy folk
  "sylvanElven",
  "chthonic",
  "dwarvenAncestor",
  "giantMegalithic",
  "draconic",
  "tribalSpirit",
  "serpentCult",
  "infernal"
] as const;
export type FaithFamily = (typeof FAITH_FAMILIES)[number];

/** Fortification lineage; CE turns it into a castle style per period. */
export type FortificationFamily =
  | "european" // motte → keep → concentric → bastion
  | "islamic" // qal'a / alcazaba, bastions from the pre-industrial era
  | "japanese" // shiro on stone ramparts
  | "sinitic" // walled yamen compound (no dedicated CE style yet)
  | "classical" // castra / acropolis / cyclopean citadel
  | "earthwork" // ringfort, palisade, hillfort
  | "fantastic"; // no historical analogue

export type ReligiousHouse =
  | "abbey" // Benedictine / Cistercian enclosed monastery
  | "friary" // mendicant convent (Franciscan, Dominican), founded 1209 onwards
  | "orthodoxMonastery"; // Basilian / Athonite monastery

interface TraditionEra {
  from: TraditionPeriod;
  faith: FaithFamily;
  fortification: FortificationFamily;
}

export interface CivilizationTradition {
  id: string;
  /** Japanese label for UI and docs. */
  label: string;
  /** Pre-conversion / folk substrate used by Folk religions. */
  folkFaith: FaithFamily;
  /** Ascending by `from`; the first entry also covers earlier periods. */
  eras: TraditionEra[];
  /** Burial presets that override the faith default for this civilization. */
  burialPresets?: Partial<Record<FaithFamily, readonly string[]>>;
}

const era = (from: TraditionPeriod, faith: FaithFamily, fortification: FortificationFamily): TraditionEra => ({
  from,
  faith,
  fortification
});

export const CIVILIZATION_TRADITIONS: Record<string, CivilizationTradition> = {
  latinWest: {
    id: "latinWest",
    label: "ラテン・カトリック西欧",
    folkFaith: "germanicPagan",
    eras: [era("classicalAntiquity", "germanicPagan", "earthwork"), era("earlyMedieval", "latinCatholic", "european")]
  },
  gallic: {
    id: "gallic",
    label: "フランス（ガリア）",
    folkFaith: "celticPagan",
    eras: [era("classicalAntiquity", "celticPagan", "earthwork"), era("earlyMedieval", "latinCatholic", "european")]
  },
  latinMediterranean: {
    id: "latinMediterranean",
    label: "地中海ラテン（イタリア・イベリア）",
    folkFaith: "classicalPolytheism",
    eras: [
      era("classicalAntiquity", "classicalPolytheism", "classical"),
      era("earlyMedieval", "latinCatholic", "european")
    ],
    burialPresets: { latinCatholic: ["medieval_parish", "medieval_parish", "catacomb_paris"] }
  },
  anglo: {
    id: "anglo",
    label: "イングランド",
    folkFaith: "germanicPagan",
    eras: [
      era("classicalAntiquity", "celticPagan", "earthwork"),
      era("earlyMedieval", "latinCatholic", "european"),
      // Dissolution of the monasteries 1536-41
      era("ageOfExploration", "protestant", "european")
    ]
  },
  norse: {
    id: "norse",
    label: "北欧（ノルド）",
    folkFaith: "germanicPagan",
    eras: [
      era("classicalAntiquity", "germanicPagan", "earthwork"),
      // Conversion around 1000; Lutheran Reformation 1527-36
      era("highMedieval", "latinCatholic", "european"),
      era("ageOfExploration", "protestant", "european")
    ]
  },
  finnic: {
    id: "finnic",
    label: "フィン・バルト",
    folkFaith: "balticFinnicPagan",
    eras: [
      era("classicalAntiquity", "balticFinnicPagan", "earthwork"),
      // Northern Crusades complete in the 13th century
      era("lateMedieval", "latinCatholic", "european"),
      era("ageOfExploration", "protestant", "european")
    ]
  },
  magyar: {
    id: "magyar",
    label: "マジャル（ハンガリー）",
    folkFaith: "tengri",
    eras: [
      era("classicalAntiquity", "tengri", "earthwork"),
      // Conversion under Stephen I, 1000
      era("highMedieval", "latinCatholic", "european")
    ]
  },
  ruthenian: {
    id: "ruthenian",
    label: "ルーシ（東スラヴ）",
    folkFaith: "slavicPagan",
    eras: [era("classicalAntiquity", "slavicPagan", "earthwork"), era("earlyMedieval", "orthodox", "european")]
  },
  hellenic: {
    id: "hellenic",
    label: "ギリシャ・ビザンツ",
    folkFaith: "classicalPolytheism",
    eras: [era("classicalAntiquity", "classicalPolytheism", "classical"), era("earlyMedieval", "orthodox", "european")]
  },
  roman: {
    id: "roman",
    label: "ローマ（ラテン）",
    folkFaith: "classicalPolytheism",
    eras: [
      era("classicalAntiquity", "classicalPolytheism", "classical"),
      era("earlyMedieval", "latinCatholic", "european")
    ],
    burialPresets: {
      classicalPolytheism: ["roman_via_appia"],
      latinCatholic: ["medieval_parish", "medieval_parish", "catacomb_paris"]
    }
  },
  insularCeltic: {
    id: "insularCeltic",
    label: "島嶼ケルト（アイルランド・ウェールズ）",
    folkFaith: "celticPagan",
    // Irish Christianity from the 5th century
    eras: [era("classicalAntiquity", "celticPagan", "earthwork"), era("earlyMedieval", "latinCatholic", "european")]
  },
  basque: {
    id: "basque",
    label: "バスク",
    folkFaith: "classicalPolytheism",
    eras: [
      era("classicalAntiquity", "classicalPolytheism", "earthwork"),
      era("earlyMedieval", "latinCatholic", "european")
    ]
  },
  turkic: {
    id: "turkic",
    label: "テュルク・オスマン",
    folkFaith: "tengri",
    eras: [
      era("classicalAntiquity", "tengri", "earthwork"),
      // Karakhanid and Seljuk conversion, 10th-11th centuries
      era("highMedieval", "sunni", "islamic")
    ],
    burialPresets: { sunni: ["ottoman_turbe", "ottoman_turbe", "sunni_wahhabi"] }
  },
  maghrebi: {
    id: "maghrebi",
    label: "マグリブ・ベルベル（ムーア）",
    folkFaith: "westAfrican",
    eras: [era("classicalAntiquity", "classicalPolytheism", "classical"), era("earlyMedieval", "sunni", "islamic")]
  },
  arab: {
    id: "arab",
    label: "アラブ",
    folkFaith: "semiticPolytheism",
    eras: [era("classicalAntiquity", "semiticPolytheism", "classical"), era("earlyMedieval", "sunni", "islamic")]
  },
  persian: {
    id: "persian",
    label: "ペルシア（イラン）",
    folkFaith: "zoroastrian",
    eras: [
      era("classicalAntiquity", "zoroastrian", "islamic"),
      // Majority conversion by the 10th century; Safavid Shia from 1501
      era("highMedieval", "sunni", "islamic"),
      era("ageOfExploration", "shia", "islamic")
    ]
  },
  swahili: {
    id: "swahili",
    label: "スワヒリ沿岸",
    folkFaith: "westAfrican",
    eras: [era("classicalAntiquity", "westAfrican", "earthwork"), era("highMedieval", "sunni", "islamic")]
  },
  levantine: {
    id: "levantine",
    label: "レヴァント（ヘブライ・フェニキア）",
    folkFaith: "semiticPolytheism",
    eras: [era("classicalAntiquity", "judaism", "classical"), era("earlyMedieval", "judaism", "islamic")]
  },
  mesopotamian: {
    id: "mesopotamian",
    label: "メソポタミア",
    folkFaith: "semiticPolytheism",
    eras: [era("classicalAntiquity", "semiticPolytheism", "classical")]
  },
  indic: {
    id: "indic",
    label: "インド（南インド）",
    folkFaith: "hindu",
    eras: [era("classicalAntiquity", "hindu", "islamic")]
  },
  sinitic: {
    id: "sinitic",
    label: "中華",
    folkFaith: "sinitic",
    eras: [era("classicalAntiquity", "sinitic", "sinitic")]
  },
  korean: {
    id: "korean",
    label: "朝鮮",
    folkFaith: "shamanic",
    eras: [
      era("classicalAntiquity", "mahayana", "sinitic"),
      // Joseon neo-Confucian state from 1392
      era("lateMedieval", "neoConfucian", "sinitic")
    ]
  },
  vietnamese: {
    id: "vietnamese",
    label: "ベトナム",
    folkFaith: "sinitic",
    eras: [era("classicalAntiquity", "mahayana", "sinitic")]
  },
  japanese: {
    id: "japanese",
    label: "日本",
    folkFaith: "shintoBuddhist",
    eras: [era("classicalAntiquity", "shintoBuddhist", "japanese")]
  },
  mongol: {
    id: "mongol",
    label: "モンゴル",
    folkFaith: "tengri",
    // Altan Khan's conversion to Tibetan Buddhism, 1578
    eras: [era("classicalAntiquity", "tengri", "earthwork"), era("ageOfExploration", "vajrayana", "earthwork")]
  },
  nahua: {
    id: "nahua",
    label: "メソアメリカ（ナワ）",
    folkFaith: "mesoamerican",
    eras: [era("classicalAntiquity", "mesoamerican", "classical")]
  },
  andean: {
    id: "andean",
    label: "アンデス（ケチュア）",
    folkFaith: "andean",
    eras: [era("classicalAntiquity", "andean", "classical")]
  },
  polynesian: {
    id: "polynesian",
    label: "ポリネシア",
    folkFaith: "polynesian",
    eras: [era("classicalAntiquity", "polynesian", "earthwork")]
  },
  westAfrican: {
    id: "westAfrican",
    label: "西アフリカ（ヨルバ）",
    folkFaith: "westAfrican",
    eras: [era("classicalAntiquity", "westAfrican", "earthwork")]
  },
  arctic: {
    id: "arctic",
    label: "極北（イヌイット）",
    folkFaith: "shamanic",
    eras: [era("classicalAntiquity", "shamanic", "earthwork")]
  },
  // Fantasy folk. Each keeps a historical analogue for its buildings.
  elven: {
    id: "elven",
    label: "エルフ（森の民）",
    folkFaith: "sylvanElven",
    eras: [era("classicalAntiquity", "sylvanElven", "fantastic")]
  },
  darkElven: {
    id: "darkElven",
    label: "ダークエルフ（地底）",
    folkFaith: "chthonic",
    eras: [era("classicalAntiquity", "chthonic", "fantastic")]
  },
  dwarven: {
    id: "dwarven",
    label: "ドワーフ（山の広間）",
    folkFaith: "dwarvenAncestor",
    eras: [era("classicalAntiquity", "dwarvenAncestor", "european")]
  },
  giant: {
    id: "giant",
    label: "巨人（巨石文化）",
    folkFaith: "giantMegalithic",
    eras: [era("classicalAntiquity", "giantMegalithic", "classical")]
  },
  draconic: {
    id: "draconic",
    label: "竜族",
    folkFaith: "draconic",
    eras: [era("classicalAntiquity", "draconic", "sinitic")]
  },
  tribal: {
    id: "tribal",
    label: "部族（オーク・ゴブリン・獣人）",
    folkFaith: "tribalSpirit",
    eras: [era("classicalAntiquity", "tribalSpirit", "earthwork")]
  },
  arachnid: {
    id: "arachnid",
    label: "蜘蛛族（地底）",
    folkFaith: "chthonic",
    eras: [era("classicalAntiquity", "chthonic", "fantastic")]
  },
  serpent: {
    id: "serpent",
    label: "蛇人（神殿都市）",
    folkFaith: "serpentCult",
    eras: [era("classicalAntiquity", "serpentCult", "classical")]
  },
  infernal: {
    id: "infernal",
    label: "魔族",
    folkFaith: "infernal",
    eras: [era("classicalAntiquity", "infernal", "fantastic")]
  }
};

export const DEFAULT_TRADITION_ID = "latinWest";

/** FMG name base index (names-generator.ts order) → tradition. */
export const NAME_BASE_TRADITION: Readonly<Record<number, string>> = {
  0: "latinWest", // German
  1: "anglo", // English
  2: "gallic", // French
  3: "latinMediterranean", // Italian
  4: "latinMediterranean", // Castillian
  5: "ruthenian", // Ruthenian
  6: "norse", // Nordic
  7: "hellenic", // Greek
  8: "roman", // Roman
  9: "finnic", // Finnic
  10: "korean", // Korean
  11: "sinitic", // Chinese
  12: "japanese", // Japanese
  13: "latinMediterranean", // Portuguese
  14: "nahua", // Nahuatl
  15: "magyar", // Hungarian
  16: "turkic", // Turkish
  17: "maghrebi", // Berber
  18: "arab", // Arabic
  19: "arctic", // Inuit
  20: "basque", // Basque
  21: "westAfrican", // Nigerian
  22: "insularCeltic", // Celtic
  23: "mesopotamian", // Mesopotamian
  24: "persian", // Iranian
  25: "polynesian", // Hawaiian
  26: "indic", // Karnataka
  27: "andean", // Quechua
  28: "swahili", // Swahili
  29: "vietnamese", // Vietnamese
  30: "sinitic", // Cantonese
  31: "mongol", // Mongolian
  32: "latinWest", // Human Generic
  33: "elven", // Elven
  34: "darkElven", // Dark Elven
  35: "dwarven", // Dwarven
  36: "tribal", // Goblin
  37: "tribal", // Orc
  38: "giant", // Giant
  39: "draconic", // Draconic
  40: "arachnid", // Arachnid
  41: "serpent", // Serpents
  42: "levantine", // Levantine
  43: "infernal", // Infernal
  44: "tribal" // Beastfolk
};

export function getTradition(id: string | undefined): CivilizationTradition {
  return (id && CIVILIZATION_TRADITIONS[id]) || CIVILIZATION_TRADITIONS[DEFAULT_TRADITION_ID];
}

export function traditionForNameBase(base: number | undefined): CivilizationTradition {
  return getTradition(base === undefined ? undefined : NAME_BASE_TRADITION[base]);
}

export function traditionEra(tradition: CivilizationTradition, period: string | undefined): TraditionEra {
  const at = periodIndex(period);
  let current = tradition.eras[0];
  for (const entry of tradition.eras) if (periodIndex(entry.from) <= at) current = entry;
  return current;
}

/** Religion forms (religions-generator.ts) each faith family can take. */
export const FAITH_FORMS: Record<FaithFamily, readonly string[]> = {
  latinCatholic: ["Monotheism", "Henotheism"],
  protestant: ["Monotheism", "Deism"],
  orthodox: ["Monotheism", "Henotheism"],
  sunni: ["Monotheism"],
  shia: ["Monotheism"],
  judaism: ["Monotheism", "Henotheism"],
  zoroastrian: ["Dualism", "Monotheism"],
  hindu: ["Polytheism", "Henotheism", "Pantheism", "Monotheism"],
  theravada: ["Non-theism", "Philosophical", "Ethical"],
  mahayana: ["Non-theism", "Pantheism", "Syncretism"],
  vajrayana: ["Non-theism", "Pantheism", "Syncretism"],
  shintoBuddhist: ["Syncretism", "Polytheism", "Animism", "Nature Worship"],
  sinitic: ["Syncretism", "Ancestor Worship", "Philosophical", "Polytheism"],
  neoConfucian: ["Philosophical", "Ethical", "Ancestor Worship"],
  classicalPolytheism: ["Polytheism", "Henotheism", "Philosophical"],
  semiticPolytheism: ["Polytheism", "Henotheism"],
  germanicPagan: ["Polytheism", "Nature Worship", "Ancestor Worship"],
  celticPagan: ["Polytheism", "Nature Worship", "Animism"],
  slavicPagan: ["Polytheism", "Nature Worship", "Ancestor Worship"],
  balticFinnicPagan: ["Animism", "Shamanism", "Nature Worship", "Polytheism"],
  tengri: ["Shamanism", "Henotheism", "Ancestor Worship"],
  shamanic: ["Shamanism", "Animism", "Totemism"],
  mesoamerican: ["Polytheism", "Henotheism"],
  andean: ["Polytheism", "Ancestor Worship", "Henotheism"],
  polynesian: ["Polytheism", "Ancestor Worship", "Animism"],
  westAfrican: ["Polytheism", "Ancestor Worship", "Animism"],
  sylvanElven: ["Pantheism", "Nature Worship", "Animism", "Polytheism"],
  chthonic: ["Henotheism", "Polytheism", "Dualism"],
  dwarvenAncestor: ["Ancestor Worship", "Henotheism", "Monotheism"],
  giantMegalithic: ["Ancestor Worship", "Polytheism", "Nature Worship"],
  draconic: ["Henotheism", "Ancestor Worship", "Philosophical"],
  tribalSpirit: ["Shamanism", "Totemism", "Animism", "Ancestor Worship"],
  serpentCult: ["Henotheism", "Polytheism", "Dualism"],
  infernal: ["Dualism", "Henotheism", "Polytheism"]
};

/** Default burial presets per faith (burialCultures.ts ids), with the later preset first in time order. */
const FAITH_BURIAL: Record<FaithFamily, Array<{ from: TraditionPeriod; presets: readonly string[] }>> = {
  latinCatholic: [
    { from: "classicalAntiquity", presets: ["medieval_parish"] },
    // Paris moved its dead to the quarries in 1786; sanitary garden cemeteries from the 1830s-50s
    { from: "preIndustrialEra", presets: ["medieval_parish", "catacomb_paris"] },
    { from: "steamEra", presets: ["victorian_garden"] }
  ],
  protestant: [
    { from: "classicalAntiquity", presets: ["protestant_gottesacker"] },
    { from: "steamEra", presets: ["victorian_garden"] }
  ],
  orthodox: [{ from: "classicalAntiquity", presets: ["orthodox_churchyard"] }],
  sunni: [{ from: "classicalAntiquity", presets: ["sunni_wahhabi", "ottoman_turbe"] }],
  shia: [{ from: "classicalAntiquity", presets: ["wadi_us_salaam"] }],
  judaism: [{ from: "classicalAntiquity", presets: ["jewish_orthodox", "prague_ghetto"] }],
  zoroastrian: [{ from: "classicalAntiquity", presets: ["zoroastrian_tower"] }],
  hindu: [{ from: "classicalAntiquity", presets: ["varanasi_ghat", "hindu_shmashana"] }],
  theravada: [{ from: "classicalAntiquity", presets: ["thai_chedi_wat"] }],
  mahayana: [{ from: "classicalAntiquity", presets: ["fengshui_mountain"] }],
  vajrayana: [{ from: "classicalAntiquity", presets: ["tibetan_jhator"] }],
  shintoBuddhist: [{ from: "classicalAntiquity", presets: ["edo_temple_town"] }],
  sinitic: [{ from: "classicalAntiquity", presets: ["fengshui_mountain"] }],
  neoConfucian: [{ from: "classicalAntiquity", presets: ["fengshui_mountain"] }],
  classicalPolytheism: [{ from: "classicalAntiquity", presets: ["roman_via_appia"] }],
  semiticPolytheism: [{ from: "classicalAntiquity", presets: ["mesopotamian_household"] }],
  germanicPagan: [{ from: "classicalAntiquity", presets: ["norse_ship_barrow", "pagan_barrow"] }],
  celticPagan: [{ from: "classicalAntiquity", presets: ["pagan_barrow"] }],
  slavicPagan: [{ from: "classicalAntiquity", presets: ["pagan_barrow"] }],
  balticFinnicPagan: [{ from: "classicalAntiquity", presets: ["pagan_barrow"] }],
  tengri: [{ from: "classicalAntiquity", presets: ["steppe_kurgan"] }],
  shamanic: [{ from: "classicalAntiquity", presets: ["arctic_cairn"] }],
  mesoamerican: [{ from: "classicalAntiquity", presets: ["mesoamerican_temple"] }],
  andean: [{ from: "classicalAntiquity", presets: ["andean_chullpa"] }],
  polynesian: [{ from: "classicalAntiquity", presets: ["polynesian_sea"] }],
  westAfrican: [{ from: "classicalAntiquity", presets: ["african_compound"] }],
  sylvanElven: [{ from: "classicalAntiquity", presets: ["elven_grove"] }],
  chthonic: [{ from: "classicalAntiquity", presets: ["catacomb_paris"] }],
  dwarvenAncestor: [{ from: "classicalAntiquity", presets: ["dwarven_hall"] }],
  giantMegalithic: [{ from: "classicalAntiquity", presets: ["megalithic_dolmen"] }],
  draconic: [{ from: "classicalAntiquity", presets: ["fengshui_mountain"] }],
  tribalSpirit: [{ from: "classicalAntiquity", presets: ["steppe_kurgan", "pagan_barrow"] }],
  serpentCult: [{ from: "classicalAntiquity", presets: ["mesoamerican_temple"] }],
  infernal: [{ from: "classicalAntiquity", presets: ["hindu_shmashana", "catacomb_paris"] }]
};

/** Fantasy faiths may also roll a procedurally synthesized burial culture. */
export const SYNTHESIS_FAITHS: ReadonlySet<FaithFamily> = new Set([
  "sylvanElven",
  "chthonic",
  "dwarvenAncestor",
  "giantMegalithic",
  "draconic",
  "tribalSpirit",
  "serpentCult",
  "infernal"
]);

/** Burial presets a faith uses in a period, with the tradition's own preference first. */
export function burialPresetsFor(
  faith: FaithFamily,
  period: string | undefined,
  tradition?: CivilizationTradition
): readonly string[] {
  const at = periodIndex(period);
  let presets = FAITH_BURIAL[faith][0].presets;
  for (const entry of FAITH_BURIAL[faith]) if (periodIndex(entry.from) <= at) presets = entry.presets;
  const own = tradition?.burialPresets?.[faith];
  // A tradition override never brings a medieval preset back into a later burial reform.
  return own && presets === FAITH_BURIAL[faith][0].presets ? own : presets;
}

/** Monasteries and convents that existed for a faith in a period (CE aerial landmarks). */
export function religiousHousesFor(faith: FaithFamily, period: string | undefined): ReligiousHouse[] {
  const at = periodIndex(period);
  if (faith === "latinCatholic") {
    if (at < periodIndex("earlyMedieval")) return [];
    // Franciscans 1209, Dominicans 1216
    return at >= periodIndex("highMedieval") ? ["abbey", "friary"] : ["abbey"];
  }
  if (faith === "orthodox") return at >= periodIndex("earlyMedieval") ? ["orthodoxMonastery"] : [];
  return [];
}

/** Who built and who worships in the burg (docs/plan/culture-civilization-overhaul.md). */
export interface BurgCivilization {
  /** civilizationTraditions.ts id of the burg's culture. */
  tradition: string;
  /** Period the tradition was resolved for (the Antique culture set is classical). */
  period: string;
  /** Faith of the burg's local religion; drives monasteries and the burial ground. */
  faith: FaithFamily;
  /** Faith of the culture's own church; differs from `faith` in a conquered or converted town. */
  cultureFaith: FaithFamily;
  /** Fortification lineage of the culture; drives the castle style. */
  fortification: FortificationFamily;
  culture: { id: number; name: string; nameBase: number };
  religion?: { id: number; name: string; type: string; form: string };
}

const FORTIFICATION_FAMILIES: readonly FortificationFamily[] = [
  "european",
  "islamic",
  "japanese",
  "sinitic",
  "classical",
  "earthwork",
  "fantastic"
];

export function isFaithFamily(value: unknown): value is FaithFamily {
  return typeof value === "string" && (FAITH_FAMILIES as readonly string[]).includes(value);
}

/** Shape check for the civilization block of the FMG → CE descriptor and saved CE documents. */
export function isCivilizationContext(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  const culture = c.culture as Record<string, unknown> | undefined;
  return (
    typeof c.tradition === "string" &&
    typeof c.period === "string" &&
    isFaithFamily(c.faith) &&
    isFaithFamily(c.cultureFaith) &&
    FORTIFICATION_FAMILIES.includes(c.fortification as FortificationFamily) &&
    !!culture &&
    typeof culture.name === "string" &&
    typeof culture.id === "number" &&
    typeof culture.nameBase === "number"
  );
}
