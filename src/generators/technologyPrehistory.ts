/**
 * Data-only technology graph for the "ancient Rome → mature medieval" prehistory described in
 * docs/plan/technology-development-roadmap.md §16 (appendix, design-only until this file).
 *
 * Scope, per the roadmap's own §16.6 caveats and the scoping decision that produced this file:
 * - This module is NOT imported by technologyProgress.ts, technologyDefinitions.ts, worldContext,
 *   or any annual tick. It does not seed, evaluate, or otherwise affect a running game. The
 *   existing single continuous timeline still starts at era 0 (mature medieval, START_PROFILE in
 *   technologyDefinitions.ts) exactly as before.
 * - `TechnologyEraBand` (technologyTypes.ts, `0 | 1 | ... | 8`) is left untouched. Prehistory nodes
 *   use their own `PrehistoryEra` string union instead of extending that numeric band.
 * - `TechnologyStage` (locked/known/demonstrated/adopted/diffused) and its rank helpers are reused
 *   as-is from technologyTypes.ts — no new stage value, no regression capability added to the real
 *   evaluator. Roadmap §16.1's "maintenance collapse can push adopted/diffused back toward known"
 *   idea is represented here only as descriptive metadata (`affectsMaintenanceOf`, read by nothing)
 *   on the three "collapse" nodes below — see the comment on that field. Roadmap decision 15.
 * - Effects are plain strings (`effect`), not `getXxxEffect()` query functions wired to any
 *   production system, because nothing downstream reads prehistory progress. Roadmap decision 16.
 *
 * This file exists so §16's node graph is typed, internally consistent (prerequisite ids resolve,
 * thresholds escalate known < demonstrated < adopted) and testable, as a starting point for a
 * possible future "ancient Rome start" scenario — not undertaken here.
 */

import type { TechnologyScope, TechnologyStage } from "./technologyTypes";
import { isTechnologyStageAtLeast, technologyStageRank } from "./technologyTypes";

/** §16.2 / §16.3 / §16.4 — 前1(帝政ローマ最盛期) / 前2(古代の衰退と地方分権化) / 前3(初期中世の再建と封建化). */
export const PREHISTORY_ERAS = ["romanZenith", "declineAndFragmentation", "earlyMedievalRebuilding"] as const;
export type PrehistoryEra = (typeof PREHISTORY_ERAS)[number];

/**
 * Minimal signal set for prehistory nodes. Deliberately NOT the production `TechnologySignals`
 * (technologyTypes.ts) — that interface's fields are computed by the live economy/guild/academy
 * systems that only exist from the era-0 (mature medieval) start onward. Reusing it here would
 * falsely imply these values are actually computed somewhere pre-era-0; none of them are.
 *
 * `*Pressure` fields follow the existing codebase convention (e.g. `mineDrainagePressure`,
 * `gunpowderSulfurPressure` in TechnologySignals): 0..1, higher = more urgent/severe. They exist so
 * the two "collapse" nodes (§16.3) can be gated by a growing shortage/danger rather than needing a
 * `max` threshold shape the real `TechnologyThresholds` doesn't have.
 */
export interface PrehistorySignals {
  /** Raw magnitude, same convention as the real `treasury` signal (not 0..1). */
  centralTreasury: number;
  /** 0..1. Bureaucratic/administrative and legal-recording capacity. */
  provincialAdministration: number;
  /** 0..1. Stonework, surveying, and civil-engineering skill. */
  masonryAndCivilEngineering: number;
  /** 0..1. Smelting/blacksmithing skill. */
  metallurgy: number;
  /** 0..1. Safety of long-distance sea lanes (piracy suppression). */
  maritimeSecurity: number;
  /** 0..1. Depth of monastery-based manuscript copying and record-keeping. */
  monasticScholarship: number;
  /** 0..1. How institutionalized manorial/feudal land-labor-military-service ties are. */
  seigneurialInstitution: number;
  /** 0..1. Rural spread of iron tools and draft-animal use. */
  ironToolAccess: number;
  /** 0..1. Contact with steppe/eastern equestrian cultures (stirrup diffusion channel). */
  equestrianContact: number;
  /** 0..1. Milling/processing demand pressure driving water/wind-mill investment. */
  millDemand: number;
  /** 0..1. Central-fiscal/administrative breakdown pressure (civil war, invasion, bankruptcy). */
  fiscalCollapsePressure: number;
  /** 0..1. Danger/unreliability pressure on long-distance sea trade routes. */
  tradeRouteInsecurityPressure: number;
}

export type PrehistorySignalKey = keyof PrehistorySignals;

export interface PrehistoryThresholds {
  /** Minimum signal values that must all hold (same `min`-only shape as the real TechnologyThresholds). */
  readonly min?: Partial<Record<PrehistorySignalKey, number>>;
}

export interface PrehistoryTechnologyDefinition {
  readonly id: string;
  readonly label: string;
  readonly era: PrehistoryEra;
  readonly scope: TechnologyScope;
  readonly prerequisites: readonly string[];
  /** One-line English restatement of the roadmap table's "結果" column. Documentation only. */
  readonly effect: string;
  /**
   * Ids of other prehistory nodes whose stage this node's §16.1 "maintenance collapse" would pull
   * back toward `known` once demonstrated. Informational only — no function in this module or
   * elsewhere applies it. See the module header and roadmap decision 15. Empty on every node
   * except the three "collapse" nodes in §16.3.
   */
  readonly affectsMaintenanceOf: readonly string[];
  readonly known: PrehistoryThresholds;
  readonly demonstrated: PrehistoryThresholds;
  readonly adopted: PrehistoryThresholds;
}

const NO_MAINTENANCE_TARGETS: readonly string[] = [];

/** §16.2 前1: 帝政ローマ最盛期(技術・制度の頂点). */
const ROMAN_ZENITH: readonly PrehistoryTechnologyDefinition[] = [
  {
    id: "hydraulicConcreteConstruction",
    label: "Hydraulic mortar and pozzolanic concrete",
    era: "romanZenith",
    scope: "state",
    prerequisites: [],
    effect: "Cheap, large-scale domes/arches/harbor structures/public buildings, not limited to cut stone.",
    affectsMaintenanceOf: NO_MAINTENANCE_TARGETS,
    known: { min: { masonryAndCivilEngineering: 0.3, centralTreasury: 30 } },
    demonstrated: { min: { masonryAndCivilEngineering: 0.45, centralTreasury: 55 } },
    adopted: { min: { masonryAndCivilEngineering: 0.6, centralTreasury: 90, provincialAdministration: 0.3 } }
  },
  {
    id: "aqueductsAndUrbanWaterSupply",
    label: "Aqueducts and urban water supply",
    era: "romanZenith",
    scope: "state",
    prerequisites: ["hydraulicConcreteConstruction"],
    effect: "Stable water for cities of several hundred thousand; baths/fountains/sanitation infrastructure.",
    affectsMaintenanceOf: NO_MAINTENANCE_TARGETS,
    known: { min: { masonryAndCivilEngineering: 0.5, centralTreasury: 70 } },
    demonstrated: { min: { masonryAndCivilEngineering: 0.6, centralTreasury: 110, provincialAdministration: 0.35 } },
    adopted: { min: { masonryAndCivilEngineering: 0.7, centralTreasury: 160, provincialAdministration: 0.45 } }
  },
  {
    id: "pavedMilitaryRoadNetwork",
    label: "Paved military road network",
    era: "romanZenith",
    scope: "state",
    prerequisites: [],
    effect: "Faster land transport and troop deployment; unifies provincial governance/trade/supply.",
    affectsMaintenanceOf: NO_MAINTENANCE_TARGETS,
    known: { min: { masonryAndCivilEngineering: 0.35, provincialAdministration: 0.3, centralTreasury: 50 } },
    demonstrated: { min: { masonryAndCivilEngineering: 0.45, provincialAdministration: 0.4, centralTreasury: 90 } },
    adopted: { min: { masonryAndCivilEngineering: 0.55, provincialAdministration: 0.5, centralTreasury: 140 } }
  },
  {
    id: "standingLegionsAndLogistics",
    label: "Standing legions and logistics",
    era: "romanZenith",
    scope: "state",
    prerequisites: ["pavedMilitaryRoadNetwork"],
    effect: "Standardized equipment/training/supply lines; rapid frontier defense and punitive marches.",
    affectsMaintenanceOf: NO_MAINTENANCE_TARGETS,
    known: { min: { provincialAdministration: 0.4, centralTreasury: 90 } },
    demonstrated: { min: { provincialAdministration: 0.5, centralTreasury: 140, metallurgy: 0.4 } },
    adopted: { min: { provincialAdministration: 0.6, centralTreasury: 200, metallurgy: 0.5 } }
  },
  {
    id: "provincialAdministrationAndCodifiedLaw",
    label: "Provincial administration and codified law",
    era: "romanZenith",
    scope: "state",
    prerequisites: [],
    effect: "Standardized taxation/policing/justice across provinces; lowers the cost of broad governance.",
    affectsMaintenanceOf: NO_MAINTENANCE_TARGETS,
    known: { min: { provincialAdministration: 0.3, centralTreasury: 40 } },
    demonstrated: { min: { provincialAdministration: 0.45, centralTreasury: 70 } },
    adopted: { min: { provincialAdministration: 0.6, centralTreasury: 110 } }
  },
  {
    id: "mediterraneanUnifiedTradeAndCurrency",
    label: "Mediterranean-wide unified trade and currency",
    era: "romanZenith",
    scope: "state",
    prerequisites: ["provincialAdministrationAndCodifiedLaw", "pavedMilitaryRoadNetwork"],
    effect: "Bulk sea transport of grain/oil/wine/metal between provinces; cheap food supply for great cities.",
    affectsMaintenanceOf: NO_MAINTENANCE_TARGETS,
    known: { min: { maritimeSecurity: 0.35, provincialAdministration: 0.5, centralTreasury: 130 } },
    demonstrated: { min: { maritimeSecurity: 0.5, provincialAdministration: 0.6, centralTreasury: 190 } },
    adopted: { min: { maritimeSecurity: 0.65, provincialAdministration: 0.7, centralTreasury: 260 } }
  }
];

/** §16.3 前2: 古代の衰退と地方分権化(移行期). */
const DECLINE_AND_FRAGMENTATION: readonly PrehistoryTechnologyDefinition[] = [
  {
    id: "collapseOfCentralMaintenance",
    label: "Collapse of central fiscal/road maintenance",
    era: "declineAndFragmentation",
    scope: "state",
    prerequisites: ["provincialAdministrationAndCodifiedLaw"],
    effect:
      "Central government dissolves (civil war/invasion/bankruptcy); maintenance-dependent Roman-zenith " +
      "nodes would regress toward known if a regression evaluator existed — see the field comment above.",
    affectsMaintenanceOf: ["pavedMilitaryRoadNetwork", "aqueductsAndUrbanWaterSupply"],
    known: { min: { fiscalCollapsePressure: 0.3 } },
    demonstrated: { min: { fiscalCollapsePressure: 0.5 } },
    adopted: { min: { fiscalCollapsePressure: 0.7 } }
  },
  {
    id: "dissolutionOfLegionsIntoRetinues",
    label: "Dissolution of standing legions into local retinues",
    era: "declineAndFragmentation",
    scope: "state",
    prerequisites: ["collapseOfCentralMaintenance", "standingLegionsAndLogistics"],
    effect: "Standing legions give way to land-tied retinues and fortified local defense.",
    affectsMaintenanceOf: ["standingLegionsAndLogistics"],
    known: { min: { fiscalCollapsePressure: 0.4, seigneurialInstitution: 0.15 } },
    demonstrated: { min: { fiscalCollapsePressure: 0.55, seigneurialInstitution: 0.3 } },
    adopted: { min: { fiscalCollapsePressure: 0.7, seigneurialInstitution: 0.45 } }
  },
  {
    id: "fragmentationOfUnifiedTrade",
    label: "Fragmentation of unified trade into local/barter economies",
    era: "declineAndFragmentation",
    scope: "state",
    prerequisites: ["mediterraneanUnifiedTradeAndCurrency"],
    effect: "Loses the broad-market/unified-currency effect; local self-sufficiency and barter dominate.",
    affectsMaintenanceOf: ["mediterraneanUnifiedTradeAndCurrency"],
    known: { min: { tradeRouteInsecurityPressure: 0.3 } },
    demonstrated: { min: { tradeRouteInsecurityPressure: 0.5 } },
    adopted: { min: { tradeRouteInsecurityPressure: 0.7 } }
  },
  {
    id: "monasticPreservationOfKnowledge",
    label: "Monastic preservation of fragmentary knowledge",
    era: "declineAndFragmentation",
    scope: "state",
    prerequisites: ["provincialAdministrationAndCodifiedLaw"],
    effect: "Prevents a total scholarly break, at far lower record density/literacy than provincial administration.",
    affectsMaintenanceOf: NO_MAINTENANCE_TARGETS,
    known: { min: { monasticScholarship: 0.2 } },
    demonstrated: { min: { monasticScholarship: 0.35, fiscalCollapsePressure: 0.3 } },
    adopted: { min: { monasticScholarship: 0.5 } }
  },
  {
    id: "earlyHeavyMoldboardPlow",
    label: "Early heavy moldboard plow",
    era: "declineAndFragmentation",
    scope: "state",
    prerequisites: [],
    effect: "Starts replacing the Roman light scratch plow for northern heavy-clay soils.",
    affectsMaintenanceOf: NO_MAINTENANCE_TARGETS,
    known: { min: { metallurgy: 0.3, ironToolAccess: 0.2 } },
    demonstrated: { min: { metallurgy: 0.4, ironToolAccess: 0.35 } },
    adopted: { min: { metallurgy: 0.5, ironToolAccess: 0.5 } }
  },
  {
    id: "stirrupAndImprovedHarness",
    label: "Stirrup and improved harness diffusion",
    era: "declineAndFragmentation",
    scope: "state",
    prerequisites: [],
    effect: "Improves mounted-combat stability; the military-technical forerunner of knighthood.",
    affectsMaintenanceOf: NO_MAINTENANCE_TARGETS,
    known: { min: { equestrianContact: 0.25 } },
    demonstrated: { min: { equestrianContact: 0.4 } },
    adopted: { min: { equestrianContact: 0.55, metallurgy: 0.35 } }
  }
];

/** §16.4 前3: 初期中世の再建と封建化(→ 段階0 成熟中世へ). */
const EARLY_MEDIEVAL_REBUILDING: readonly PrehistoryTechnologyDefinition[] = [
  {
    id: "manorialismAndFeudalHierarchy",
    label: "Manorialism and feudal hierarchy",
    era: "earlyMedievalRebuilding",
    scope: "state",
    prerequisites: ["dissolutionOfLegionsIntoRetinues"],
    effect:
      "Stable local governance unit binding land, labor, and military-service obligation. §2.1's governance base.",
    affectsMaintenanceOf: NO_MAINTENANCE_TARGETS,
    known: { min: { seigneurialInstitution: 0.35 } },
    demonstrated: { min: { seigneurialInstitution: 0.5, ironToolAccess: 0.4 } },
    adopted: { min: { seigneurialInstitution: 0.65, ironToolAccess: 0.5 } }
  },
  {
    id: "threeFieldRotationTransition",
    label: "Transition to three-field rotation",
    era: "earlyMedievalRebuilding",
    scope: "state",
    prerequisites: ["earlyHeavyMoldboardPlow", "manorialismAndFeudalHierarchy"],
    effect: "Higher yield per unit area than two-field fallow. §2.1's threeFieldAgriculture start-profile premise.",
    affectsMaintenanceOf: NO_MAINTENANCE_TARGETS,
    known: { min: { ironToolAccess: 0.55, seigneurialInstitution: 0.5 } },
    demonstrated: { min: { ironToolAccess: 0.65, seigneurialInstitution: 0.6 } },
    adopted: { min: { ironToolAccess: 0.75, seigneurialInstitution: 0.7 } }
  },
  {
    id: "widespreadWaterAndWindmills",
    label: "Widespread water and wind mill adoption",
    era: "earlyMedievalRebuilding",
    scope: "state",
    prerequisites: ["manorialismAndFeudalHierarchy"],
    effect: "Water power, limited under Rome, spreads fully into milling/pumping/textile processing.",
    affectsMaintenanceOf: NO_MAINTENANCE_TARGETS,
    known: { min: { millDemand: 0.3, seigneurialInstitution: 0.4 } },
    demonstrated: { min: { millDemand: 0.45, seigneurialInstitution: 0.5 } },
    adopted: { min: { millDemand: 0.6, seigneurialInstitution: 0.6 } }
  },
  {
    id: "establishmentOfKnighthood",
    label: "Establishment of knighthood",
    era: "earlyMedievalRebuilding",
    scope: "state",
    prerequisites: ["stirrupAndImprovedHarness", "manorialismAndFeudalHierarchy"],
    effect: "Direct forerunner of §2.1's knights/archers/pikemen/siege-engine military-social profile.",
    affectsMaintenanceOf: NO_MAINTENANCE_TARGETS,
    known: { min: { seigneurialInstitution: 0.45, equestrianContact: 0.5 } },
    demonstrated: { min: { seigneurialInstitution: 0.55, equestrianContact: 0.6, metallurgy: 0.45 } },
    adopted: { min: { seigneurialInstitution: 0.65, equestrianContact: 0.65, metallurgy: 0.55 } }
  },
  {
    id: "cathedralSchoolsAndMonasticRevival",
    label: "Cathedral schools and monastic scholarly revival",
    era: "earlyMedievalRebuilding",
    scope: "state",
    prerequisites: ["monasticPreservationOfKnowledge"],
    effect: "Bridges §2.1's literacy/commerce and era 1's mathematics/astronomy/geography (roadmap §4).",
    affectsMaintenanceOf: NO_MAINTENANCE_TARGETS,
    known: { min: { monasticScholarship: 0.55 } },
    demonstrated: { min: { monasticScholarship: 0.65, seigneurialInstitution: 0.4 } },
    adopted: { min: { monasticScholarship: 0.75, seigneurialInstitution: 0.5 } }
  },
  {
    id: "revivalOfLongDistanceTradeAndFairs",
    label: "Revival of long-distance trade, fairs, and merchant bands",
    era: "earlyMedievalRebuilding",
    scope: "state",
    prerequisites: ["fragmentationOfUnifiedTrade", "manorialismAndFeudalHierarchy"],
    effect: "Forerunner of §2.1's urban markets and later guild institutions.",
    affectsMaintenanceOf: NO_MAINTENANCE_TARGETS,
    known: { min: { maritimeSecurity: 0.4, seigneurialInstitution: 0.45 } },
    demonstrated: { min: { maritimeSecurity: 0.5, seigneurialInstitution: 0.55 } },
    adopted: { min: { maritimeSecurity: 0.6, seigneurialInstitution: 0.65 } }
  }
];

export const PREHISTORY_TECHNOLOGY_DEFINITIONS: readonly PrehistoryTechnologyDefinition[] = [
  ...ROMAN_ZENITH,
  ...DECLINE_AND_FRAGMENTATION,
  ...EARLY_MEDIEVAL_REBUILDING
];

export const PREHISTORY_TECHNOLOGY_DEFINITION_BY_ID: ReadonlyMap<string, PrehistoryTechnologyDefinition> = new Map(
  PREHISTORY_TECHNOLOGY_DEFINITIONS.map(def => [def.id, def])
);

export function getPrehistoryTechnologyDefinition(id: string): PrehistoryTechnologyDefinition | undefined {
  return PREHISTORY_TECHNOLOGY_DEFINITION_BY_ID.get(id);
}

/** Whether every `min` entry is met by `signals`. Same `value >= need` shape as the real evaluator, minus ease/hints. */
export function prehistoryThresholdsMet(thresholds: PrehistoryThresholds, signals: PrehistorySignals): boolean {
  if (!thresholds.min) return true;
  for (const [key, need] of Object.entries(thresholds.min) as [PrehistorySignalKey, number][]) {
    if (need === undefined) continue;
    if (signals[key] < need) return false;
  }
  return true;
}

/** Same "prerequisite must be at least adopted" rule as the real `prerequisitesMet` (technologyProgress.ts). */
export function prehistoryPrerequisitesMet(
  def: PrehistoryTechnologyDefinition,
  stageOf: (id: string) => TechnologyStage
): boolean {
  return def.prerequisites.every(id => isTechnologyStageAtLeast(stageOf(id), "adopted"));
}

/**
 * Pure, monotonic stage-advancement check: given a node's current stage and a signal snapshot,
 * returns the highest of locked/known/demonstrated/adopted the thresholds support. Never regresses
 * (matches the real `advanceStage`'s documented invariant). Caps at `adopted` — this module models
 * no time-based diffusion accumulation, so `diffused` is not reachable here; see the module header.
 * Prerequisites are checked first: a node stuck below `known` never climbs past `locked`-in-effect
 * regardless of its own thresholds.
 */
export function advancePrehistoryStage(
  currentStage: TechnologyStage,
  def: PrehistoryTechnologyDefinition,
  signals: PrehistorySignals,
  stageOf: (id: string) => TechnologyStage
): TechnologyStage {
  if (!prehistoryPrerequisitesMet(def, stageOf)) return currentStage;

  let stage = currentStage;
  if (technologyStageRank(stage) < 1 && prehistoryThresholdsMet(def.known, signals)) {
    stage = "known";
  }
  if (technologyStageRank(stage) === 1 && prehistoryThresholdsMet(def.demonstrated, signals)) {
    stage = "demonstrated";
  }
  if (technologyStageRank(stage) === 2 && prehistoryThresholdsMet(def.adopted, signals)) {
    stage = "adopted";
  }
  return stage;
}
