import type { Point } from "lineclip";

export const CULTURE_TYPES = ["Generic", "Hunting", "Highland", "River", "Lake", "Naval", "Nomadic"] as const;
export const DEFAULT_CULTURE_TYPE: CultureType = "Generic";
export type CultureType = (typeof CULTURE_TYPES)[number];

/**
 * How character generation rolls sex for people of this race (nobility / createPerson).
 * - male_dominant: historical feudal court bias (~90% male) — the default when omitted
 * - female_only: Amazones-style all-female polities
 * - balanced: ~50/50
 */
export const CHARACTER_GENDER_MODES = ["male_dominant", "female_only", "balanced"] as const;
export type CharacterGenderMode = (typeof CHARACTER_GENDER_MODES)[number];

/**
 * Stable race catalog keys. Cultures reference a race by id; the key survives renames.
 * See `src/data/races.ts` for the built-in catalog.
 */
export type RaceKey =
  | "unknown"
  | "human"
  | "elf"
  | "dark_elf"
  | "dwarf"
  | "goblin"
  | "orc"
  | "giant"
  | "draconic"
  | "arachnid"
  | "amazones"
  | (string & {});

/** Phenotype axes for character looks (1–100). Not beauty scores. */
export const APPEARANCE_AXIS_IDS = ["stature", "build", "symmetry", "refinement", "vitality", "ornament"] as const;
export type AppearanceAxisId = (typeof APPEARANCE_AXIS_IDS)[number];
export type AppearanceAxes = Record<AppearanceAxisId, number>;

/**
 * Race-default weights over phenotype axes when judging same-race beauty.
 * Positive weight = prefer high axis values; negative = prefer low.
 */
export interface RaceBeautyIdeal {
  weights: Partial<Record<AppearanceAxisId, number>>;
}

/** Species reproductive defaults (character households / future tick births). */
export interface RaceFertility {
  /** Age of reproductive maturity (years). */
  fertilityStart: number;
  /** Soft end of the primary fertile window (years). */
  fertilityEnd: number;
  /** Typical years between successful births for a continuously paired couple. */
  interbirthYears: number;
  /** Mean live births per pregnancy / clutch (1 ≈ singleton norm). */
  litterMean: number;
  /** Cap on live births per pregnancy. */
  litterMax: number;
}

/**
 * Species / folk traits, independent of culture (language, names, expansion).
 * Index 0 is "Unknown" (Wildlands / unset).
 */
export interface Race {
  i: number;
  /** Stable catalog key (`human`, `elf`, `amazones`, …). */
  key: RaceKey;
  name: string;
  /**
   * Character-generation gender policy for this race.
   * Used by the characters extension (`createPerson`); omitted = male_dominant.
   */
  characterGender?: CharacterGenderMode;
  /**
   * Typical natural lifespan in years (genre-default Western fantasy scale).
   * Soft expectation for aging / mortality; not a hard cap.
   */
  lifespan?: number;
  /**
   * Rare extreme maximum age in years for this race.
   * Should be ≥ `lifespan` when both are set.
   */
  maxLifespan?: number;
  /** Mean phenotype at generation (axes still get individual noise). */
  looksBaseline?: Partial<AppearanceAxes>;
  /** Same-race beauty ideal weights. */
  beautyIdeal?: RaceBeautyIdeal;
  /** Reproductive biology defaults. */
  fertility?: RaceFertility;
  lock?: boolean;
  removed?: boolean;
}

import type { Emblem } from "./emblem";

export interface EmblemEl {
  i: number;
  name?: string;
  fullName?: string;
  center?: number;
  pole?: [number, number];
  x?: number;
  y?: number;
}

export type FeatureType = "ocean" | "lake" | "island";

/** Determines how additional connections between ports are selected for sea routes. */
export type SeaRouteGenerationMode = "legacy" | "augmented";

/**
 * Land-route Dijkstra cost model for roads/trails generation.
 * - elevationAware: stronger absolute-height + climb penalties (prefer valleys).
 * - legacy: previous weak heightModifier only (docs/plan/land-route-elevation-cost.md).
 */
export type LandRouteGenerationMode = "legacy" | "elevationAware";

export interface ReligionBase {
  type: "Folk" | "Organized" | "Cult" | "Heresy";
  form: string;
  culture: number;
  center: number;
}

export interface NamedReligion extends ReligionBase {
  name: string;
  deity: string | null | undefined;
  expansion: string;
  expansionism: number;
  color: string;
}

export interface BurgGroup {
  name: string;
  active: boolean;
  order: number;
  /** Optional zoom level at which this group's icons and labels become visible. */
  minZoom?: number;
  isDefault?: boolean;
  features?: {
    capital?: boolean;
    citadel?: boolean;
    walls?: boolean;
    plaza?: boolean;
    port?: boolean;
    temple?: boolean;
  };
  preview?: string;
  percentile?: number;
  min?: number;
  max?: number;
  /** Explicit biome codes (catalog-local; prefer biomeTags when possible). */
  biomes?: number[];
  /** Match if the cell biome has any of these tags (e.g. forest, desert, nomadic). */
  biomeTags?: string[];
  states?: number[];
  cultures?: number[];
  religions?: number[];
}

export interface BurgDemographics {
  capacity: number;
  /**
   * Population capacity after temporary, external support such as food imports.
   * Falls back to `capacity` for maps saved before this field was introduced.
   */
  effectiveCapacity?: number;
  children: number;
  maleAdults: number;
  femaleAdults: number;
  elders: number;
}

export interface Burg {
  cell: number;
  x: number;
  y: number;
  i?: number;
  state?: number;
  culture?: number;
  name?: string;
  feature?: number;
  capital?: number;
  lock?: boolean;
  port?: number;
  removed?: boolean;
  population?: number;
  type?: CultureType;
  coa?: Emblem;
  citadel?: number;
  plaza?: number;
  walls?: number;
  shanty?: number;
  temple?: number;
  group?: string;
  link?: string;
  MFCG?: number | string;
  province?: number;
  product?: number;
  treasury?: number;
  /**
   * Multi-ledger PR-7 domain fiscal policy for this seat (province lord UI).
   * balanced = default; extract = auto-remit/personal skim; fortify = local works + security.
   */
  domainFiscalPolicy?: "balanced" | "extract" | "fortify";
  /**
   * PR-8 domain levy intensity multiplier (default 1). Scales extract remits; lord-adjustable.
   * Clamped ~0.5–1.5 in domain fiscal policy helpers. PR-12 also scales state poll-tax collection.
   */
  domainLevyRate?: number;
  /**
   * PR-8 fortify works progress 0–100. Accumulates under fortify policy; at 100 completes the
   * queued construction target (PR-12 domainWorksTarget).
   */
  domainWorksProgress?: number;
  /**
   * PR-12 next fortify completion target: walls | citadel | plaza.
   */
  domainWorksTarget?: "walls" | "citadel" | "plaza";
  /** Public-order score from 0 (unsafe) to 100 (secure). Seeded at 50; no simulation effects yet. */
  security?: number;
  /**
   * Public-health and cleanliness score from 0 (unsanitary) to 100 (sanitary).
   * Seeded at 50; when Economy is enabled, UrbanWater.settleAnnual/generate overwrites this
   * from UrbanWaterSystem (docs/plan/urban-water-and-sanitation-system.md Phase 1).
   */
  sanitation?: number;
  /** Small local staple-food buffer (Grain-equivalent units), independent of the Market's pooled stock. */
  foodReserve?: number;
  market?: number;
  demographics?: BurgDemographics;
  /**
   * Every state that has ever owned this burg, oldest first, ending with the current owner
   * (`state`) — appended to on every capture (see localDefense.ts's `captureBurg`). Lets
   * reconquest logic answer "was this ever legitimately ours?" instead of only seeing whoever
   * holds it now: regimentMovement.ts's garrison logic uses it to route patrols into a lost
   * enclave (a burg previously owned by their own state) so they retake it in passing, and it's
   * available for any future UI/AI decision that needs to judge a reclaim's legitimacy.
   */
  stateHistory?: number[];
}

export interface Culture {
  name: string;
  i: number;
  base: number;
  shield: string;
  lock?: boolean;
  code?: string;
  center?: number;
  sort?: (i: number) => number;
  odd?: number;
  color?: string;
  type?: CultureType;
  expansionism?: number;
  origins?: (number | null)[];
  removed?: boolean;
  cells?: number;
  area?: number;
  rural?: number;
  urban?: number;
  /**
   * `pack.races` id for this culture's dominant folk.
   * Culture = language / names / expansion; race = species traits (e.g. Amazones gender).
   * Defaults to Human (1) when omitted on legacy maps.
   */
  race?: number;
  /**
   * Generation-time only: catalog key resolved to `race` id when cultures are seeded.
   * Never persisted on saved maps.
   */
  raceKey?: RaceKey;
  /**
   * Fantasy sets: when true, states of this culture are mono-racial purity polities
   * (dangerous fringe in the multi-race balance setting). When false/omitted, states
   * are multi-racial mixed societies with a cultural majority.
   * See docs/world/help/multi-race-geopolitics.md.
   */
  monoRacial?: boolean;
  /**
   * @deprecated Prefer race.characterGender. Still read as a fallback for pre-split maps.
   */
  characterGender?: CharacterGenderMode;
}

export interface PackedGraphFeature {
  i: number;
  type: FeatureType;
  land: boolean;
  border: boolean;
  cells: number;
  firstCell: number;
  vertices: number[];
  area: number;
  shoreline: number[];
  height: number;
  group: string;
  temp: number;
  flux: number;
  evaporation: number;
  name: string;
  inlets?: number[];
  outlet?: number;
  river?: number;
  enteringFlux?: number;
  closed?: boolean;
  outCell?: number;
}

export interface GridFeature {
  i: number;
  land: boolean;
  border: boolean;
  type: FeatureType;
}

export type IceGlacier = { i: number; points: [number, number][]; type: "glacier"; offset?: [number, number] };
export type IceIceberg = {
  i: number;
  points: [number, number][];
  type: "iceberg";
  cellId: number;
  size: number;
  offset?: [number, number];
};
export type IceElement = IceGlacier | IceIceberg;

export interface Marker {
  i: number;
  type: string;
  icon: string;
  dx?: number;
  dy?: number;
  px?: number;
  cell: number;
  lock?: boolean;
  x?: number;
  y?: number;
  size?: number;
  pin?: string;
  fill?: string;
  stroke?: string;
  pinned?: boolean;
  hidden?: boolean;
}

/**
 * Standalone frontier fort/marcher-castle marker guarding a hostile land border at a
 * chokepoint (river crossing, mountain pass, or road). Independent of any burg — distinct
 * from the "fort" burg group (see burgs-generator.ts getDefaultGroups()) and from a burg's
 * own `citadel` flag.
 */
export interface FrontierFort {
  i: number;
  /** Owning state — the side this fort defends. */
  state: number;
  /** The chokepoint cell the fort sits on. Never a burg cell — a town's own citadel already covers that. */
  cell: number;
  x: number;
  y: number;
  /** Why this cell was chosen; drives icon/legend flavor. */
  siteType: "river" | "mountain" | "road";
  /** The hostile state from FrontierSegment.neighborState. */
  neighborState: number;
  /** Snapshot of FrontierSegment.threatWeight at generation time. */
  threatWeight: number;
  name: string;
  icon: string;
  pin: string;
  size?: number;
  hidden?: boolean;
}

export interface Monster {
  i: number;
  cell: number;
  name: string;
  rarity: number;
  /** Current influence radius / strength (may drop as hunts progress). */
  power: number;
  /**
   * Spawn-time power used by Phase 4 rewilding to regenerate pressure toward
   * the original threat level when a hunt does not finish the creature.
   */
  basePower?: number;
  type: string;
}

export interface Province {
  i: number;
  removed?: boolean;
  state: number;
  lock?: boolean;
  center: number;
  burg: number;
  name: string;
  formName: string;
  fullName: string;
  color: string;
  coa: Emblem | null;
  pole?: [number, number];
  area?: number;
  rural?: number;
  urban?: number;
  burgs?: number[];
  /** Regional public-order score from 0 (unsafe) to 100 (secure). */
  security?: number;
  /** Regional public-health and cleanliness score from 0 (unsanitary) to 100 (sanitary). */
  sanitation?: number;
}

export interface Religion extends NamedReligion {
  i: number;
  code?: string;
  origins?: number[] | null;
  lock?: boolean;
  removed?: boolean;
  cells?: number;
  area?: number;
  rural?: number;
  urban?: number;
}

export interface River {
  i: number;
  source: number;
  mouth: number;
  parent: number;
  basin: number;
  length: number;
  discharge: number;
  width: number;
  widthFactor: number;
  sourceWidth: number;
  name: string;
  type: string;
  cells: number[];
  points?: Point[];
}

export interface Route {
  i: number;
  group: string;
  feature: number;
  points: [number, number, number][];
  cells?: number[];
  /**
   * A visual-only route that follows the directed RiverNavigationGraph. It is
   * deliberately excluded from `pack.cells.routes`, which is bidirectional.
   */
  navigation?: "river";
  /** A cross-State trade or pilgrimage trail, rather than State-maintained infrastructure. */
  international?: boolean;
  merged?: boolean;
  name?: string;
  /** Runtime: computed by editor */
  length?: number;
  /** Runtime: set by user in editor */
  lock?: boolean;
}

export interface Campaign {
  name: string;
  start: number;
  end?: number;
  attacker: number;
  defender: number;
}

export interface ChronicleEvent {
  id: string;
  yearsAgo: number;
  from: number;
  to: number;
  fromBurg?: number;
  toBurg?: number;
  action: string;
  rawText: string;
}

/** How races compose a polity — derived from culture.monoRacial on generation. */
export type StateRacialComposition = "mono" | "mixed";

export interface State {
  i: number;
  name: string;
  expansionism: number;
  capital: number;
  type: string;
  center: number;
  culture: number;
  /**
   * Fantasy multi-race maps: `mono` = purity ethnostate of the culture's race;
   * `mixed` = multi-racial society (default / non-fantasy).
   */
  racialComposition?: StateRacialComposition;
  coa: Emblem | null;
  lock?: boolean;
  removed?: boolean;
  pole?: [number, number];
  neighbors?: number[];
  color?: string;
  cells?: number;
  area?: number;
  burgs?: number;
  rural?: number;
  urban?: number;
  campaigns?: Campaign[];
  diplomacy?: (string | string[] | ChronicleEvent[] | [string, ChronicleEvent])[];
  formName?: string;
  fullName?: string;
  form?: string;
  military?: MilitaryRegiment[];
  provinces?: number[];
  temp?: Record<string, number> & { platoons?: Platoon[] };
  alert?: number;
  salesTax?: number;
  pollTax?: number;
  /** L2 public treasury stock (institutional cash). */
  treasury?: number;
  /**
   * L1 crown household purse — court/institutional household cash, distinct from the ruler's
   * personal Character.wealth (L0) and from public treasury (L2).
   * docs/plan/multi-ledger-fiscal-architecture.md PR-2.
   */
  householdPurse?: number;
  /**
   * L3a department spendable balances (marshalcy…ecclesiastica). Credited each cycle from the
   * form's nominal department shares; office personal stipends draw from here. Military troop
   * upkeep and field-commander pay prefer L3a.marshalcy before L2 (PR-5). Vacant offices leave
   * balances parked. docs/plan/multi-ledger-fiscal-architecture.md PR-3/PR-5.
   */
  departmentBalances?: {
    marshalcy: number;
    chancery: number;
    stewardship: number;
    spymastery: number;
    ecclesiastica: number;
  };
  /** Fraction of population-equivalent grain paid to the suzerain each generation (Vassal states only). */
  tributeRate?: number;
  /** Computed grain-equivalent tribute amount paid to the suzerain (Vassal states only). */
  tributePaid?: number;

  // ── Treasury department allocation (docs/plan/state-treasury-department-budget.md §4) ──
  /** Marshalcy funding ratio (allocated Budget ÷ getStateMilitaryUpkeep Need). Undefined until Economy's allocateTreasury() has run at least once. */
  militaryFundingRatio?: number;
  /**
   * Accumulates while militaryFundingRatio stays below the well-funded tier, decays while
   * above it (§4.3). Crossing the event threshold dispatches "fmg:military-discontent-threshold"
   * once per upward crossing; no consequence is wired to that event yet (deferred to a future
   * nobility coup/mutiny mechanic).
   */
  militaryDiscontent?: number;
  /**
   * Explicit war-economy policy lever (multi-ledger PR-6). When true, allocateTreasury reweights
   * department shares toward marshalcy (and form-protected secondaries). Not the same as
   * diplomacy Enemy — AI may sync this from Enemy diplomacy unless warFootingPlayerLocked.
   */
  warFooting?: boolean;
  /**
   * When true, AI will not auto-toggle warFooting (player set it via HUD). Cleared when the
   * state leaves war and AI demobilizes, or when the player toggles again into the AI-aligned state.
   * Multi-ledger PR-7.
   */
  warFootingPlayerLocked?: boolean;
  /**
   * Temporary troop-target uplift fraction (0..~0.25) written by Economy when warFooting is on
   * and marshalcy Budget exceeds Need. Read by `effectiveTroopTarget` (manpower.ts). 0 / unset
   * when inactive. docs/plan/state-treasury-department-budget.md §4.4 case β.
   */
  militaryMobilizationBoost?: number;
  /**
   * Outstanding public debt principal (L2 liability). Serviced each tax cycle; Republic/Monarchy
   * may issue thin war debt when war footing and cash-strapped. Multi-ledger PR-7.
   * Counterparty is `creditPoolBalance` (PR-9 anonymous moneylender pool).
   */
  publicDebt?: number;
  /**
   * PR-9 anonymous credit pool (moneylender v0) — liquid reserves that fund publicDebt issues
   * and receive interest, principal repayments, and most tax-farm skims.
   */
  creditPoolBalance?: number;
  /**
   * PR-10 primary named moneylender (usually capital market manager) for UI / diplomacy hooks.
   */
  primaryMoneylenderId?: number;
  /** Display name of primaryMoneylenderId (last tax-cycle snapshot). */
  primaryMoneylenderName?: string;
  /**
   * PR-10 effective monthly interest rate on publicDebt (greed/form/support scaled).
   * Written each fiscal cycle; undefined until Economy has run allocate/collectTaxes once.
   */
  debtInterestRate?: number;
  /**
   * PR-11 relative negotiation modifier on the computed rate (−0.25 … +0.25).
   * Negative = ruler successfully pressed for cheaper credit.
   */
  debtRateNegotiation?: number;
  /**
   * PR-11: consecutive tax cycles where interest was not fully paid.
   */
  debtMissedInterestCycles?: number;
  /**
   * PR-11: true while missed-interest streak is at/above threshold — new borrowing frozen.
   */
  debtInDefault?: boolean;
  /**
   * PR-12: military coup risk sticky flag while discontent is high during default.
   */
  debtCoupRisk?: boolean;
  /**
   * PR-13: consecutive tax cycles at acute debt-coup risk (toward success).
   */
  debtCoupRiskStreak?: number;
  /**
   * PR-12: sticky assembly-support penalty after debt coup-risk (subtracted in getCouncilSupport).
   */
  debtCoupSupportPenalty?: number;
  /** PR-12: last-cycle credit-pool flight amount while in default. */
  lastDebtPoolFlight?: number;
  /** PR-12: last-cycle syndicate personal wealth haircut while in default. */
  lastDebtMerchantHaircut?: number;
  /**
   * PR-13: last successful debt-coup ruler transfer snapshot.
   */
  lastDebtCoup?: {
    oldRulerId: number;
    newRulerId: number;
    oldRulerName?: string;
    newRulerName?: string;
  };
  /**
   * PR-14: post-coup legitimacy 0–100 (undefined = no recent coup).
   */
  coupLegitimacy?: number;
  /**
   * PR-14: sticky civil unrest after a debt coup.
   */
  civilUnrest?: boolean;
  /** PR-14: tax cycles while civil unrest has been active. */
  civilUnrestCycles?: number;
  /**
   * PR-15: living deposed ruler id for legitimacy war.
   */
  legitimacyPretenderId?: number;
  legitimacyPretenderName?: string;
  /** PR-15: legitimacy war (pretender vs regime) is active. */
  legitimacyWarActive?: boolean;
  /** PR-15: ticks while legitimacy war has been open. */
  legitimacyWarTicks?: number;
  /**
   * PR-15: trade income multiplier while foreign debt is in default (< 1 when sanctioned).
   */
  tradeSanctionMult?: number;
  /** PR-15: creditor state ids applying trade sanctions. */
  tradeSanctionCreditorIds?: number[];
  /** PR-15: income blocked by trade sanctions this tax cycle. */
  lastTradeSanctionBlocked?: number;
  /**
   * PR-15 sovereign credit rating (bond market).
   */
  creditRating?: "AAA" | "AA" | "A" | "BBB" | "BB" | "B" | "CCC" | "D";
  creditRatingScore?: number;
  /** PR-15 effective bond-market monthly rate after rating. */
  bondMarketRate?: number;
  /** PR-15 last secondary-market bond transfer amount. */
  lastBondSecondaryTransfer?: number;
  /**
   * PR-15 council session replay snapshots (faction graphs).
   */
  councilSessionSnapshots?: {
    sessionNumber: number;
    year: number;
    month: number;
    support: number;
    debtVoteYes: number;
    lineVotes: {
      debtIssue: number;
      warFooting: number;
      extraordinaryTax: number;
      militaryExpansion: number;
    };
    factions: { faction: string; share: number; lean: number; contribution: number }[];
    councilFailed: boolean;
    notes: string;
  }[];
  /**
   * PR-13 foreign/international debt principal total (sum of foreignLoans).
   */
  foreignDebt?: number;
  /**
   * PR-13/14 bilateral or bond-market foreign loans (外債).
   */
  foreignLoans?: {
    creditorStateId: number;
    creditorName: string;
    principal: number;
    interestRate: number;
    missedInterestCycles?: number;
    inDefault?: boolean;
    viaBondMarket?: boolean;
  }[];
  /** PR-14: any foreign loan currently in default. */
  foreignDebtInDefault?: boolean;
  /** PR-13 last-cycle foreign debt issued. */
  lastForeignDebtIssued?: number;
  /** PR-13 last-cycle foreign interest paid. */
  lastForeignDebtInterest?: number;
  /** PR-13 last-cycle foreign principal repaid. */
  lastForeignDebtRepaid?: number;
  /** PR-14 last-cycle bond-market issue amount. */
  lastBondMarketIssue?: number;
  /** PR-14 diplomacy chill count last foreign-service cycle. */
  lastForeignDiplomacyWorsened?: number;
  /** PR-14 diplomacy thaw count last foreign-service cycle. */
  lastForeignDiplomacyImproved?: number;
  /**
   * PR-13 council session chronicle (ring buffer).
   */
  councilSessionLog?: {
    id: number;
    kind: string;
    summary: string;
    year: number;
    month: number;
    support?: number;
    yesShare?: number;
    amount?: number;
    factionDetail?: string;
  }[];
  /** PR-13 assembly session counter. */
  councilSessionNumber?: number;
  /**
   * PR-8 assembly support snapshot (0–100) from the last tax cycle / support refresh.
   */
  councilSupport?: number;
  /**
   * PR-12 faction bloc shares (court/merchants/military/clergy), last refresh.
   */
  councilFactionShares?: {
    court: number;
    merchants: number;
    military: number;
    clergy: number;
  };
  /** PR-12 last debt-issue vote yes share (0–1). */
  councilLastDebtVoteYes?: number;
  /**
   * PR-14 last debt-issue vote per-faction detail.
   */
  councilLastVoteFactionDetail?: {
    faction: string;
    share: number;
    lean: number;
    contribution: number;
  }[];
  /**
   * PR-14 last yes-share snapshot for each budget line.
   */
  councilLastLineVotes?: {
    debtIssue: number;
    warFooting: number;
    extraordinaryTax: number;
    militaryExpansion: number;
  };
  /**
   * PR-11 thin budget-line approvals (support thresholds + PR-12 faction votes). Refreshed each tax cycle.
   */
  councilApprovals?: {
    debtIssue: boolean;
    warFooting: boolean;
    extraordinaryTax: boolean;
    militaryExpansion: boolean;
  };
  /** PR-8: whether the last wartime assembly vetoed part of revenue. */
  councilLastFailed?: boolean;
  /** PR-8: last cycle tax-farm leak amount (for UI). */
  lastTaxFarmLeak?: number;
  /** PR-8: last cycle auto debt issued. */
  lastDebtIssued?: number;
  /** PR-8: last cycle debt principal repaid. */
  lastDebtRepaid?: number;
  /**
   * PR-12 domain-levy → poll-tax collection multiplier applied last collectTaxes (≈0.9–1.13).
   */
  domainPollTaxMultiplier?: number;

  // ── Manpower / agriculture simulation (docs/plan/military/manpower-ecosystem.md) ──
  /**
   * True after initial under-arms headcount has been deducted from civilian maleAdults
   * so troops are not double-counted in the population pyramid.
   */
  manpowerReconciled?: boolean;
  /** 0..~1.5 food disruption from fighting in planting/harvest seasons. */
  foodStress?: number;
  /** In-year spring war exposure (day-weighted, seasonality-scaled). */
  plantingExposure?: number;
  /** In-year autumn war exposure. */
  harvestExposure?: number;
  /** Carry-over fraction of last year's foodStress into the next year. */
  agricultureCarryOver?: number;
  /** Calendar year the exposure buffers belong to. */
  agricultureYear?: number;
  /**
   * 0..1 wartime supply strain (Economy warIntensity / food logistics).
   * Core derives draft/recovery penalties from this + foodStress when set.
   */
  supplyStrain?: number;
  /**
   * Raw-score-unit aggregate stock of food-tagged goods reachable by this state (Economy
   * extension, burg-weighted apportionment across market territories; refreshed every
   * production cycle by stateEconomySummary.ts's refreshStateEconomySummaries()).
   */
  foodStock?: number;
  /** State-wide public-order score from 0 (unsafe) to 100 (secure). */
  security?: number;
  /** State-wide public-health and cleanliness score from 0 (unsanitary) to 100 (sanitary). */
  sanitation?: number;
}

export interface Zone {
  i: number;
  name: string;
  type: string;
  cells: number[];
  color: string;
  hidden?: boolean;
}

export interface MilitaryUnit {
  icon: string;
  name: string;
  rural: number;
  urban: number;
  crew: number;
  power: number;
  type: string;
  separate: number;
  /** Whether the unit can be recruited. Omitted/undefined counts as enabled — only `false` disables it. */
  enabled?: boolean;
  biomes?: number[];
  states?: number[];
  cultures?: number[];
  religions?: number[];
}

export interface MilitaryRegiment {
  i: number;
  t: number;
  name: string;
  a: number;
  s: number;
  cell: number;
  x: number;
  y: number;
  bx: number;
  by: number;
  u: Record<string, number>;
  n: number;
  type: string;
  icon?: string;
  children?: MilitaryRegiment[];
  state: number;
  angle?: number;
  /** State id of the vassal territory this regiment is garrisoned in, if not stationed at home. */
  garrisonHost?: number;
  /**
   * Primary recruitment province for manpower fill/draft (docs/plan/military/manpower-ecosystem.md §4.2).
   * Set at Military.generate from the spawn anchor cell; 0 = no province / statewide pool.
   */
  homeProvince?: number;
  /**
   * Combat effectiveness 0..1 (1 = fully trained). Fresh recruits dilute quality
   * (manpower-ecosystem Phase 5). Omitted/undefined treated as 1 for legacy data.
   */
  quality?: number;
  /** True for the state's dedicated capital guard regiment (never merged with field armies). */
  isCapitalGuard?: boolean;
  /** pack.characters id of the officer commanding this regiment, if one has been assigned. */
  commanderId?: number;
  /**
   * Movement (docs/plan/military-movement.md Phase 2), all set together by
   * regimentMovement.ts and cleared together once the destination is reached or abandoned.
   * `undefined` destinationCell/path means the regiment is holding its current position.
   */
  /** Cell this regiment is currently marching toward. */
  destinationCell?: number;
  /** Ordered land/sea-route (or off-road BFS) cell sequence from march start to `destinationCell`, inclusive. */
  path?: number[];
  /** Index into `path` of the last fully-reached node; `path[pathIndex]` === `cell`. */
  pathIndex?: number;
  /** Map-unit distance advanced past `path[pathIndex]` toward `path[pathIndex + 1]`, used to interpolate `x`/`y` between ticks. */
  edgeProgress?: number;
  /** True when `path` came from the off-road cells.c fallback (no charted road/trail) rather than a route graph — see regimentMovement.ts's OFF_ROAD_SPEED_MULTIPLIER. */
  offRoad?: boolean;
  /**
   * `i` of the field army this regiment was split off from as a detachment (docs/plan/military-movement.md
   * Phase 4, dynamic hierarchy mode only). Undefined for ordinary regiments. Only meaningful until the next
   * full `Military.generate()` rebuild — like `i` itself, it is not a stable cross-rebuild identity.
   */
  parentId?: number;
  /** Current tactical status for rendering action icons (e.g. 🎯 for battled, 🎪 for waiting) */
  actionStatus?: "battled" | "waiting";
  /**
   * `targetBurg` of the owning state's StrategicGoal (simulationContext.ts) this regiment is
   * currently counted toward, if any — set by strategic-planner.ts's advanceTension() when it
   * tallies a regiment within reinforcement range of a siege target. Lets evaluatePlans() clear
   * march orders only for regiments tied to a cancelled goal instead of the whole army (see
   * docs/plan/military-time-advance-review-findings.md §1.7). A regiment left without a goal
   * this way isn't immediately re-tasked — it falls back to its own local reaction-layer
   * decision (regimentMovement.ts's applyReactionMarchOrder) until the ruler issues a new one.
   */
  goalTargetBurg?: number;
}

export interface Platoon {
  cell: number;
  a: number;
  t: number;
  x: number;
  y: number;
  u: string;
  n: number;
  s: number;
  type: string;
  children?: Platoon[];
  /** Province id this platoon was recruited in (0 = no province). */
  province: number;
  /** Ocean/sea feature id for naval units. */
  waterBody?: number;
}

export interface NameBase {
  name: string;
  i: number;
  min: number;
  max: number;
  d: string;
  m: number;
  b: string;
}
