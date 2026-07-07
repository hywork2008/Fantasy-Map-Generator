import { type StrategicGoal, simulationContext } from "../../../context/simulationContext";
import { analyzeFrontiers } from "../../../generators/frontierAnalysis";
import { useOptionsState } from "../../../store/optionsState";
import { getWorldContext } from "../nobilityContext";
import { BattleResolutionGenerator } from "./battle-resolution";
import { estimateLocalDefendingForce } from "./localDefense";

/**
 * Attack-force multiplier required over the perceived defense. A fortified target
 * (citadel or walls) needs the classic 3x siege ratio; an unfortified town in the open
 * only needs a solid numerical edge — sieging doctrine doesn't apply to field battles.
 */
const FORTIFIED_ATTACK_RATIO = 3;
const FIELD_ATTACK_RATIO = 1.3;

export class StrategicPlannerGenerator {
  generate() {
    const { pack, options } = getWorldContext();
    const states = pack.states.filter(s => s.i && !s.removed);
    const burgs = pack.burgs.filter(b => b.i && !b.removed);
    const characters = pack.characters || [];

    // Analyze frontiers to find borders
    const frontiers = analyzeFrontiers(pack, options.year || simulationContext.currentYear);

    // Make sure strategicGoals is initialized
    simulationContext.strategicGoals = simulationContext.strategicGoals || {};

    for (const attacker of states) {
      if (!simulationContext.strategicGoals[attacker.i]) {
        simulationContext.strategicGoals[attacker.i] = [];
      }

      // Attacker ruler personality
      const ruler = characters.find(c => c.i === attacker.rulerId);
      const boldness = ruler?.personality.boldness ?? 50;
      const caution = 100 - boldness;

      // Get perceived intelligence
      const attackerIntel = simulationContext.intelligence[attacker.i] || {};

      const segments = frontiers.get(attacker.i);
      if (!segments) continue;

      // Calculate global power just for deterrence, but we'll calculate local power for the attack
      const globalAttackerPower = attacker.military?.reduce((sum, reg) => sum + (reg.a || 0), 0) || 0;

      for (const segment of segments) {
        const targetStateId = segment.neighborState;
        const targetState = pack.states[targetStateId];
        if (!targetState) continue;

        // Only plan against Rivals or Enemies for now, or if bold and massive power difference
        if (segment.threatWeight < 0.5) continue;

        const intel = attackerIntel[targetStateId];
        if (!intel) continue; // No intel? can't plan

        // Find the frontier burg to target.
        let targetBurg = -1;
        let minDist = Infinity;
        const targetBurgsOnLandmass = burgs.filter(
          b => b.state === targetStateId && pack.cells.f[b.cell] === segment.landmass
        );

        for (const b of targetBurgsOnLandmass) {
          const dist = Math.hypot(b.x - segment.cx, b.y - segment.cy);
          if (dist < minDist && b.i !== undefined) {
            minDist = dist;
            targetBurg = b.i;
          }
        }

        if (targetBurg === -1) continue;

        // Calculate local attacker power (troops on same landmass or close enough)
        const targetLandmass = pack.cells.f[pack.burgs[targetBurg].cell];
        let localAttackerPower = 0;
        for (const regiment of attacker.military || []) {
          if (regiment.a <= 0) continue;

          const regimentCell = pack.cells.i.find(
            (_, i) => pack.cells.p[i][0] === regiment.x && pack.cells.p[i][1] === regiment.y
          );
          const regimentLandmass = regimentCell !== undefined ? pack.cells.f[regimentCell] : -1;
          const dist = Math.hypot(regiment.x - pack.burgs[targetBurg].x, regiment.y - pack.burgs[targetBurg].y);

          if (regimentLandmass === targetLandmass || dist < 300) {
            localAttackerPower += regiment.a;
          }
        }

        // Check retreat path (are they cornered?)
        const isCornered = targetBurgsOnLandmass.length === 1;

        // Calculate required force from the burg's actual local defenders (garrison +
        // nearby regiments), not the defending state's entire national military — a
        // state's total army is usually many times larger than what a single border
        // town can muster, and using it here made every burg look impregnable
        // regardless of how it was actually defended.
        const targetBurgData = pack.burgs[targetBurg];
        const perceivedDefense = estimateLocalDefendingForce(pack, targetBurgData, characters);

        // Fortified targets (citadel/walls) need the classic 3x siege ratio; an
        // unfortified town in the open only needs a solid numerical edge.
        const isFortified = !!(targetBurgData?.citadel || targetBurgData?.walls);
        let requiredAttackForce = perceivedDefense * (isFortified ? FORTIFIED_ATTACK_RATIO : FIELD_ATTACK_RATIO);

        let expectedCasualties: StrategicGoal["expectedCasualties"] = "moderate";
        if (isCornered) {
          expectedCasualties = "high_cornered";
          requiredAttackForce *= 2; // Need overwhelming force to crush a fight-to-the-death
        } else if (boldness > 70) {
          expectedCasualties = "low"; // Bold rulers are optimistic
        }

        // Win Condition
        let willingToAttack = false;
        if (localAttackerPower >= requiredAttackForce) {
          willingToAttack = true;
        } else if (boldness > 80 && localAttackerPower >= requiredAttackForce * 0.6) {
          // Bold rulers might risk it with less than optimal force
          willingToAttack = true;
        }

        if (!willingToAttack) continue;

        // Deterrence Condition
        const remainingForce = globalAttackerPower - requiredAttackForce;
        let surroundingThreat = 0;

        segments.forEach(otherSeg => {
          if (otherSeg.neighborState !== targetStateId && otherSeg.threatWeight >= 0.2) {
            const otherIntel = attackerIntel[otherSeg.neighborState];
            if (otherIntel) {
              surroundingThreat += otherIntel.estimatedMilitaryPower;
            }
          }
        });

        const requiredDeterrence = caution > 70 ? surroundingThreat / 2 : surroundingThreat / 3;

        if (remainingForce < requiredDeterrence) {
          continue; // Can't attack because rear is vulnerable
        }

        // Both conditions met! Generate or update goal
        const existingGoal = simulationContext.strategicGoals[attacker.i].find(g => g.targetBurg === targetBurg);
        if (!existingGoal) {
          simulationContext.strategicGoals[attacker.i].push({
            targetBurg,
            targetState: targetStateId,
            type: "siege",
            tension: 10 + Math.random() * 20,
            expectedCasualties,
            justification: isCornered ? "overwhelming_force_crush" : "border_expansion"
          });
        }
      }
    }
  }

  public advanceTension(): boolean {
    const { strategicGoals } = simulationContext;
    const { pack } = getWorldContext();
    const characters = pack.characters || [];
    let warOccurred = false;

    // War frequency modifier from options (default 1.0)
    // 0.0 means no war. 2.0 means double speed.
    const frequencyMultiplier = useOptionsState.getState().warFrequency ?? 1.0;

    for (const stateIdStr in strategicGoals) {
      const stateId = Number(stateIdStr);
      const goals = strategicGoals[stateId];
      if (!goals) continue;

      const state = pack.states[stateId];
      if (!state) continue;

      // Attacker ruler personality
      const ruler = characters.find(c => c.i === state.rulerId);
      const boldness = ruler?.personality.boldness ?? 50;

      // Filter out goals that are no longer valid (e.g., target already captured)
      const validGoals = [];

      for (const goal of goals) {
        // If the target burg is already owned by the state, the goal is achieved/invalid
        if (pack.burgs[goal.targetBurg]?.state === stateId) {
          continue; // Goal accomplished or invalid, drop it
        }

        // Tension calculation
        // Base increment per year: +1 to +5 based on boldness
        const baseIncrement = 1 + boldness / 25;
        // Add random noise so they don't all progress identically
        const noise = Math.random() * 4;

        goal.tension += (baseIncrement + noise) * frequencyMultiplier;

        if (goal.tension >= 100) {
          if (state.diplomacy) {
            state.diplomacy[goal.targetState] = "Enemy";
          }
          const target = pack.states[goal.targetState];
          if (target?.diplomacy) {
            target.diplomacy[stateId] = "Enemy";
          }
          const burgName = pack.burgs[goal.targetBurg]?.name || "Unknown City";
          console.warn(
            `⚔️ WAR DECLARED: State ${state.name} has laid siege to ${burgName} of State ${target?.name}! (Expected Casualties: ${goal.expectedCasualties})`
          );

          // Resolve the siege
          BattleResolutionGenerator.resolveSiege(goal, stateId);

          // Once war is triggered, this specific goal is "consumed"
          // We don't add it to validGoals, so it gets removed
          warOccurred = true;
        } else {
          // Keep the goal
          validGoals.push(goal);
        }
      }

      // Keep only valid and unresolved goals
      strategicGoals[stateId] = validGoals;
    }
    return warOccurred;
  }
}

export const StrategicPlanner = new StrategicPlannerGenerator();
