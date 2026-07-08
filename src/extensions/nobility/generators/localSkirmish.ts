import { buildSeaRouteGraph, findSeaRouteDistance } from "../../../generators/seaRouteGraph";
import type { ChronicleEvent, MilitaryRegiment, State } from "../../../types/models";
import { getWorldContext } from "../nobilityContext";
import type { Character } from "./characterTypes";
import { commanderPowerMultiplier } from "./localDefense";

/**
 * Force-ratio threshold above which a front-line commander annihilates a weak, isolated
 * enemy detachment on their own initiative, without waiting for the state-level tension
 * clock (strategic-planner.ts) to reach a formal war declaration. Deliberately higher
 * than the field-battle attack ratio used for planned sieges — this only fires for
 * outright massacres (a handful of survivors facing an army), not close fights, since
 * those remain the sovereign's call.
 */
const ANNIHILATION_RATIO = 3;

/** Distance (map units) within which two hostile land regiments are considered in direct contact. */
const SKIRMISH_CONTACT_RADIUS = 150;

/**
 * Sea-route distance within which a pair involving a fleet is considered in direct contact.
 * Wider than the land radius — ships close distance along a charted lane faster than
 * infantry on foot — but narrower than a fleet's full reinforcement range (see
 * REINFORCEMENT_RADIUS.naval in localDefense.ts), since "in contact" means an imminent
 * clash, not merely "could eventually arrive". See docs/plan/naval-sea-lanes.md §2.4.
 */
const NAVAL_SKIRMISH_CONTACT_RADIUS = 400;

function logSkirmish(loserState: State, winnerState: State, loserBurgName: string | undefined) {
  const { pack } = getWorldContext();
  let chronicle = pack.states[0].diplomacy;
  if (!chronicle) chronicle = [];

  const event: ChronicleEvent = {
    id: `skirmish-${winnerState.i}-${loserState.i}-${Date.now()}`,
    yearsAgo: 0,
    from: winnerState.i,
    to: loserState.i,
    action: "annihilated an isolated detachment",
    rawText: loserBurgName
      ? `${winnerState.name} annihilated an isolated ${loserState.name} detachment and took ${loserBurgName}.`
      : `${winnerState.name} annihilated an isolated ${loserState.name} detachment.`
  };

  pack.states[0].diplomacy = [[`Skirmish: ${winnerState.name} vs ${loserState.name}`, event], ...chronicle];
}

/** Wipes out `loser`, applies light attrition to `winner`, and hands over any burg the loser was garrisoning. */
function annihilate(loser: MilitaryRegiment, winner: MilitaryRegiment, loserState: State, winnerState: State): void {
  const { pack } = getWorldContext();

  console.warn(
    `⚔️ LOCAL SKIRMISH: ${winnerState.name}'s ${winner.name} annihilated ${loserState.name}'s isolated ${loser.name} (${loser.a} troops) without waiting for orders.`
  );

  loser.a = 0;
  // A hopelessly lopsided fight is still a fight — the winner takes light attrition.
  winner.a = Math.max(1, Math.floor(winner.a * 0.97));

  const loserBurg = pack.burgs.find(b => !b.removed && b.state === loserState.i && b.cell === loser.cell);
  if (loserBurg) {
    loserBurg.state = winnerState.i;
    for (let i = 0; i < pack.cells.burg.length; i++) {
      if (pack.cells.burg[i] === loserBurg.i) {
        pack.cells.state[i] = winnerState.i;
      }
    }
    console.warn(`🏆 ${loserBurg.name} falls with its garrison to ${winnerState.name}.`);
  }

  logSkirmish(loserState, winnerState, loserBurg?.name);
}

export class LocalSkirmishGenerator {
  /**
   * Scans every pair of states already at declared war ("Enemy" diplomacy — this never
   * starts a war on its own, only executes one already underway) for regiments standing
   * close enough to be in direct contact. When one side's local force is overwhelmingly
   * stronger, that detachment is wiped out immediately — modeling local initiative, as
   * opposed to strategic-planner.ts's slow, centrally-gated sieges.
   */
  resolve(): boolean {
    const { pack } = getWorldContext();
    const states = pack.states.filter(s => s.i && !s.removed);
    const characters: Character[] = pack.characters || [];
    const seaRouteGraph = buildSeaRouteGraph(pack);
    let skirmishOccurred = false;

    for (const stateA of states) {
      const regimentsA = stateA.military || [];
      if (!regimentsA.length) continue;

      for (const stateB of states) {
        if (stateB.i <= stateA.i) continue; // each unordered pair once
        if (stateA.diplomacy?.[stateB.i] !== "Enemy") continue;

        const regimentsB = stateB.military || [];
        if (!regimentsB.length) continue;

        for (const regA of regimentsA) {
          if (regA.a <= 0) break;

          for (const regB of regimentsB) {
            if (regB.a <= 0) continue;

            let inContact: boolean;
            if (regA.n || regB.n) {
              // At least one side is a fleet — contact requires an actual charted sea route
              // between their positions; open, uncharted water is not a safe place for
              // either side to close to boarding/melee range (docs/plan/naval-sea-lanes.md).
              const routeDist = findSeaRouteDistance(seaRouteGraph, regA.cell, regB.cell);
              inContact = routeDist !== null && routeDist <= NAVAL_SKIRMISH_CONTACT_RADIUS;
            } else {
              const dist = Math.hypot(regA.x - regB.x, regA.y - regB.y);
              inContact = dist <= SKIRMISH_CONTACT_RADIUS;
            }
            if (!inContact) continue;

            const powerA = regA.a * commanderPowerMultiplier(characters, regA);
            const powerB = regB.a * commanderPowerMultiplier(characters, regB);

            if (powerA >= powerB * ANNIHILATION_RATIO) {
              annihilate(regB, regA, stateB, stateA);
              skirmishOccurred = true;
            } else if (powerB >= powerA * ANNIHILATION_RATIO) {
              annihilate(regA, regB, stateA, stateB);
              skirmishOccurred = true;
              break; // regA is gone, stop matching it against the rest of stateB's regiments
            }
          }
        }
      }
    }

    return skirmishOccurred;
  }
}

export const LocalSkirmish = new LocalSkirmishGenerator();
