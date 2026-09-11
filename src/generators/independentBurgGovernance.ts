import type {
  Burg,
  Culture,
  IndependentBurgFaction,
  IndependentBurgGovernance,
  IndependentGovernanceForm,
  State
} from "../types/models";

export interface GovernanceFormWeights {
  autocracy: number;
  patrician_council: number;
  free_commune: number;
}

/**
 * Determines the governance form of an independent/neutral burg based on its
 * economic role, size, and defensive attributes.
 */
export function determineGovernanceForm(burg: Burg, _culture?: Culture): IndependentGovernanceForm {
  const population = burg.population ?? 0;
  const isPort = Boolean(burg.port);
  const hasPlaza = Boolean(burg.plaza);
  const isFortified = Boolean(burg.citadel || (burg.walls && burg.walls > 1));

  // Big merchant port / trade crossroads tend towards a patrician merchant council
  if (isPort && (population >= 4000 || burg.market)) {
    return "patrician_council";
  }

  // Large urban populations with civic centers favor a representative commune
  if (population >= 8000 || (population >= 5000 && hasPlaza && !isFortified)) {
    return "free_commune";
  }

  // Heavily fortified strongholds or smaller frontier settlements lean autocratic
  if (isFortified || population < 4000) {
    return "autocracy";
  }

  // Balanced fallback: large communes or mercantile councils based on port
  return isPort ? "patrician_council" : "free_commune";
}

/**
 * Calculates a burg's willingness to resist foreign military subjugation (0–100).
 * High walls, citadels, masonry quality, and large urban population boost resolve.
 */
export function calculateDefenseResolve(burg: Burg): number {
  let resolve = 30; // baseline resolve

  // Walls and citadel give massive defensive confidence
  if (burg.citadel) resolve += 25;
  if (burg.walls) resolve += Math.min(25, burg.walls * 10);

  // Fortification quality (0..100, default 50)
  const fortQuality = burg.fortificationQuality ?? 50;
  resolve += Math.round((fortQuality - 50) * 0.2); // -10 to +10

  // Population scale gives collective militia confidence
  const pop = burg.population ?? 0;
  if (pop >= 10000) resolve += 15;
  else if (pop >= 5000) resolve += 10;
  else if (pop < 2000) resolve -= 10;

  return Math.max(10, Math.min(95, resolve));
}

export interface InitializeGovernanceOptions {
  neighborStateIds?: number[];
  initialRulerId?: number;
  initialCouncilIds?: number[];
}

/**
 * Initializes the full IndependentBurgGovernance struct for an independent burg.
 */
export function initializeIndependentBurgGovernance(
  burg: Burg,
  culture?: Culture,
  options?: InitializeGovernanceOptions
): IndependentBurgGovernance {
  const form = determineGovernanceForm(burg, culture);
  const defenseResolve = calculateDefenseResolve(burg);
  const neighborStates = options?.neighborStateIds ?? [];

  // Seed initial political factions:
  // 1. Strict Independentist / Isolationist faction (targetStateId = 0)
  // 2. Pro-neighbor factions (targetStateId = neighborStateId)
  const factions: IndependentBurgFaction[] = [];

  let independentWeight = 50;
  if (form === "free_commune") independentWeight += 20; // Communes fiercely value freedom
  if (form === "autocracy" && burg.citadel) independentWeight += 15; // Warlords hold their castle
  if (form === "patrician_council") independentWeight -= 10; // Merchants are pragmatic

  factions.push({
    targetStateId: 0,
    weight: Math.max(20, Math.min(80, independentWeight)),
    label: "Sovereignty League"
  });

  const remainingWeight = 100 - factions[0].weight;
  if (neighborStates.length > 0) {
    const share = Math.floor(remainingWeight / neighborStates.length);
    for (let i = 0; i < neighborStates.length; i++) {
      const stateId = neighborStates[i];
      factions.push({
        targetStateId: stateId,
        weight: i === neighborStates.length - 1 ? remainingWeight - share * (neighborStates.length - 1) : share,
        label: `League of Concordance (${stateId})`
      });
    }
  } else {
    // If no neighbors known, independentist faction holds 100%
    factions[0].weight = 100;
  }

  return {
    form,
    rulerCharacterId: options?.initialRulerId,
    councilCharacterIds: options?.initialCouncilIds,
    factions,
    stances: {},
    autonomyStatus: "full_independent",
    defenseResolve
  };
}

/**
 * Initializes and populates governance and diplomatic stances for all independent
 * burgs (burg.state === 0) on the map.
 */
export function populateAllIndependentBurgs(world: {
  pack: {
    burgs: Burg[];
    states: State[];
    cells: { c: number[][]; state: { [key: number]: number }; p?: [number, number][] };
    cultures: Culture[];
  };
}): void {
  const { burgs, states, cells, cultures } = world.pack;
  if (!burgs?.length) return;

  for (const burg of burgs) {
    if (!burg.i || burg.removed || burg.state) continue;

    // Detect neighboring states sharing borders with this cell or adjacent cells
    const neighborStateSet = new Set<number>();
    const adjacentCells = cells.c[burg.cell] ?? [];

    for (const c of adjacentCells) {
      const s = cells.state[c];
      if (s && s > 0 && !states[s]?.removed) {
        neighborStateSet.add(s);
      }
      // Check 2-hop neighbors if 1-hop is purely wild/empty
      for (const c2 of cells.c[c] ?? []) {
        const s2 = cells.state[c2];
        if (s2 && s2 > 0 && !states[s2]?.removed) {
          neighborStateSet.add(s2);
        }
      }
    }

    const neighborStateIds = Array.from(neighborStateSet);
    const culture = burg.culture !== undefined ? cultures[burg.culture] : undefined;

    burg.independentGovernance = initializeIndependentBurgGovernance(burg, culture, {
      neighborStateIds
    });
  }
}
