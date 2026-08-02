/**
 * Form / culture-style weight packs for origin & commitment generation (Phase E).
 * Spec: docs/plan/characters/backstory-profile.md §7, §12 Phase E.
 *
 * Packs encode historically flavoured defaults (feudal Europe, theocracy, republic,
 * nomad/horde, empire). They are design priors for generation, not strict ethnography.
 */
import type { CommitmentKind, RaisedIn, SocialStratum } from "./characterTypes";

export type FormPackId = "monarchy" | "theocracy" | "republic" | "horde" | "empire" | "default";

export interface FormPack {
  id: FormPackId;
  /** Human-readable label for docs / debug. */
  label: string;
  /** Added to commitment kind weights before sampling. */
  commitmentBoost: Partial<Record<CommitmentKind, number>>;
  /** Multipliers (1 = unchanged) applied to social stratum base weights. */
  stratumMultiplier: Partial<Record<SocialStratum, number>>;
  /**
   * When set, replaces the default ruler socialStratum table entirely.
   * Used so doges / holy princes / khans are not forced into "royal dynasty" priors.
   */
  rulerStratumWeights?: Partial<Record<SocialStratum, number>>;
  /**
   * Multipliers applied to raisedIn candidate weights after the role base table.
   * Missing keys stay 1. Values near 0 suppress that environment.
   */
  raisedInMultiplier?: Partial<Record<RaisedIn, number>>;
  /**
   * Latin-style clerical celibacy expected for office-holders.
   * Married large households may then signal "worldly cleric"; married Orthodox / Islamic
   * clergy must not use this signal.
   */
  clericalCelibacyExpected?: boolean;
  /**
   * Cultures where slave birth / military slavery / serf-adjacent paths are common enough
   * to appear in officer and merchant tables.
   */
  slaveryCommon?: boolean;
  /** Short era-agnostic labels for commitment kinds in this form's culture of rule. */
  commitmentLabels?: Partial<Record<CommitmentKind, string>>;
}

const PACKS: Record<FormPackId, FormPack> = {
  default: {
    id: "default",
    label: "Default",
    commitmentBoost: {},
    stratumMultiplier: {},
    // Generic medieval-fantasy default leans Latin-Christian office norms for court chaplains.
    clericalCelibacyExpected: true,
    slaveryCommon: false
  },
  monarchy: {
    id: "monarchy",
    label: "Monarchy / feudal",
    commitmentBoost: { house: 12, liege: 10, state: 5, faith: 3 },
    stratumMultiplier: { royal: 1.1, high_noble: 1.15, minor_noble: 1.1, commoner: 0.9 },
    clericalCelibacyExpected: true,
    slaveryCommon: false,
    commitmentLabels: {
      house: "House",
      liege: "Liege lord",
      state: "The Crown",
      faith: "Church"
    }
  },
  theocracy: {
    id: "theocracy",
    label: "Theocracy / holy state",
    commitmentBoost: { faith: 35, office: 10, people: 5, state: 8, house: -8, wealth: -5 },
    stratumMultiplier: { clergy_orphan: 1.6, minor_noble: 0.9, merchant_born: 0.7 },
    // Priest-kings, caliphal houses, and temple aristocracy — not only blood royals.
    rulerStratumWeights: {
      clergy_orphan: 35,
      minor_noble: 25,
      high_noble: 15,
      gentry: 15,
      royal: 10
    },
    raisedInMultiplier: { monastery: 1.8, capital_court: 1.2, military_camp: 0.6, street: 0.5 },
    clericalCelibacyExpected: true,
    slaveryCommon: false,
    commitmentLabels: {
      faith: "The Faith",
      office: "Holy office",
      state: "Holy realm",
      people: "The flock"
    }
  },
  republic: {
    id: "republic",
    label: "Republic / free city",
    commitmentBoost: {
      domain: 18,
      wealth: 12,
      craft: 10,
      state: 12,
      office: 8,
      ideology: 8,
      nation_culture: 6,
      house: -6,
      liege: -10
    },
    stratumMultiplier: { merchant_born: 1.5, gentry: 1.2, royal: 0.25, high_noble: 0.45 },
    // Doges, consuls, stadtholders: urban elite, not reigning blood royals by default.
    rulerStratumWeights: {
      merchant_born: 30,
      gentry: 30,
      high_noble: 15,
      minor_noble: 15,
      commoner: 8,
      royal: 2
    },
    raisedInMultiplier: {
      merchant_quarter: 1.6,
      capital_city: 1.3,
      capital_court: 0.7,
      rural_manor: 0.6
    },
    clericalCelibacyExpected: true,
    slaveryCommon: false,
    commitmentLabels: {
      domain: "The city",
      wealth: "Commerce",
      state: "The republic",
      craft: "Guild craft",
      ideology: "Civic liberty"
    }
  },
  horde: {
    id: "horde",
    label: "Horde / khanate / clan",
    commitmentBoost: { house: 25, family: 18, comrades: 15, domain: 5, self: 5, faith: 3 },
    stratumMultiplier: {
      royal: 1.2,
      high_noble: 1.1,
      commoner: 1.1,
      merchant_born: 0.5,
      clergy_orphan: 0.6,
      freedman: 1.3,
      slave_born: 1.4
    },
    rulerStratumWeights: {
      royal: 55,
      high_noble: 30,
      commoner: 8,
      unknown: 5,
      foreigner: 2
    },
    raisedInMultiplier: {
      military_camp: 2.2,
      frontier_burg: 1.5,
      rural_manor: 1.3,
      capital_court: 0.45,
      monastery: 0.4,
      merchant_quarter: 0.5
    },
    // Steppe / clan faiths do not share Latin clerical celibacy.
    clericalCelibacyExpected: false,
    slaveryCommon: true,
    commitmentLabels: {
      house: "Clan",
      family: "Blood kin",
      comrades: "War band",
      domain: "Grazing rights"
    }
  },
  empire: {
    id: "empire",
    label: "Empire",
    commitmentBoost: { state: 20, office: 12, house: 8, domain: 5, ideology: 5, nation_culture: 4 },
    stratumMultiplier: {
      high_noble: 1.2,
      gentry: 1.1,
      royal: 1.15,
      // Imperial service: military slaves, levies, provincial subjects.
      freedman: 1.25,
      slave_born: 1.35,
      foreigner: 1.2
    },
    raisedInMultiplier: {
      capital_court: 1.25,
      capital_city: 1.15,
      foreign_court: 1.2,
      military_camp: 1.15
    },
    // Multi-faith empires: do not assume Latin celibacy for all "religious" titles.
    clericalCelibacyExpected: false,
    slaveryCommon: true,
    commitmentLabels: {
      state: "The Empire",
      office: "Imperial office",
      house: "Great house"
    }
  }
};

/** Map state.form / formName fragments to a pack id. */
export function resolveFormPackId(formName?: string, form?: string): FormPackId {
  const key = `${formName ?? ""} ${form ?? ""}`.toLowerCase();
  if (/theocr|holy state|bishop|caliph|papal|temple/.test(key)) return "theocracy";
  if (/republic|free city|commune|league|senate|consul/.test(key)) return "republic";
  if (/horde|khan|khagan|clan|tribal|nomad/.test(key)) return "horde";
  if (/empire|imperial/.test(key)) return "empire";
  if (/monarch|kingdom|principality|duchy|earldom|barony|feudal|king|queen/.test(key)) return "monarchy";
  return "default";
}

export function getFormPack(formName?: string, form?: string): FormPack {
  return PACKS[resolveFormPackId(formName, form)];
}

/** Merge commitment boosts into a mutable weight map. */
export function applyFormCommitmentBoost(
  weights: Partial<Record<CommitmentKind, number>>,
  formName?: string,
  form?: string
): void {
  const boost = getFormPack(formName, form).commitmentBoost;
  for (const [kind, value] of Object.entries(boost) as [CommitmentKind, number][]) {
    weights[kind] = Math.max(0, (weights[kind] ?? 0) + value);
  }
}

/** Scale stratum weights in place by form multipliers. */
export function applyFormStratumMultiplier(
  weights: Partial<Record<SocialStratum, number>>,
  formName?: string,
  form?: string
): void {
  const mult = getFormPack(formName, form).stratumMultiplier;
  for (const [stratum, m] of Object.entries(mult) as [SocialStratum, number][]) {
    if (weights[stratum] !== undefined) {
      weights[stratum] = Math.max(0.1, (weights[stratum] ?? 0) * m);
    } else if (m > 1 && (stratum === "slave_born" || stratum === "freedman" || stratum === "foreigner")) {
      // Allow form packs to introduce rare strata not present on the role base table.
      weights[stratum] = Math.max(0.1, 3 * (m - 1));
    }
  }
}

/** Era-style display labels for a commitment kind under a given form. */
export function getCommitmentDisplayLabel(kind: CommitmentKind, formName?: string, form?: string): string {
  const pack = getFormPack(formName, form);
  return pack.commitmentLabels?.[kind] ?? kind;
}

export function expectsClericalCelibacy(formName?: string, form?: string): boolean {
  return Boolean(getFormPack(formName, form).clericalCelibacyExpected);
}

export function isSlaveryCommonForm(formName?: string, form?: string): boolean {
  return Boolean(getFormPack(formName, form).slaveryCommon);
}

/** Scale a raisedIn weight map by the active form pack. */
export function applyFormRaisedInMultiplier(
  weights: Partial<Record<RaisedIn, number>>,
  formName?: string,
  form?: string
): void {
  const mult = getFormPack(formName, form).raisedInMultiplier;
  if (!mult) return;
  for (const [key, m] of Object.entries(mult) as [RaisedIn, number][]) {
    if (weights[key] !== undefined) {
      weights[key] = Math.max(0.05, (weights[key] ?? 0) * m);
    }
  }
}

export function listFormPacks(): FormPack[] {
  return Object.values(PACKS);
}
