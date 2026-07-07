import { type StrategicGoal, simulationContext } from "../../../context/simulationContext";
import { analyzeFrontiers } from "../../../generators/frontierAnalysis";
import { getWorldContext } from "../nobilityContext";
import { BattleResolutionGenerator } from "./battle-resolution";

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

      // Attacker's perceived own power (which is actual power)
      const attackerPower = attacker.military?.reduce((sum, reg) => sum + (reg.a || 0), 0) || 0;

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

        // Check retreat path (are they cornered?)
        const isCornered = targetBurgsOnLandmass.length === 1;

        // Calculate required force
        const baseDefendingForce = intel.estimatedMilitaryPower;
        let perceivedDefense = isCornered ? baseDefendingForce : baseDefendingForce * 0.5;

        // Citadel bonus
        const targetBurgData = pack.burgs[targetBurg];
        if (targetBurgData?.citadel) {
          perceivedDefense *= 1.5;
        }

        let requiredAttackForce = perceivedDefense * 3; // The 3x Attacker Rule

        let expectedCasualties: StrategicGoal["expectedCasualties"] = "moderate";
        if (isCornered) {
          expectedCasualties = "high_cornered";
          requiredAttackForce *= 2; // Need overwhelming force to crush a fight-to-the-death
        } else if (boldness > 70) {
          expectedCasualties = "low"; // Bold rulers are optimistic
        }

        // Win Condition
        let willingToAttack = false;
        if (attackerPower >= requiredAttackForce) {
          willingToAttack = true;
        } else if (boldness > 80 && attackerPower >= requiredAttackForce * 0.6) {
          // Bold rulers might risk it with less than optimal force
          willingToAttack = true;
        }

        if (!willingToAttack) continue;

        // Deterrence Condition
        const remainingForce = attackerPower - requiredAttackForce;
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
            tension: 10,
            expectedCasualties,
            justification: isCornered ? "overwhelming_force_crush" : "border_expansion"
          });
        }
      }
    }
  }

  advanceTension() {
    const { pack } = getWorldContext();
    for (const stateIdStr in simulationContext.strategicGoals) {
      const stateId = Number(stateIdStr);
      const goals = simulationContext.strategicGoals[stateId];
      if (!goals) continue;

      for (const goal of goals) {
        goal.tension += 5; // Takes roughly 18 ticks to start a war if uninterrupted

        if (goal.tension >= 100) {
          const state = pack.states[stateId];
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

          // Reset tension or remove goal
          goal.tension = 0;
        }
      }
    }
  }
}

export const StrategicPlanner = new StrategicPlannerGenerator();
