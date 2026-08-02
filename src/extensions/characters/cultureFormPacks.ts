/**
 * Form / culture-style weight packs for origin & commitment generation (Phase E).
 * Spec: docs/plan/characters/backstory-profile.md §7, §12 Phase E.
 */
import type { CommitmentKind, SocialStratum } from "./characterTypes";

export type FormPackId = "monarchy" | "theocracy" | "republic" | "horde" | "empire" | "default";

export interface FormPack {
  id: FormPackId;
  /** Human-readable label for docs / debug. */
  label: string;
  /** Added to commitment kind weights before sampling. */
  commitmentBoost: Partial<Record<CommitmentKind, number>>;
  /** Multipliers (1 = unchanged) applied to social stratum base weights. */
  stratumMultiplier: Partial<Record<SocialStratum, number>>;
  /** Short era-agnostic labels for commitment kinds in this form's culture of rule. */
  commitmentLabels?: Partial<Record<CommitmentKind, string>>;
}

const PACKS: Record<FormPackId, FormPack> = {
  default: {
    id: "default",
    label: "Default",
    commitmentBoost: {},
    stratumMultiplier: {}
  },
  monarchy: {
    id: "monarchy",
    label: "Monarchy / feudal",
    commitmentBoost: { house: 12, liege: 10, state: 5, faith: 3 },
    stratumMultiplier: { royal: 1.1, high_noble: 1.15, minor_noble: 1.1, commoner: 0.9 },
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
    commitmentBoost: { domain: 18, wealth: 12, craft: 10, state: 12, office: 8, house: -6, liege: -10 },
    stratumMultiplier: { merchant_born: 1.5, gentry: 1.2, royal: 0.3, high_noble: 0.5 },
    commitmentLabels: {
      domain: "The city",
      wealth: "Commerce",
      state: "The republic",
      craft: "Guild craft"
    }
  },
  horde: {
    id: "horde",
    label: "Horde / khanate / clan",
    commitmentBoost: { house: 25, family: 18, comrades: 15, domain: 5, self: 5, faith: 3 },
    stratumMultiplier: { royal: 1.2, high_noble: 1.1, commoner: 1.1, merchant_born: 0.5, clergy_orphan: 0.6 },
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
    commitmentBoost: { state: 20, office: 12, house: 8, domain: 5, ideology: 5 },
    stratumMultiplier: { high_noble: 1.2, gentry: 1.1, royal: 1.15 },
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
    }
  }
}

/** Era-style display labels for a commitment kind under a given form. */
export function getCommitmentDisplayLabel(kind: CommitmentKind, formName?: string, form?: string): string {
  const pack = getFormPack(formName, form);
  return pack.commitmentLabels?.[kind] ?? kind;
}

export function listFormPacks(): FormPack[] {
  return Object.values(PACKS);
}
