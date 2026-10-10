/**
 * Procedural Synthesis engine for Burial Cultures (Mix & Match generation).
 *
 * Implements the procedural pipeline and constraints matrix specified in
 * docs/plan/cultures/05_PROCEDURAL_SYNTHESIS_AND_CE_SPEC.md.
 */
import type {
  BurialCultureProfile,
  CemeteryBoundary,
  CemeteryZoning,
  CentralSanctuary,
  CorpseTreatment,
  FuneraryFlora,
  MonumentLayout,
  RitualFacility
} from "../data/burialCultures";
import { corpseTreatmentToFuneralRite } from "../data/burialCultures";
import { FUNERAL_RITE_RACE_WEIGHT_MULTIPLIERS } from "../data/funeralRites";
import type { CultureType, RaceKey } from "../types/models";

export interface SynthesisGeographyOptions {
  hasRiver?: boolean;
  hasElevation?: boolean;
  isCoastal?: boolean;
  biome?: string; // e.g. "desert", "tundra", "forest", "grassland", "taiga", "rainforest"
  cultureType?: CultureType;
  raceKey?: RaceKey | string;
}

function sampleWeighted<T extends string>(weights: Record<T, number>, rng: () => number): T {
  let total = 0;
  for (const k of Object.keys(weights) as T[]) {
    total += Math.max(0, weights[k]);
  }
  if (total <= 0) return Object.keys(weights)[0] as T;

  let pick = rng() * total;
  for (const k of Object.keys(weights) as T[]) {
    const w = Math.max(0, weights[k]);
    if (w <= 0) continue;
    pick -= w;
    if (pick <= 0) return k;
  }
  return Object.keys(weights)[0] as T;
}

/**
 * Procedurally generates a coherent, balanced BurialCultureProfile based on geographic
 * and cultural conditions.
 */
export function synthesizeBurialCulture(
  options: SynthesisGeographyOptions = {},
  rng: () => number = Math.random
): BurialCultureProfile {
  const {
    hasRiver = true,
    hasElevation = true,
    isCoastal = false,
    biome = "temperate",
    cultureType = "Generic"
  } = options;

  // 1. Siting & Urban Zoning
  const zoningWeights: Record<CemeteryZoning, number> = {
    extramural_highway: 30,
    intramural_core: 25,
    extramural_sanitary: 20,
    topographic_hill: hasElevation ? 25 : 5,
    riverfront_ghat: hasRiver ? 25 : 0,
    isolated_highland: hasElevation ? 20 : 2,
    subterranean_network: 10,
    household_intramural: 5
  };

  if (cultureType === "Nomadic") {
    zoningWeights.topographic_hill += 30;
    zoningWeights.extramural_sanitary += 20;
    zoningWeights.intramural_core = 0;
    zoningWeights.household_intramural = 0;
  } else if (cultureType === "Highland") {
    zoningWeights.isolated_highland += 40;
    zoningWeights.topographic_hill += 30;
  } else if (cultureType === "River" && hasRiver) {
    zoningWeights.riverfront_ghat += 50;
  } else if (cultureType === "Naval" && isCoastal) {
    zoningWeights.riverfront_ghat += 20;
    zoningWeights.extramural_highway += 20;
  }

  const zoning = sampleWeighted(zoningWeights, rng);

  // 2. Corpse Treatment
  const bodyFateWeights: Record<CorpseTreatment, number> = {
    inhumation_coffined: 40,
    inhumation_shrouded: 25,
    cremation_ritual: 25,
    mummification_embalmed: 8,
    excarnation_sky: 5,
    submersion_water: hasRiver || isCoastal ? 10 : 0,
    exposure_surface: 8
  };

  if (biome.includes("desert") || cultureType === "Desert") {
    bodyFateWeights.mummification_embalmed += 35;
    bodyFateWeights.inhumation_shrouded += 25;
    bodyFateWeights.cremation_ritual = Math.max(2, bodyFateWeights.cremation_ritual - 15); // fuel scarcity
  } else if (cultureType === "Highland" || zoning === "isolated_highland") {
    bodyFateWeights.excarnation_sky += 45;
  } else if (cultureType === "Naval" || cultureType === "River" || zoning === "riverfront_ghat") {
    bodyFateWeights.submersion_water += 25;
    bodyFateWeights.cremation_ritual += 20;
  } else if (cultureType === "Nomadic" || cultureType === "Hunting") {
    bodyFateWeights.exposure_surface += 25;
    bodyFateWeights.inhumation_coffined += 15;
  }

  if (!hasRiver && !isCoastal) bodyFateWeights.submersion_water = 0;
  const raceWeights = options.raceKey ? FUNERAL_RITE_RACE_WEIGHT_MULTIPLIERS[options.raceKey] : undefined;
  for (const fate of Object.keys(bodyFateWeights) as CorpseTreatment[]) {
    bodyFateWeights[fate] *= raceWeights?.[corpseTreatmentToFuneralRite(fate)] ?? 1;
  }
  const bodyFate = sampleWeighted(bodyFateWeights, rng);

  // 3. Central Sanctuary (constrained by bodyFate and zoning)
  const sanctuaryWeights: Record<CentralSanctuary, number> = {
    chapel_basilica: 25,
    mausoleum_dome: 20,
    preaching_cross_calvary: 15,
    stupa_chorten: 10,
    cremation_pyre_platform: 10,
    tower_of_silence: 5,
    ossuary_charnel_house: 10,
    ancestral_hall: 10,
    none_flat_memorial: 15
  };

  if (bodyFate === "cremation_ritual") {
    sanctuaryWeights.cremation_pyre_platform += 50;
    sanctuaryWeights.stupa_chorten += 25;
    sanctuaryWeights.ossuary_charnel_house += 15;
  } else if (bodyFate === "excarnation_sky") {
    sanctuaryWeights.tower_of_silence += 50;
    sanctuaryWeights.stupa_chorten += 25;
    sanctuaryWeights.none_flat_memorial += 20;
    sanctuaryWeights.chapel_basilica = 0;
  } else if (bodyFate === "mummification_embalmed") {
    sanctuaryWeights.mausoleum_dome += 40;
    sanctuaryWeights.ancestral_hall += 25;
  }

  if (zoning === "subterranean_network") {
    sanctuaryWeights.ossuary_charnel_house += 45;
    sanctuaryWeights.chapel_basilica += 20;
  }

  const sanctuary = sampleWeighted(sanctuaryWeights, rng);

  // 4. Monuments & Plot Layout
  const monumentWeights: Record<MonumentLayout, number> = {
    headstone_grid: 35,
    crowded_jumble: 15,
    linear_avenue_monuments: 15,
    stepped_tumuli_mounds: 10,
    columbarium_walls: 10,
    cairns_and_steles: 12,
    flat_ground_markers: 12,
    terrace_horseshoe: 8
  };

  if (zoning === "extramural_highway") {
    monumentWeights.linear_avenue_monuments += 35;
    monumentWeights.columbarium_walls += 20;
  } else if (zoning === "topographic_hill") {
    monumentWeights.terrace_horseshoe += 30;
    monumentWeights.stepped_tumuli_mounds += 25;
  } else if (zoning === "subterranean_network") {
    monumentWeights.columbarium_walls += 50;
  } else if (zoning === "intramural_core") {
    monumentWeights.crowded_jumble += 25;
    monumentWeights.headstone_grid += 20;
  }

  if (bodyFate === "cremation_ritual") {
    monumentWeights.columbarium_walls += 25;
    monumentWeights.cairns_and_steles += 20;
  } else if (sanctuary === "none_flat_memorial") {
    monumentWeights.flat_ground_markers += 35;
  }

  const monuments = sampleWeighted(monumentWeights, rng);

  // 5. Boundary & Enclosure
  const boundaryWeights: Record<CemeteryBoundary, number> = {
    high_stone_wall: 40,
    low_curb_or_hedge: 25,
    open_desert_field: 15,
    ditch_and_rampart: 10,
    stepped_water_terrace: zoning === "riverfront_ghat" ? 60 : 0,
    monumental_gate_pylon: 15
  };

  if (cultureType === "Nomadic" || cultureType === "Desert" || zoning === "isolated_highland") {
    boundaryWeights.open_desert_field += 35;
  }
  if (zoning === "topographic_hill" || monuments === "terrace_horseshoe") {
    boundaryWeights.monumental_gate_pylon += 25;
  }

  const boundary = sampleWeighted(boundaryWeights, rng);

  // 6. Landscape & Funerary Flora
  const floraWeights: Record<FuneraryFlora, number> = {
    mediterranean_cypress: 20,
    sacred_yew: 20,
    oriental_evergreen: 20,
    sacred_bodhi_and_fig: 10,
    peaceful_willow: 10,
    barren_gravel: 15,
    garden_parkland: 20
  };

  if (biome.includes("desert") || zoning === "isolated_highland" || boundary === "open_desert_field") {
    floraWeights.barren_gravel += 40;
    floraWeights.mediterranean_cypress += 15;
  } else if (biome.includes("tundra") || biome.includes("taiga")) {
    floraWeights.oriental_evergreen += 35;
    floraWeights.barren_gravel += 20;
  } else if (zoning === "riverfront_ghat") {
    floraWeights.peaceful_willow += 25;
    floraWeights.barren_gravel += 20;
  }

  const vegetation = sampleWeighted(floraWeights, rng);

  // 7. Ritual & Ancillary Facilities (choose 1 to 3 coherent facilities)
  const facilityPool: RitualFacility[] = [];
  if (bodyFate === "cremation_ritual") facilityPool.push("cremation_woodyard");
  if (bodyFate === "excarnation_sky") facilityPool.push("bone_cleaning_table");
  if (zoning === "subterranean_network") facilityPool.push("mourning_cloister", "bone_cleaning_table");
  if (boundary === "high_stone_wall" || zoning === "extramural_highway" || zoning === "extramural_sanitary") {
    facilityPool.push("caretaker_cottage");
  }
  facilityPool.push("ablution_fountain", "incense_candle_stand");

  // Pick 1..3 distinct facilities
  const ritualFacilities: RitualFacility[] = [];
  const count = 1 + Math.floor(rng() * 3);
  const shuffled = [...new Set(facilityPool)];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  for (let i = 0; i < Math.min(count, shuffled.length); i++) {
    ritualFacilities.push(shuffled[i]);
  }

  // Derive mechanics
  let remainFraction = 0.8;
  let zombieRatio = 0.4;
  const resourceCostPerCapita: { wood?: number; stone?: number; linen?: number; incense?: number } = {};
  let sanitationRisk = 0.2;
  let pilgrimageAppeal = 0.25;

  switch (bodyFate) {
    case "cremation_ritual":
      remainFraction = 0.02;
      zombieRatio = 0.0;
      resourceCostPerCapita.wood = 0.12;
      if (sanctuary === "stupa_chorten" || monuments === "columbarium_walls") {
        resourceCostPerCapita.stone = 0.02;
      }
      sanitationRisk = 0.1;
      break;
    case "excarnation_sky":
      remainFraction = 0.12;
      zombieRatio = 0.0;
      resourceCostPerCapita.linen = 0.005;
      sanitationRisk = 0.08;
      break;
    case "submersion_water":
      remainFraction = 0.05;
      zombieRatio = 0.1;
      resourceCostPerCapita.stone = 0.01;
      sanitationRisk = 0.25;
      break;
    case "mummification_embalmed":
      remainFraction = 0.95;
      zombieRatio = 0.8;
      resourceCostPerCapita.linen = 0.04;
      resourceCostPerCapita.incense = 0.02;
      sanitationRisk = 0.15;
      break;
    case "exposure_surface":
      remainFraction = 0.45;
      zombieRatio = 0.1;
      resourceCostPerCapita.wood = 0.01;
      sanitationRisk = 0.35;
      break;
    case "inhumation_shrouded":
      remainFraction = 0.75;
      zombieRatio = 0.3;
      resourceCostPerCapita.linen = 0.02;
      if (monuments === "headstone_grid" || monuments === "cairns_and_steles") resourceCostPerCapita.stone = 0.02;
      sanitationRisk = zoning === "intramural_core" ? 0.6 : 0.15;
      break;
    case "inhumation_coffined":
    default:
      remainFraction = 0.8;
      zombieRatio = 0.4;
      resourceCostPerCapita.wood = 0.03;
      resourceCostPerCapita.stone = 0.02;
      sanitationRisk = zoning === "intramural_core" ? 0.65 : 0.15;
      break;
  }

  if (sanctuary === "mausoleum_dome" || sanctuary === "stupa_chorten") {
    pilgrimageAppeal += 0.35;
  }
  if (zoning === "riverfront_ghat") {
    pilgrimageAppeal += 0.3;
  }

  const profileId = `custom_${Math.floor(rng() * 1000000).toString(16)}`;

  return {
    id: profileId,
    name: "Custom Synthetic Burial Tradition",
    description: `Procedurally synthesized tradition: ${zoning} siting with ${bodyFate} and ${sanctuary} sanctuary.`,
    zoning,
    boundary,
    sanctuary,
    bodyFate,
    monuments,
    vegetation,
    ritualFacilities,
    mechanics: {
      remainFraction,
      zombieRatio,
      resourceCostPerCapita,
      sanitationRisk,
      pilgrimageAppeal: Math.min(1.0, pilgrimageAppeal)
    }
  };
}
