/**
 * Data model and tuning constants for the Great Library system (docs/plan/great-library.md).
 * A royal-patronage, multi-year national project: a State builds a landmark library at its
 * capital when it is culturally scholarly, ruled by a learned/scholarship-minded ruler, and
 * wealthy enough to fund construction — see greatLibraryEligibility.ts for the gating math and
 * greatLibrary.ts for the annual settle state machine.
 */

export type GreatLibraryStatus = "planning" | "building" | "paused" | "completed" | "ruined";

export type GreatLibraryPhase = "sitePrep" | "structure" | "collection" | "inauguration";

export interface GreatLibraryProject {
  id: number;
  stateId: number;
  /** Site burg — the State's capital at the time construction started (docs/plan/great-library.md: "v1 は首都固定"). */
  burgId: number;
  status: GreatLibraryStatus;
  phase: GreatLibraryPhase;
  /** 0..BUILD_POINTS. */
  progress: number;
  startedYear: number;
  completedYear?: number;
  ruinedYear?: number;
  /** Set while paused; cleared on resume. */
  pausedSinceYear?: number;
  totalSpent: number;
  /** 0..1 post-completion vitality; decays without upkeep spend, feeds scholar headcount flavor. */
  endowment: number;
  markerId?: number;
  patronRulerId?: number;
  name: string;
}

export interface GreatLibraryEligibility {
  eligible: boolean;
  cultureOk: boolean;
  rulerOk: boolean;
  wealthOk: boolean;
  peaceOk: boolean;
  alreadyHasLibrary: boolean;
  scores: {
    knowledgeValue: number;
    rulerScore: number;
    learning: number;
    treasury: number;
    projectedCoverage: number;
  };
}

// ── Triple-condition start gates (docs/plan/great-library.md KD-2/KD-3/KD-4) ──────────────────

/** Culture.knowledgeValue floor (KD-2). */
export const GREAT_LIBRARY_CULTURE_MIN = 0.55;
/** Raw character.skills.learning floor — separate from, and stricter than, the rulerScore gate (KD-3). */
export const GREAT_LIBRARY_RULER_LEARNING_MIN = 65;
export const GREAT_LIBRARY_RULER_SCORE_MIN = 0.42;

/** Minimum treasury to even consider starting (KD-4). */
export const GREAT_LIBRARY_TREASURY_FLOOR = 300;
/** Minimum projected first-year spend coverage to start (KD-4) — with the constants below this
 *  makes GREAT_LIBRARY_TREASURY_FLOOR coincide with full coverage. */
export const GREAT_LIBRARY_MIN_START_COVERAGE = 0.85;
/** v1-fixed tunable: a state with any "Enemy" diplomacy relation may not start construction (KD-4 W3). */
export const GREAT_LIBRARY_REQUIRE_PEACE_TO_START = true;

// ── Build calibration (docs/plan/great-library.md KD-5) ────────────────────────────────────────

/** Progress needed to complete, once out of "planning". Calibrated to ~12 building years at full coverage. */
export const GREAT_LIBRARY_BUILD_POINTS = 12;
/** Share of treasury spent per building year, same "invest a slice of treasury" shape as StateSecretKnowledge. */
export const GREAT_LIBRARY_BUDGET_SHARE = 0.1;
/** Annual spend that counts as full (1.0) coverage. */
export const GREAT_LIBRARY_TARGET_ANNUAL_SPEND = 30;
/** Progress gained per year at coverage=1 (no half-spend "naming year" promotion — see greatLibrary.ts). */
export const GREAT_LIBRARY_PROGRESS_PER_FULL_COVERAGE = 1;

// ── Maintain gates while building/paused (KD-5, looser than the start gates) ───────────────────

export const GREAT_LIBRARY_MAINTAIN_TREASURY_FLOOR = 150;
export const GREAT_LIBRARY_MAINTAIN_COVERAGE = 0.4;
/** 0.75 * GREAT_LIBRARY_RULER_SCORE_MIN — maintaining only checks score, not the learning floor. */
export const GREAT_LIBRARY_MAINTAIN_RULER_SCORE = 0.315;
/** Progress multiplier applied instead of pausing when the patron state is at active war mid-build. */
export const GREAT_LIBRARY_WARTIME_PROGRESS_FACTOR = 0.4;

// ── Fire risk (KD-5 / §災害) ─────────────────────────────────────────────────────────────────

export const GREAT_LIBRARY_FIRE_CHANCE_BUILDING = 0.01;
export const GREAT_LIBRARY_FIRE_CHANCE_COMPLETED = 0.008;
export const GREAT_LIBRARY_FIRE_CHANCE_PAUSED = 0.005;

export type GreatLibraryFireSeverity = "minor" | "major" | "catastrophic";

interface GreatLibraryFireSeverityWeight {
  severity: GreatLibraryFireSeverity;
  /** Roll weight while status is "building" or "paused". */
  buildingWeight: number;
  /** Roll weight while status is "completed". */
  completedWeight: number;
}

/** Severity roll table (docs/plan/great-library.md §災害). Weights need not sum to 1 — rollFire() normalizes. */
export const GREAT_LIBRARY_FIRE_SEVERITY_WEIGHTS: readonly GreatLibraryFireSeverityWeight[] = [
  { severity: "minor", buildingWeight: 0.6, completedWeight: 0.55 },
  { severity: "major", buildingWeight: 0.3, completedWeight: 0.35 },
  { severity: "catastrophic", buildingWeight: 0.1, completedWeight: 0.1 }
];

// ── Completion effects & lifecycle (KD-6/KD-7) ──────────────────────────────────────────────

/** Direct AcademyKnowledgeStock("administration") boost applied on completion (KD-6, PR3's "main hull" effect). */
export const GREAT_LIBRARY_COMPLETION_ACADEMY_BOOST = 0.25;
/** Flavor-only scholar headcount at endowment=1 (Overview display; no bonus consumer — see docs/plan/great-library.md PR4). */
export const GREAT_LIBRARY_SCHOLAR_WORKERS_AT_FULL = 6;
export const GREAT_LIBRARY_REBUILD_COOLDOWN_YEARS = 20;
/** Years a project may sit paused before its progress starts decaying 5%/year. */
export const GREAT_LIBRARY_PAUSE_DECAY_AFTER_YEARS = 5;
export const GREAT_LIBRARY_PAUSE_DECAY_RATE = 0.05;
/** Share of GREAT_LIBRARY_TARGET_ANNUAL_SPEND spent yearly post-completion to maintain endowment. */
export const GREAT_LIBRARY_ENDOWMENT_MAINTAIN_SPEND_FACTOR = 0.25;
/** Endowment assigned on completion, floor for a freshly finished library. */
export const GREAT_LIBRARY_COMPLETION_ENDOWMENT = 0.35;

// ── Conquest disruption (KD-7 / §征服・占領) ────────────────────────────────────────────────

export const GREAT_LIBRARY_CONQUEST_BUILDING_PROGRESS_MULT = 0.3;
export const GREAT_LIBRARY_CONQUEST_BUILDING_RUIN_CHANCE = 0.4;
export const GREAT_LIBRARY_CONQUEST_COMPLETED_ENDOWMENT_MULT = 0.4;
export const GREAT_LIBRARY_CONQUEST_COMPLETED_RUIN_CHANCE = 0.25;
