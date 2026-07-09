import { appServices } from "../../../context/appServices";
import type { StrategicGoal } from "../../../context/simulationContext";
import { buildSeaRouteGraph } from "../../../generators/seaRouteGraph";
import type { ChronicleEvent } from "../../../types/models";
import type { Character } from "../../characters/characterTypes";
import { getWorldContext } from "../nobilityContext";
import {
  calculateEffectiveSiegePower,
  captureBurg,
  commanderPowerMultiplier,
  regimentDistanceTo,
  regimentReinforcementRadius
} from "./localDefense";

/** Living character holding `title` for `stateId`, e.g. the state's Spymaster. */
function findOfficeHolder(characters: Character[], stateId: number, title: string): Character | undefined {
  return characters.find(
    c => !c.dead && c.titles.some(t => t.entityType === "state" && t.entityId === stateId && t.title === title)
  );
}

export const BattleResolutionGenerator = {
  resolveSiege(goal: StrategicGoal, attackerId: number) {
    const { pack, options } = getWorldContext();
    const attackerState = pack.states[attackerId];
    const targetState = pack.states[goal.targetState];
    const targetBurg = pack.burgs[goal.targetBurg];
    const characters = pack.characters || [];
    const militaryOptions = options.military || [];

    if (!attackerState || !targetState || !targetBurg) return;

    const isFortified = !!(targetBurg.citadel || targetBurg.walls);
    const seaRouteGraph = buildSeaRouteGraph(pack);

    // 1. Detection Phase (Spymaster vs Spymaster)
    const attackerSpymaster =
      findOfficeHolder(characters, attackerId, "Spymaster") ?? characters.find(c => c.i === attackerState.rulerId);
    const defenderSpymaster =
      findOfficeHolder(characters, goal.targetState, "Spymaster") ?? characters.find(c => c.i === targetState.rulerId);

    const attackerGuile = attackerSpymaster?.skills.intrigue ?? 50;
    const defenderGuile = defenderSpymaster?.skills.intrigue ?? 50;

    const attackerRoll = appServices.rng.rand() * 100 + attackerGuile;
    const defenderRoll = appServices.rng.rand() * 100 + defenderGuile;

    const isSurpriseAttack = attackerRoll > defenderRoll;

    // 2. Response Time Logic
    let defendingForceArrived = 0;
    const defendingRegiments = targetState.military || [];

    // We assume city garrison is always there
    const cityGarrison = (targetBurg.population || 0) * 0.05; // 5% of pop as militia
    defendingForceArrived += cityGarrison;

    for (const regiment of defendingRegiments) {
      if (regiment.a <= 0) continue;

      let arrives = false;
      if (!isSurpriseAttack) {
        // Early detection: everyone arrives
        arrives = true;
      } else {
        // Surprise Attack: Check distance, using the reinforcement radius appropriate to the
        // regiment's unit composition (cavalry can cover more ground; naval regiments are
        // checked by charted sea-route distance instead of straight-line).
        const dist = regimentDistanceTo(regiment, targetBurg.cell, targetBurg.x, targetBurg.y, seaRouteGraph);
        if (dist !== null && dist <= regimentReinforcementRadius(regiment)) {
          arrives = true;
        }
      }

      if (arrives) {
        defendingForceArrived += regiment.a * commanderPowerMultiplier(characters, regiment);
      }
    }

    // 3. Attacker Force
    // Prevent "teleporting" military power. Land regiments only count if they're on the
    // target's own landmass (they can't cross open water on their own). Naval regiments
    // (fleets, which also carry any embarked marines — see military-generator.ts's
    // marine-embark logic) count only if a charted sea route actually reaches the target
    // port; see docs/plan/naval-sea-lanes.md.
    let attackerPower = 0;
    const attackingRegiments = [];

    for (const regiment of attackerState.military || []) {
      if (regiment.a <= 0) continue;

      let reachable: boolean;
      if (regiment.n) {
        // FUTURE: Naval invasions across the sea
        reachable = false;
      } else {
        // No teleporting: attackers must physically march to within reinforcement radius of the target
        const dist = Math.hypot(regiment.x - targetBurg.x, regiment.y - targetBurg.y);
        reachable = dist <= regimentReinforcementRadius(regiment);
      }

      if (reachable) {
        const effectivePower = calculateEffectiveSiegePower(regiment, isFortified, militaryOptions);
        attackerPower += effectivePower * commanderPowerMultiplier(characters, regiment);
        regiment.actionStatus = "battled";
        attackingRegiments.push(regiment);
      }
    }

    // 4. Resolution
    let attackerCasualties = 0;
    let defenderCasualties = 0;
    let cityCaptured = false;

    // A bloodless fall requires the defenders to be caught off-guard (militia only) AND the attackers to be overwhelmingly stronger
    if (defendingForceArrived <= cityGarrison * 1.5 && attackerPower >= Math.max(1, defendingForceArrived) * 1.5) {
      // BLOODLESS FALL: Only the local militia was there, and they surrender to overwhelming force.
      console.warn(
        `⚔️ BLOODLESS FALL! The siege on ${targetBurg.name} was a total surprise. Defenders couldn't arrive in time.`
      );
      attackerCasualties = attackerPower * 0.01; // Minimal losses
      defenderCasualties = 0; // Militia surrenders and joins population
      cityCaptured = true;
    } else {
      // BLOODY SIEGE
      const forceRatio = attackerPower / Math.max(1, defendingForceArrived);
      const requiredRatio = isFortified ? 3.0 : 1.5;

      console.warn(
        `⚔️ BLOODY SIEGE on ${targetBurg.name}! Fortified: ${isFortified}, Force ratio: ${forceRatio.toFixed(2)} (Arrived Defenders: ${Math.floor(defendingForceArrived)})`
      );

      if (goal.expectedCasualties === "high_cornered") {
        // Fight to the death
        cityCaptured = forceRatio >= requiredRatio;
        if (cityCaptured) {
          defenderCasualties = defendingForceArrived; // Defenders wiped out
          if (isFortified) {
            attackerCasualties = defendingForceArrived * Math.max(1.0, 1.5 * (requiredRatio / forceRatio));
          } else {
            attackerCasualties = defendingForceArrived * Math.max(0.5, 0.8 * (requiredRatio / forceRatio));
          }
        } else {
          // Attacker fails despite pushing hard
          defenderCasualties = defendingForceArrived * 0.6;
          attackerCasualties = Math.min(attackerPower, defendingForceArrived * 1.5); // E.g. Defender inflicts heavily
        }
      } else {
        // Standard battle
        if (forceRatio >= requiredRatio) {
          // Attacker wins
          cityCaptured = true;
          if (isFortified) {
            defenderCasualties = defendingForceArrived * 0.6;
            // When ratio is exactly 3.0, attacker casualties = 0.6 * defenderForce (Mutual heavy losses)
            attackerCasualties = defendingForceArrived * Math.max(0.3, 0.6 * (requiredRatio / forceRatio));
          } else {
            defenderCasualties = defendingForceArrived * 0.5;
            attackerCasualties = defendingForceArrived * Math.max(0.15, 0.3 * (requiredRatio / forceRatio));
          }
        } else {
          // Defender holds
          cityCaptured = false;
          if (isFortified) {
            defenderCasualties = defendingForceArrived * 0.2;
            attackerCasualties = Math.min(attackerPower, defendingForceArrived * 1.0); // Attackers break after heavy losses
          } else {
            defenderCasualties = defendingForceArrived * 0.3;
            attackerCasualties = Math.min(attackerPower, defendingForceArrived * 0.8); // Attackers break after heavy losses
          }
        }
      }

      // Ensure attacker casualties don't exceed their total power
      attackerCasualties = Math.min(attackerCasualties, attackerPower);
    }

    // Apply Casualties to Regiments (proportional reduction)
    if (attackerCasualties > 0 && attackingRegiments.length > 0) {
      const reductionRatio = Math.max(0, 1 - attackerCasualties / attackerPower);
      for (const reg of attackingRegiments) {
        let survivors = 0;
        for (const unit in reg.u) {
          reg.u[unit] = Math.floor(reg.u[unit] * reductionRatio);
          survivors += reg.u[unit];
        }
        reg.a = survivors;
      }
    }

    if (defenderCasualties > 0 && targetState.military) {
      // Only reduce regiments that actually arrived
      for (const reg of targetState.military) {
        let arrives = false;
        if (!isSurpriseAttack) arrives = true;
        else {
          const dist = regimentDistanceTo(reg, targetBurg.cell, targetBurg.x, targetBurg.y, seaRouteGraph);
          if (dist !== null && dist <= regimentReinforcementRadius(reg)) arrives = true;
        }

        if (arrives) {
          reg.actionStatus = "battled";
          const reductionRatio = Math.max(0, 1 - defenderCasualties / defendingForceArrived);
          let survivors = 0;
          for (const unit in reg.u) {
            reg.u[unit] = Math.floor(reg.u[unit] * reductionRatio);
            survivors += reg.u[unit];
          }
          reg.a = survivors;
        }
      }
    } else if (targetState.military) {
      // If no casualties but they arrived, we still mark them as battled
      for (const reg of targetState.military) {
        let arrives = false;
        if (!isSurpriseAttack) arrives = true;
        else {
          const dist = regimentDistanceTo(reg, targetBurg.cell, targetBurg.x, targetBurg.y, seaRouteGraph);
          if (dist !== null && dist <= regimentReinforcementRadius(reg)) arrives = true;
        }

        if (arrives) {
          reg.actionStatus = "battled";
        }
      }
    }

    // Handle City Capture
    let actionText = "";
    let rawText = "";

    if (cityCaptured) {
      captureBurg(pack, targetBurg, attackerId);
      console.warn(`🏆 City ${targetBurg.name} has fallen to ${attackerState.name}!`);
      actionText = "captured the city";
      rawText = `${attackerState.name} captured ${targetBurg.name} from ${targetState.name}. Casualties: ~${Math.round(attackerCasualties + defenderCasualties)}.`;
    } else {
      console.warn(`🛡️ City ${targetBurg.name} successfully repelled the siege by ${attackerState.name}.`);
      actionText = "failed to capture the city";
      rawText = `${attackerState.name} failed to capture ${targetBurg.name} from ${targetState.name}. Casualties: ~${Math.round(attackerCasualties + defenderCasualties)}.`;
    }

    // Log to Relations history
    let chronicle = pack.states[0].diplomacy;
    if (!chronicle) {
      chronicle = [];
    }

    const event: ChronicleEvent = {
      id: `siege-${attackerId}-${goal.targetState}-${Date.now()}`,
      yearsAgo: 0,
      from: attackerId,
      to: goal.targetState,
      toBurg: goal.targetBurg,
      action: actionText,
      rawText: rawText
    };

    // Create a new array reference so Zustand recognizes the change
    pack.states[0].diplomacy = [[`Siege of ${targetBurg.name}`, event], ...chronicle];
  }
};
