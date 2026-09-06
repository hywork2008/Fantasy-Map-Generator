import type { Character, TitleHolding } from "../../characters/characterTypes";
import { simulationContext } from "../../hostCore";
import type { State } from "../../hostTypes";
import { mayAdvanceAutonomousConflict } from "../conflictDirector";
import { hasNobilityContext, setRulerId } from "../nobilityContext";

export const MILITARY_COUP_REASON = "Deposed by military coup";
export const SEIZED_THRONE_REASON = "Seized the throne";

const PROVOKE_RANK: Record<string, number> = {
  Rival: 4,
  Suspicion: 3,
  Neutral: 2,
  Unknown: 1
};

function closeStateOffice(character: Character, title: TitleHolding, reason: string): void {
  character.pastTitles.push({ ...title, endYear: title.startYear, reason });
  const index = character.titles.indexOf(title);
  if (index >= 0) character.titles.splice(index, 1);
}

function stripLandedStateTitle(character: Character, stateId: number, reason: string): TitleHolding | undefined {
  for (let i = character.titles.length - 1; i >= 0; i--) {
    const title = character.titles[i];
    if (title?.entityType !== "state" || title.entityId !== stateId || !title.landed) continue;
    character.pastTitles.push({ ...title, endYear: title.startYear, reason });
    character.titles.splice(i, 1);
    return title;
  }
  return undefined;
}

/** Install the marshal as ruler. Returns false when there is no separate living monarch. */
export function tryMilitaryCoup(args: {
  marshal: Character;
  ruler: Character | undefined;
  state: State;
  marshalTitle: TitleHolding;
}): boolean {
  const { marshal, ruler, state, marshalTitle } = args;
  if (!ruler || ruler.dead || ruler.i === marshal.i || !state.i) return false;
  if (!ruler.titles.some(t => t.landed && t.entityType === "state" && t.entityId === state.i)) return false;

  const landed = stripLandedStateTitle(ruler, state.i, MILITARY_COUP_REASON);
  closeStateOffice(marshal, marshalTitle, SEIZED_THRONE_REASON);
  marshal.titles.push({
    title: landed?.title || "Ruler",
    landed: true,
    entityType: "state",
    entityId: state.i,
    startYear: landed?.startYear
  });
  setRulerId(state, marshal.i);
  return true;
}

function pickProvokeTarget(state: State, states: readonly State[]): number | undefined {
  if (!state.i) return undefined;
  const diplomacy = state.diplomacy ?? [];
  let bestId: number | undefined;
  let bestRank = 0;

  const consider = (id: number, rel: string | undefined) => {
    if (!id || id === state.i) return;
    const other = states[id];
    if (!other || other.removed) return;
    const rank = PROVOKE_RANK[rel ?? "Neutral"] ?? 0;
    if (rank > bestRank) {
      bestRank = rank;
      bestId = id;
    }
  };

  diplomacy.forEach((rel, id) => {
    consider(id, rel);
  });
  for (const id of state.neighbors ?? []) {
    consider(id, diplomacy[id] ?? "Neutral");
  }
  return bestId;
}

function ensureDiplomacy(state: State): string[] {
  if (!state.diplomacy) state.diplomacy = [];
  return state.diplomacy;
}

/**
 * Manufacture an interstate war so the idle hawk has a fight. No-ops under
 * player-directed conflict policy, or when every neighbor is already allied or at war.
 */
export function tryProvokeWar(args: { state: State; states: readonly State[] }): boolean {
  const { state, states } = args;
  if (!state.i) return false;
  if (hasNobilityContext() && !mayAdvanceAutonomousConflict()) return false;

  const targetId = pickProvokeTarget(state, states);
  if (targetId === undefined) return false;
  const target = states[targetId];
  if (!target) return false;

  ensureDiplomacy(state)[targetId] = "Enemy";
  ensureDiplomacy(target)[state.i] = "Enemy";

  try {
    if (!simulationContext.strategicGoals) simulationContext.strategicGoals = {};
    const goals = simulationContext.strategicGoals;
    if (!goals[state.i]) goals[state.i] = [];
    const list = goals[state.i];
    const existing = list.find(goal => goal.targetState === targetId);
    if (existing) {
      existing.tension = Math.max(existing.tension, 70);
      existing.justification = "marshal_provocation";
    } else {
      const burg = target.capital;
      list.push({
        targetBurg: typeof burg === "number" ? burg : 0,
        targetState: targetId,
        type: "siege",
        tension: 70,
        expectedCasualties: "low",
        justification: "marshal_provocation",
        requiredAttackForce: 0
      });
    }
  } catch {
    // Diplomacy change is enough for the planner to pick up next tick.
  }

  return true;
}
