/**
 * Comprehensive burial cultures and cemetery urban planning taxonomy & preset catalog.
 *
 * Designed according to docs/plan/cultures/:
 * 00_OVERVIEW_AND_TAXONOMY.md ~ 05_PROCEDURAL_SYNTHESIS_AND_CE_SPEC.md.
 */
import type { FuneralRite } from "./funeralRites";

/** 1. Siting & Urban Zoning */
export const CEMETERY_ZONINGS = [
  "extramural_highway", // Highway roadside necropolis outside gates (Roman Via Appia, Greek Kerameikos)
  "intramural_core", // Co-located with city center / cathedral / parish church (Medieval Catholic)
  "extramural_sanitary", // Distant suburban sanitarium cemetery downwind/downstream (Modern garden, Sunni)
  "topographic_hill", // Foothill, ridge, or feng shui slope overlooking city (East Asian, Jerusalem)
  "riverfront_ghat", // Riverfront steps / burning ghats (Hindu Varanasi)
  "isolated_highland", // Barren mountain summit / ridge isolated from settlements (Zoroastrian, Tibetan)
  "subterranean_network", // Underground catacomb network / quarry tunnels (Rome, Paris)
  "household_intramural" // Sub-floor of courtyard / inside domestic dwellings (Mesopotamian, Maya)
] as const;
export type CemeteryZoning = (typeof CEMETERY_ZONINGS)[number];

/** 2. Precinct Boundary & Enclosure */
export const CEMETERY_BOUNDARIES = [
  "high_stone_wall", // High masonry walls with wrought-iron gate
  "low_curb_or_hedge", // Low curb, railing, or hedge (visually open green space)
  "open_desert_field", // No formal walls (desert sand, steppe expanse)
  "ditch_and_rampart", // Earthen ditch, rampart, or moat (Celtic, prehistoric)
  "stepped_water_terrace", // Masonry stone steps open directly to river water
  "monumental_gate_pylon" // Symbolic boundary markers, Torii, Paifang, or pylons
] as const;
export type CemeteryBoundary = (typeof CEMETERY_BOUNDARIES)[number];

/** 3. Central Monument & Ritual Architecture */
export const CENTRAL_SANCTUARIES = [
  "chapel_basilica", // Chapel / parish basilica
  "mausoleum_dome", // Domed monumental mausoleum (Roman rotunda, Islamic Turbe/Qubba)
  "preaching_cross_calvary", // High stone preaching cross / Calvary
  "stupa_chorten", // Relic stupa / Tibetan chorten
  "cremation_pyre_platform", // Elevated stone burning pyre terrace / crematorium
  "tower_of_silence", // Roofless circular stone tower (Dakhma)
  "ossuary_charnel_house", // Charnel house / decorative bone storage
  "ancestral_hall", // Ancestral lineage hall / tablet shrine
  "none_flat_memorial" // Completely flat, egalitarian (Sunni Wahhabi, Quaker, nomadic)
] as const;
export type CentralSanctuary = (typeof CENTRAL_SANCTUARIES)[number];

/** 4. Corpse Fate & Material Processing */
export const CORPSE_TREATMENTS = [
  "inhumation_coffined", // Inhumation with wooden/stone coffin
  "inhumation_shrouded", // Direct earth burial in linen shroud (Qibla oriented, no coffin)
  "cremation_ritual", // Ritual burning on pyre or furnace
  "mummification_embalmed", // Embalmed preservation (Egyptian, Incan fardo)
  "excarnation_sky", // Exposure to carrion raptors / solar excarnation (Jhator, Dakhma)
  "submersion_water", // Consignment to holy rivers or the sea
  "exposure_surface" // Scaffold / tree exposure
] as const;
export type CorpseTreatment = (typeof CORPSE_TREATMENTS)[number];

/** 5. Monuments & Plot Layout */
export const MONUMENT_LAYOUTS = [
  "headstone_grid", // Orderly orthogonal rows of rectangular headstones
  "crowded_jumble", // Dense, overlapping, tilted headstones (Jewish ghetto, crowded churchyard)
  "linear_avenue_monuments", // Flanking grand paved avenue (Roman sarcophagi, Pere Lachaise)
  "stepped_tumuli_mounds", // Earthen round/conical barrows or kurgans
  "columbarium_walls", // Recessed niches along walls for cremation urns
  "cairns_and_steles", // Stone cairns, Mani stones, Gorinto, or runestones
  "flat_ground_markers", // Flush ground bronze or stone plates (lawn cemeteries)
  "terrace_horseshoe" // U-shaped or armchair terraces along contours (Omega/turtleback graves)
] as const;
export type MonumentLayout = (typeof MONUMENT_LAYOUTS)[number];

/** 6. Landscape & Funerary Flora */
export const FUNERARY_FLORAS = [
  "mediterranean_cypress", // Slender evergreen Mediterranean cypress (Cupressus sempervirens)
  "sacred_yew", // Ancient spreading English yew (Taxus baccata)
  "oriental_evergreen", // Pine, arborvitae, cypress (Pinus, Platycladus)
  "sacred_bodhi_and_fig", // Sacred fig / Banyan tree (Ficus religiosa)
  "peaceful_willow", // Weeping willow (Salix babylonica)
  "barren_gravel", // Barren gravel, bare rock, or desert sand (no trees)
  "garden_parkland" // Pastoral lawn parkland with deciduous oak, linden, and roses
] as const;
export type FuneraryFlora = (typeof FUNERARY_FLORAS)[number];

/** 7. Ritual & Ancillary Facilities */
export const RITUAL_FACILITIES = [
  "caretaker_cottage", // Lodge / cottage for gravedigger / caretaker
  "ablution_fountain", // Ritual wash fountain / well for corpse washing / purification
  "cremation_woodyard", // Timber yard storing dry firewood / fragrant wood
  "mourning_cloister", // Covered arcaded cloister for procession & meditation
  "bone_cleaning_table", // Stone slab for ritual bone washing / defleshing
  "incense_candle_stand", // Bronze incense burner or candle stands
  "skull_shelf" // Shelves / tzompantli display for ancestral skulls
] as const;
export type RitualFacility = (typeof RITUAL_FACILITIES)[number];

export interface BurialCultureMechanics {
  /** Corpses remaining raisable (0.0 = destroyed/incinerated, 1.0 = fully intact) */
  remainFraction: number;
  /** Share of raised remains that are flesh/zombie vs skeleton (0.0 = bones only, 1.0 = preserved flesh) */
  zombieRatio: number;
  /** Consumption per capita per death */
  resourceCostPerCapita: {
    wood?: number;
    stone?: number;
    linen?: number;
    incense?: number;
  };
  /** Public health risk in urban center (0.0 = safe/sterile, 1.0 = disease/stench vector) */
  sanitationRisk: number;
  /** Pilgrimage & tourist draw (0.0 = local only, 1.0 = world-renowned sacred necropolis) */
  pilgrimageAppeal: number;
}

/**
 * Complete profile defining a culture's burial and necropolis urbanism.
 */
export interface BurialCultureProfile {
  id: string;
  name: string;
  description: string;

  /** The 7 orthogonal axes */
  zoning: CemeteryZoning;
  boundary: CemeteryBoundary;
  sanctuary: CentralSanctuary;
  bodyFate: CorpseTreatment;
  monuments: MonumentLayout;
  vegetation: FuneraryFlora;
  ritualFacilities: RitualFacility[];

  mechanics: BurialCultureMechanics;
}

/**
 * 16 Historic Archetype Presets modeled after major world traditions.
 */
export const BURIAL_CULTURE_PRESETS: Record<string, BurialCultureProfile> = {
  roman_via_appia: {
    id: "roman_via_appia",
    name: "Roman Via Appia (Roadside Necropolis)",
    description:
      "Extramural linear roadside necropolis lined with rotunda tombs, columbarium walls, and cypress trees.",
    zoning: "extramural_highway",
    boundary: "high_stone_wall",
    sanctuary: "mausoleum_dome",
    bodyFate: "inhumation_coffined",
    monuments: "linear_avenue_monuments",
    vegetation: "mediterranean_cypress",
    ritualFacilities: ["caretaker_cottage", "mourning_cloister"],
    mechanics: {
      remainFraction: 0.8,
      zombieRatio: 0.35,
      resourceCostPerCapita: { stone: 0.04, wood: 0.02 },
      sanitationRisk: 0.15,
      pilgrimageAppeal: 0.4
    }
  },
  medieval_parish: {
    id: "medieval_parish",
    name: "Medieval Catholic Parish Churchyard",
    description:
      "Intramural consecrated churchyard surrounding parish church, charnel house, preaching cross, and yews.",
    zoning: "intramural_core",
    boundary: "high_stone_wall",
    sanctuary: "chapel_basilica",
    bodyFate: "inhumation_coffined",
    monuments: "headstone_grid",
    vegetation: "sacred_yew",
    ritualFacilities: ["mourning_cloister", "caretaker_cottage"],
    mechanics: {
      remainFraction: 0.8,
      zombieRatio: 0.4,
      resourceCostPerCapita: { wood: 0.03, stone: 0.01 },
      sanitationRisk: 0.65,
      pilgrimageAppeal: 0.25
    }
  },
  victorian_garden: {
    id: "victorian_garden",
    name: "Victorian Garden Landscape Cemetery",
    description:
      "Extramural pastoral parkland cemetery with gothic chapel, serpentine avenues, and grand family monuments.",
    zoning: "extramural_sanitary",
    boundary: "low_curb_or_hedge",
    sanctuary: "chapel_basilica",
    bodyFate: "inhumation_coffined",
    monuments: "linear_avenue_monuments",
    vegetation: "garden_parkland",
    ritualFacilities: ["caretaker_cottage", "mourning_cloister"],
    mechanics: {
      remainFraction: 0.8,
      zombieRatio: 0.4,
      resourceCostPerCapita: { wood: 0.02, stone: 0.03 },
      sanitationRisk: 0.1,
      pilgrimageAppeal: 0.3
    }
  },
  prague_ghetto: {
    id: "prague_ghetto",
    name: "Medieval Jewish Ghetto Cemetery",
    description:
      "Hyper-dense multi-layered precinct inside the ghetto, with tilted overlapping matzevah tombstones and stones.",
    zoning: "intramural_core",
    boundary: "high_stone_wall",
    sanctuary: "ossuary_charnel_house",
    bodyFate: "inhumation_shrouded",
    monuments: "crowded_jumble",
    vegetation: "barren_gravel",
    ritualFacilities: ["ablution_fountain", "caretaker_cottage"],
    mechanics: {
      remainFraction: 0.75,
      zombieRatio: 0.3,
      resourceCostPerCapita: { linen: 0.02, stone: 0.02 },
      sanitationRisk: 0.55,
      pilgrimageAppeal: 0.4
    }
  },
  jewish_orthodox: {
    id: "jewish_orthodox",
    name: "Jewish Orthodox Municipal Cemetery",
    description:
      "Egalitarian extramural sanctuary with simple rectangular stone blocks, gender-segregated plots, and direct burial.",
    zoning: "extramural_sanitary",
    boundary: "high_stone_wall",
    sanctuary: "none_flat_memorial",
    bodyFate: "inhumation_shrouded",
    monuments: "headstone_grid",
    vegetation: "barren_gravel",
    ritualFacilities: ["ablution_fountain", "caretaker_cottage"],
    mechanics: {
      remainFraction: 0.75,
      zombieRatio: 0.3,
      resourceCostPerCapita: { linen: 0.02, stone: 0.02 },
      sanitationRisk: 0.1,
      pilgrimageAppeal: 0.2
    }
  },
  ottoman_turbe: {
    id: "ottoman_turbe",
    name: "Ottoman Turbe & Cypress Garden",
    description:
      "Extramural roadside gardens with domed turbes, carved marble turban steles, and fragrant cypress groves.",
    zoning: "extramural_highway",
    boundary: "high_stone_wall",
    sanctuary: "mausoleum_dome",
    bodyFate: "inhumation_shrouded",
    monuments: "headstone_grid",
    vegetation: "mediterranean_cypress",
    ritualFacilities: ["ablution_fountain", "caretaker_cottage"],
    mechanics: {
      remainFraction: 0.75,
      zombieRatio: 0.3,
      resourceCostPerCapita: { stone: 0.03, linen: 0.02 },
      sanitationRisk: 0.15,
      pilgrimageAppeal: 0.5
    }
  },
  wadi_us_salaam: {
    id: "wadi_us_salaam",
    name: "Shia Sacred Shrine Necropolis (Valley of Peace)",
    description:
      "Expansive desert necropolis extending to the horizon around sacred shrine, with millions of baked brick tombs.",
    zoning: "extramural_sanitary",
    boundary: "open_desert_field",
    sanctuary: "mausoleum_dome",
    bodyFate: "inhumation_shrouded",
    monuments: "crowded_jumble",
    vegetation: "barren_gravel",
    ritualFacilities: ["ablution_fountain", "incense_candle_stand"],
    mechanics: {
      remainFraction: 0.75,
      zombieRatio: 0.3,
      resourceCostPerCapita: { stone: 0.02, linen: 0.02 },
      sanitationRisk: 0.2,
      pilgrimageAppeal: 0.95
    }
  },
  sunni_wahhabi: {
    id: "sunni_wahhabi",
    name: "Sunni Strict Egalitarian Cemetery",
    description: "Flat, austere gravel field with unadorned natural marker stones, strict ban on domes or monuments.",
    zoning: "extramural_sanitary",
    boundary: "high_stone_wall",
    sanctuary: "none_flat_memorial",
    bodyFate: "inhumation_shrouded",
    monuments: "flat_ground_markers",
    vegetation: "barren_gravel",
    ritualFacilities: ["ablution_fountain"],
    mechanics: {
      remainFraction: 0.75,
      zombieRatio: 0.3,
      resourceCostPerCapita: { linen: 0.02 },
      sanitationRisk: 0.1,
      pilgrimageAppeal: 0.05
    }
  },
  varanasi_ghat: {
    id: "varanasi_ghat",
    name: "Hindu Sacred River Cremation Ghats",
    description:
      "Stepped riverfront stone terraces directly meeting holy river, burning pyres, stacked wood, and ash immersion.",
    zoning: "riverfront_ghat",
    boundary: "stepped_water_terrace",
    sanctuary: "cremation_pyre_platform",
    bodyFate: "cremation_ritual",
    monuments: "flat_ground_markers",
    vegetation: "barren_gravel",
    ritualFacilities: ["cremation_woodyard", "incense_candle_stand", "ablution_fountain"],
    mechanics: {
      remainFraction: 0.0,
      zombieRatio: 0.0,
      resourceCostPerCapita: { wood: 0.15, incense: 0.01 },
      sanitationRisk: 0.35,
      pilgrimageAppeal: 0.9
    }
  },
  thai_chedi_wat: {
    id: "thai_chedi_wat",
    name: "Southeast Asian Theravada Temple (Wat & Chedi)",
    description:
      "Intramural temple precinct with golden cremation furnace tower, surrounding white spired chedis for urns.",
    zoning: "intramural_core",
    boundary: "high_stone_wall",
    sanctuary: "cremation_pyre_platform",
    bodyFate: "cremation_ritual",
    monuments: "cairns_and_steles",
    vegetation: "garden_parkland",
    ritualFacilities: ["cremation_woodyard", "incense_candle_stand"],
    mechanics: {
      remainFraction: 0.0,
      zombieRatio: 0.0,
      resourceCostPerCapita: { wood: 0.1, stone: 0.02 },
      sanitationRisk: 0.2,
      pilgrimageAppeal: 0.6
    }
  },
  tibetan_jhator: {
    id: "tibetan_jhator",
    name: "Tibetan Sky Burial (Jhator)",
    description:
      "Isolated rocky highland ridge with open charnel rock platform, chorten stupas, and prayer flags for raptors.",
    zoning: "isolated_highland",
    boundary: "open_desert_field",
    sanctuary: "stupa_chorten",
    bodyFate: "excarnation_sky",
    monuments: "cairns_and_steles",
    vegetation: "barren_gravel",
    ritualFacilities: ["bone_cleaning_table", "incense_candle_stand"],
    mechanics: {
      remainFraction: 0.12,
      zombieRatio: 0.0,
      resourceCostPerCapita: { linen: 0.005, incense: 0.005 },
      sanitationRisk: 0.1,
      pilgrimageAppeal: 0.5
    }
  },
  edo_temple_town: {
    id: "edo_temple_town",
    name: "Edo Period Temple Town & Danka Cemetery",
    description:
      "Temple precinct with main hall, square headstones, wooden sotoba stoups, stone water basins, and pine trees.",
    zoning: "intramural_core",
    boundary: "high_stone_wall",
    sanctuary: "chapel_basilica",
    bodyFate: "cremation_ritual",
    monuments: "headstone_grid",
    vegetation: "oriental_evergreen",
    ritualFacilities: ["ablution_fountain", "incense_candle_stand"],
    mechanics: {
      remainFraction: 0.05,
      zombieRatio: 0.0,
      resourceCostPerCapita: { wood: 0.08, stone: 0.03 },
      sanitationRisk: 0.15,
      pilgrimageAppeal: 0.3
    }
  },
  fengshui_mountain: {
    id: "fengshui_mountain",
    name: "East Asian Feng Shui Mountain Necropolis",
    description:
      "Foothill slopes backing against mountains facing rivers, U-shaped omega/armchair retaining walls, and ancestral hall.",
    zoning: "topographic_hill",
    boundary: "monumental_gate_pylon",
    sanctuary: "ancestral_hall",
    bodyFate: "inhumation_coffined",
    monuments: "terrace_horseshoe",
    vegetation: "oriental_evergreen",
    ritualFacilities: ["caretaker_cottage", "incense_candle_stand"],
    mechanics: {
      remainFraction: 0.8,
      zombieRatio: 0.4,
      resourceCostPerCapita: { wood: 0.04, stone: 0.03 },
      sanitationRisk: 0.1,
      pilgrimageAppeal: 0.4
    }
  },
  zoroastrian_tower: {
    id: "zoroastrian_tower",
    name: "Zoroastrian Tower of Silence (Dakhma)",
    description:
      "Remote barren mountaintop with circular stone roofless tower, concentric corpse slabs, and central ossuary pit.",
    zoning: "isolated_highland",
    boundary: "high_stone_wall",
    sanctuary: "tower_of_silence",
    bodyFate: "excarnation_sky",
    monuments: "flat_ground_markers",
    vegetation: "barren_gravel",
    ritualFacilities: ["bone_cleaning_table", "caretaker_cottage"],
    mechanics: {
      remainFraction: 0.1,
      zombieRatio: 0.0,
      resourceCostPerCapita: { stone: 0.02 },
      sanitationRisk: 0.05,
      pilgrimageAppeal: 0.35
    }
  },
  steppe_kurgan: {
    id: "steppe_kurgan",
    name: "Steppe Nomad Kurgan Mound Complex",
    description:
      "High elevation ridges and river terraces studded with conical burial mounds (kurgans), stone steles, and horse pits.",
    zoning: "topographic_hill",
    boundary: "ditch_and_rampart",
    sanctuary: "none_flat_memorial",
    bodyFate: "inhumation_coffined",
    monuments: "stepped_tumuli_mounds",
    vegetation: "garden_parkland",
    ritualFacilities: ["caretaker_cottage"],
    mechanics: {
      remainFraction: 0.85,
      zombieRatio: 0.5,
      resourceCostPerCapita: { wood: 0.03, stone: 0.02 },
      sanitationRisk: 0.05,
      pilgrimageAppeal: 0.2
    }
  },
  catacomb_paris: {
    id: "catacomb_paris",
    name: "Parisian Subterranean Ossuary (Catacomb Labyrinth)",
    description:
      "Subterranean quarry tunnels deep under city, lined with architectural bone-and-skull walls and memorial steles.",
    zoning: "subterranean_network",
    boundary: "high_stone_wall",
    sanctuary: "ossuary_charnel_house",
    bodyFate: "inhumation_coffined",
    monuments: "columbarium_walls",
    vegetation: "barren_gravel",
    ritualFacilities: ["mourning_cloister", "bone_cleaning_table"],
    mechanics: {
      remainFraction: 0.6,
      zombieRatio: 0.1,
      resourceCostPerCapita: { stone: 0.02 },
      sanitationRisk: 0.05,
      pilgrimageAppeal: 0.75
    }
  }
};

export const DEFAULT_BURIAL_CULTURE_PRESET_ID = "medieval_parish";

/**
 * Returns a clone of the specified preset, or medieval_parish if unknown.
 */
export function getBurialCulturePreset(presetId: string | undefined): BurialCultureProfile {
  if (presetId && Object.hasOwn(BURIAL_CULTURE_PRESETS, presetId)) {
    return JSON.parse(JSON.stringify(BURIAL_CULTURE_PRESETS[presetId]));
  }
  return JSON.parse(JSON.stringify(BURIAL_CULTURE_PRESETS[DEFAULT_BURIAL_CULTURE_PRESET_ID]));
}

export function isBurialCulturePresetId(id: string): boolean {
  return Object.hasOwn(BURIAL_CULTURE_PRESETS, id);
}

/**
 * Maps high-level CorpseTreatment to legacy FMG FuneralRite for backwards compatibility.
 */
export function corpseTreatmentToFuneralRite(treatment: CorpseTreatment): FuneralRite {
  switch (treatment) {
    case "cremation_ritual":
      return "cremation";
    case "excarnation_sky":
      return "skyBurial";
    case "submersion_water":
      return "waterBurial";
    case "mummification_embalmed":
      return "mummification";
    case "exposure_surface":
      return "exposure";
    case "inhumation_coffined":
    case "inhumation_shrouded":
    default:
      return "inhumation";
  }
}

/**
 * Maps legacy FMG FuneralRite to default CorpseTreatment.
 */
export function funeralRiteToDefaultCorpseTreatment(rite: FuneralRite): CorpseTreatment {
  switch (rite) {
    case "cremation":
      return "cremation_ritual";
    case "skyBurial":
      return "excarnation_sky";
    case "waterBurial":
      return "submersion_water";
    case "mummification":
      return "mummification_embalmed";
    case "exposure":
      return "exposure_surface";
    case "inhumation":
    default:
      return "inhumation_coffined";
  }
}

/** Shared validation for saved cultures and the FMG → CE handoff. */
export function isBurialCultureProfile(value: unknown): value is BurialCultureProfile {
  if (!value || typeof value !== "object") return false;
  const p = value as BurialCultureProfile;
  const unit = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;
  return (
    typeof p.id === "string" &&
    typeof p.name === "string" &&
    typeof p.description === "string" &&
    CEMETERY_ZONINGS.includes(p.zoning) &&
    CEMETERY_BOUNDARIES.includes(p.boundary) &&
    CENTRAL_SANCTUARIES.includes(p.sanctuary) &&
    CORPSE_TREATMENTS.includes(p.bodyFate) &&
    MONUMENT_LAYOUTS.includes(p.monuments) &&
    FUNERARY_FLORAS.includes(p.vegetation) &&
    Array.isArray(p.ritualFacilities) &&
    p.ritualFacilities.every(f => RITUAL_FACILITIES.includes(f)) &&
    !!p.mechanics &&
    unit(p.mechanics.remainFraction) &&
    unit(p.mechanics.zombieRatio) &&
    unit(p.mechanics.sanitationRisk) &&
    unit(p.mechanics.pilgrimageAppeal) &&
    !!p.mechanics.resourceCostPerCapita &&
    typeof p.mechanics.resourceCostPerCapita === "object" &&
    Object.entries(p.mechanics.resourceCostPerCapita).every(
      ([k, v]) =>
        ["wood", "stone", "linen", "incense"].includes(k) && typeof v === "number" && Number.isFinite(v) && v >= 0
    )
  );
}
