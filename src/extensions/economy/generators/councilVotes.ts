import { getCharacters, hasCharactersContext } from "../../characters/charactersContext";
import { stateHasEnemy } from "../../hostCore";
import type { State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { CENTRAL_OFFICES } from "../../nobility/data/titleTable";
import { getRulerId } from "../../nobility/nobilityContext";
import { getCouncilSupport } from "./councilAssembly";
import { resolveMoneylenderSyndicate } from "./moneylenders";
import { findLivingOfficeHolder } from "./treasuryAllocation";
import { isWarFootingActive } from "./warFooting";

/**
 * Multi-ledger PR-12 — thin council faction vote simulation.
 *
 * Four blocs (court / merchants / military / clergy) hold share weights that sum ~1.
 * Each budget line gets a per-faction "yes lean"; a motion passes when the weighted yes
 * share clears 50% after support modulation. Not a full assembly sim — only gates and UI.
 */

export type CouncilFaction = "court" | "merchants" | "military" | "clergy";

export type CouncilBudgetLine =
  | "debtIssue"
  | "warFooting"
  | "extraordinaryTax"
  | "militaryExpansion"
  // PR-17f (docs/plan/department-budget-spending-effects.md §4) — department-budget-cut lines.
  // Gates a player's departmentBudgetMultiplier < 1 for that department, not the department
  // itself existing — voting "no" simply keeps the baseline share, it never blocks a boost (>1).
  | "cutChancery"
  | "cutStewardship"
  | "cutSpymastery"
  | "cutEcclesiastica";

export interface CouncilFactionShares {
  court: number;
  merchants: number;
  military: number;
  clergy: number;
}

/** PR-14 per-faction breakdown for UI / session log. */
export interface FactionVoteDetail {
  faction: CouncilFaction;
  share: number;
  /** Raw yes lean 0–1 before support modulation. */
  lean: number;
  /** share × lean contribution before support factor. */
  contribution: number;
}

export interface CouncilVoteResult {
  line: CouncilBudgetLine;
  passed: boolean;
  yesShare: number;
  noShare: number;
  shares: CouncilFactionShares;
  /** PR-14 faction-level vote detail. */
  factionDetails: FactionVoteDetail[];
  notes: string[];
}

/** Form baseline bloc weights (before living-officer / syndicate tweaks). */
export const FACTION_BASE_BY_FORM: Record<string, CouncilFactionShares> = {
  Monarchy: { court: 0.4, merchants: 0.2, military: 0.25, clergy: 0.15 },
  Republic: { court: 0.2, merchants: 0.4, military: 0.2, clergy: 0.2 },
  Theocracy: { court: 0.15, merchants: 0.15, military: 0.15, clergy: 0.55 },
  Union: { court: 0.3, merchants: 0.3, military: 0.25, clergy: 0.15 },
  Anarchy: { court: 0.15, merchants: 0.2, military: 0.55, clergy: 0.1 }
};

const FACTIONS: CouncilFaction[] = ["court", "merchants", "military", "clergy"];

function normalizeShares(raw: CouncilFactionShares): CouncilFactionShares {
  const sum = FACTIONS.reduce((s, f) => s + Math.max(0, raw[f]), 0) || 1;
  return {
    court: rn(Math.max(0, raw.court) / sum, 3),
    merchants: rn(Math.max(0, raw.merchants) / sum, 3),
    military: rn(Math.max(0, raw.military) / sum, 3),
    clergy: rn(Math.max(0, raw.clergy) / sum, 3)
  };
}

/**
 * Resolve current faction weight snapshot for a state.
 */
export function getCouncilFactionShares(state: Pick<State, "i" | "form" | "capital">): CouncilFactionShares {
  const form = state.form || "Monarchy";
  const base = FACTION_BASE_BY_FORM[form] ?? FACTION_BASE_BY_FORM.Monarchy;
  const raw: CouncilFactionShares = { ...base };

  if (state.i && hasCharactersContext()) {
    const characters = getCharacters();
    for (const office of CENTRAL_OFFICES) {
      const holder = findLivingOfficeHolder(characters, state.i, office.title);
      if (!holder) continue;
      if (office.title === "Marshal" || office.title === "Minister of War") raw.military += 0.06;
      else if (office.title === "Court Chaplain") raw.clergy += 0.08;
      else if (office.title === "Steward" || office.title === "Minister of Finance") raw.court += 0.05;
      else if (office.title === "Chancellor" || office.title === "Prime Minister") raw.court += 0.05;
      else raw.court += 0.03;
    }
    const rulerId = getRulerId(state as State);
    if (rulerId !== undefined && characters.some(c => c.i === rulerId && !c.dead)) {
      raw.court += 0.04;
    }
  }

  // Named moneylenders pull merchant weight up with greed / presence.
  const syndicate = resolveMoneylenderSyndicate(state);
  if (syndicate.members.length > 0) {
    raw.merchants += 0.05 + (syndicate.averageGreed / 100) * 0.08;
  }

  if (isWarFootingActive(state as State) || stateHasEnemy(state as State)) {
    raw.military += 0.08;
  }

  return normalizeShares(raw);
}

/**
 * Per-faction probability of voting yes on a budget line (0–1).
 */
export function factionYesLean(
  line: CouncilBudgetLine,
  faction: CouncilFaction,
  state: Pick<State, "form" | "debtInDefault" | "warFooting" | "capital" | "i" | "diplomacy">
): number {
  const atWar = stateHasEnemy(state as State);
  const inDefault = Boolean(state.debtInDefault);
  const greed = resolveMoneylenderSyndicate(state).averageGreed;

  switch (line) {
    case "debtIssue": {
      // Merchants hate default and greedy lenders like higher rates (oppose cheaper terms / more debt when leveraged).
      if (faction === "merchants") return inDefault ? 0.1 : greed > 70 ? 0.35 : 0.55;
      if (faction === "court") return inDefault ? 0.25 : 0.6;
      if (faction === "military") return atWar ? 0.75 : 0.45;
      if (faction === "clergy") return state.form === "Theocracy" ? 0.25 : 0.4;
      return 0.5;
    }
    case "warFooting": {
      if (faction === "military") return 0.85;
      if (faction === "court") return atWar ? 0.7 : 0.4;
      if (faction === "merchants") return atWar ? 0.35 : 0.25;
      if (faction === "clergy") return atWar ? 0.45 : 0.3;
      return 0.5;
    }
    case "extraordinaryTax": {
      if (faction === "merchants") return 0.2;
      if (faction === "court") return atWar ? 0.65 : 0.4;
      if (faction === "military") return atWar ? 0.8 : 0.45;
      if (faction === "clergy") return state.form === "Theocracy" ? 0.55 : 0.35;
      return 0.5;
    }
    case "militaryExpansion": {
      if (faction === "military") return 0.8;
      if (faction === "court") return 0.55;
      if (faction === "merchants") return 0.3;
      if (faction === "clergy") return 0.4;
      return 0.5;
    }
    // PR-17f: each faction's stake in the department being cut, not war/debt posture.
    case "cutChancery": {
      // Diplomacy/law — merchants need it for trade treaties, court runs it day to day.
      if (faction === "merchants") return 0.25;
      if (faction === "court") return 0.35;
      if (faction === "military") return 0.55;
      if (faction === "clergy") return 0.5;
      return 0.5;
    }
    case "cutStewardship": {
      // Administration/tax collection — the faction everyone's commerce and logistics run on.
      if (faction === "merchants") return 0.15;
      if (faction === "court") return 0.2;
      if (faction === "military") return 0.35;
      if (faction === "clergy") return 0.4;
      return 0.5;
    }
    case "cutSpymastery": {
      // The most politically palatable cut — merchants/clergy are more often surveilled by
      // it than protected, so its absence is not universally feared like the others.
      if (faction === "military") return 0.4;
      if (faction === "court") return 0.35;
      if (faction === "merchants") return 0.55;
      if (faction === "clergy") return 0.55;
      return 0.5;
    }
    case "cutEcclesiastica": {
      // Clergy defends its own budget hardest; court's stake scales with how central religion
      // is to the regime's legitimacy (Theocracy far more than the other forms).
      if (faction === "clergy") return 0.05;
      if (faction === "court") return state.form === "Theocracy" ? 0.1 : 0.4;
      if (faction === "military") return 0.55;
      if (faction === "merchants") return 0.55;
      return 0.5;
    }
    default:
      return 0.5;
  }
}

/**
 * Simulate a single budget-line vote. Support modulates yes weight (weak assemblies struggle).
 */
export function simulateCouncilVote(
  state: State,
  line: CouncilBudgetLine,
  shares?: CouncilFactionShares
): CouncilVoteResult {
  const bloc = shares ?? getCouncilFactionShares(state);
  const support = state.councilSupport !== undefined ? state.councilSupport : getCouncilSupport(state).support;
  // support 50 → 1×; 0 → 0.55×; 100 → 1.45× on yes lean (clamped).
  const supportFactor = rn(0.55 + (support / 100) * 0.9, 3);

  let yes = 0;
  const notes: string[] = [];
  const factionDetails: FactionVoteDetail[] = [];
  for (const faction of FACTIONS) {
    const lean = factionYesLean(line, faction, state);
    const contribution = rn(bloc[faction] * lean, 4);
    yes += contribution;
    factionDetails.push({
      faction,
      share: bloc[faction],
      lean: rn(lean, 3),
      contribution
    });
    notes.push(`${faction} lean ${rn(lean, 2)} × share ${bloc[faction]}`);
  }
  yes = rn(Math.max(0, Math.min(1, yes * supportFactor)), 3);
  const no = rn(1 - yes, 3);
  const passed = yes >= 0.5;

  return {
    line,
    passed,
    yesShare: yes,
    noShare: no,
    shares: bloc,
    factionDetails,
    notes
  };
}

/**
 * Persist faction shares + last debt-issue vote (+ PR-14 faction detail) onto the state for UI.
 */
export function refreshCouncilFactionSnapshot(state: State): CouncilFactionShares {
  const shares = getCouncilFactionShares(state);
  state.councilFactionShares = shares;
  const debtVote = simulateCouncilVote(state, "debtIssue", shares);
  state.councilLastDebtVoteYes = debtVote.yesShare;
  state.councilLastVoteFactionDetail = debtVote.factionDetails.map(d => ({
    faction: d.faction,
    share: d.share,
    lean: d.lean,
    contribution: d.contribution
  }));
  // Snapshot all budget-line yes shares for the faction-detail panel.
  state.councilLastLineVotes = {
    debtIssue: debtVote.yesShare,
    warFooting: simulateCouncilVote(state, "warFooting", shares).yesShare,
    extraordinaryTax: simulateCouncilVote(state, "extraordinaryTax", shares).yesShare,
    militaryExpansion: simulateCouncilVote(state, "militaryExpansion", shares).yesShare
  };
  return shares;
}
