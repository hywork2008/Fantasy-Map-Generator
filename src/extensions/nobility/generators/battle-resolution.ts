import type { StrategicGoal } from "../../../context/simulationContext";
import type { ChronicleEvent, MilitaryRegiment } from "../../../types/models";
import { getWorldContext } from "../nobilityContext";
import type { Character } from "./characterTypes";
import { getRegimentCommander } from "./officerAssignment";

/** Living character holding `title` for `stateId`, e.g. the state's Spymaster. */
function findOfficeHolder(characters: Character[], stateId: number, title: string): Character | undefined {
  return characters.find(
    c => !c.dead && c.titles.some(t => t.entityType === "state" && t.entityId === stateId && t.title === title)
  );
}

/**
 * A regiment led by a dedicated officer (see officerAssignment.ts) fights above its raw
 * headcount — up to +50% at Martial 100. Regiments without a commander fight at their
 * plain troop count. This only scales the power total used to decide the battle's outcome;
 * actual casualties below are still applied against real troop counts.
 */
function commanderPowerMultiplier(characters: Character[], regiment: MilitaryRegiment): number {
  const commander = getRegimentCommander(characters, regiment);
  return commander ? 1 + (commander.skills.martial / 100) * 0.5 : 1;
}

export const BattleResolutionGenerator = {
  resolveSiege(goal: StrategicGoal, attackerId: number) {
    const { pack } = getWorldContext();
    const attackerState = pack.states[attackerId];
    const targetState = pack.states[goal.targetState];
    const targetBurg = pack.burgs[goal.targetBurg];
    const characters = pack.characters || [];

    if (!attackerState || !targetState || !targetBurg) return;

    // 1. Detection Phase (Spymaster vs Spymaster)
    const attackerSpymaster =
      findOfficeHolder(characters, attackerId, "Spymaster") ?? characters.find(c => c.i === attackerState.rulerId);
    const defenderSpymaster =
      findOfficeHolder(characters, goal.targetState, "Spymaster") ?? characters.find(c => c.i === targetState.rulerId);

    const attackerGuile = attackerSpymaster?.skills.intrigue ?? 50;
    const defenderGuile = defenderSpymaster?.skills.intrigue ?? 50;

    const attackerRoll = Math.random() * 100 + attackerGuile;
    const defenderRoll = Math.random() * 100 + defenderGuile;

    const isSurpriseAttack = attackerRoll > defenderRoll;

    // 2. Response Time Logic
    let defendingForceArrived = 0;
    const defendingRegiments = targetState.military || [];

    // We assume city garrison is always there
    const cityGarrison = (targetBurg.population || 0) * 0.05; // 5% of pop as militia
    defendingForceArrived += cityGarrison;

    const cavalryRadius = 300;
    const infantryRadius = 100;

    for (const regiment of defendingRegiments) {
      if (regiment.a <= 0) continue;

      let arrives = false;
      if (!isSurpriseAttack) {
        // Early detection: everyone arrives
        arrives = true;
      } else {
        // Surprise Attack: Check distance
        const dist = Math.hypot(regiment.x - targetBurg.x, regiment.y - targetBurg.y);

        // Check unit composition (simplified)
        // If regiment has mostly cavalry (e.g. u.cavalry > u.infantry), use cavalry radius
        const cavalryCount = (regiment.u?.cavalry || 0) + (regiment.u?.["light cavalry"] || 0);
        const infantryCount = (regiment.u?.infantry || 0) + (regiment.u?.archers || 0);

        const isCavalryHeavy = cavalryCount > infantryCount;
        const radius = isCavalryHeavy ? cavalryRadius : infantryRadius;

        if (dist <= radius) {
          arrives = true;
        }
      }

      if (arrives) {
        defendingForceArrived += regiment.a * commanderPowerMultiplier(characters, regiment);
      }
    }

    // 3. Attacker Force
    // Prevent "teleporting" global military power. Only count regiments that are on the same landmass
    // or within a reasonable invasion distance (e.g. 1000 units).
    let attackerPower = 0;
    const attackingRegiments = [];
    const targetLandmass = pack.cells.f[targetBurg.cell];

    for (const regiment of attackerState.military || []) {
      if (regiment.a <= 0) continue;

      const regimentCell = pack.cells.i.find(
        (_, i) => pack.cells.p[i][0] === regiment.x && pack.cells.p[i][1] === regiment.y
      );
      const regimentLandmass = regimentCell !== undefined ? pack.cells.f[regimentCell] : -1;

      const dist = Math.hypot(regiment.x - targetBurg.x, regiment.y - targetBurg.y);

      // If they are on the same landmass, they can march. Or if they are very close (e.g., naval invasion across a strait).
      if (regimentLandmass === targetLandmass || dist < 300) {
        attackerPower += regiment.a * commanderPowerMultiplier(characters, regiment);
        attackingRegiments.push(regiment);
      }
    }

    // 4. Resolution
    let attackerCasualties = 0;
    let defenderCasualties = 0;
    let cityCaptured = false;

    if (defendingForceArrived <= cityGarrison * 1.5) {
      // BLOODLESS FALL: Only the local militia was there. They surrender.
      console.warn(
        `⚔️ BLOODLESS FALL! The siege on ${targetBurg.name} was a total surprise. Defenders couldn't arrive in time.`
      );
      attackerCasualties = attackerPower * 0.01; // Minimal losses
      defenderCasualties = 0; // Militia surrenders and joins population
      cityCaptured = true;
    } else {
      // BLOODY SIEGE
      const forceRatio = attackerPower / Math.max(1, defendingForceArrived);
      console.warn(
        `⚔️ BLOODY SIEGE on ${targetBurg.name}! Force ratio: ${forceRatio.toFixed(2)} (Arrived Defenders: ${Math.floor(defendingForceArrived)})`
      );

      if (goal.expectedCasualties === "high_cornered") {
        // Fight to the death
        defenderCasualties = defendingForceArrived; // Wipe out defenders
        attackerCasualties = attackerPower * 0.4; // Horrific attacker losses
        cityCaptured = attackerPower > defendingForceArrived * 1.5;
      } else {
        // Standard battle
        if (forceRatio > 1.5) {
          // Attacker wins
          cityCaptured = true;
          defenderCasualties = defendingForceArrived * 0.5;
          attackerCasualties = attackerPower * 0.15;
        } else {
          // Defender holds
          cityCaptured = false;
          defenderCasualties = defendingForceArrived * 0.3;
          attackerCasualties = attackerPower * 0.3;
        }
      }
    }

    // Apply Casualties to Regiments (proportional reduction)
    if (attackerCasualties > 0 && attackingRegiments.length > 0) {
      const reductionRatio = Math.max(0, 1 - attackerCasualties / attackerPower);
      for (const reg of attackingRegiments) {
        reg.a = Math.floor(reg.a * reductionRatio);
      }
    }

    if (defenderCasualties > 0 && targetState.military) {
      // Only reduce regiments that actually arrived
      for (const reg of targetState.military) {
        let arrives = false;
        if (!isSurpriseAttack) arrives = true;
        else {
          const dist = Math.hypot(reg.x - targetBurg.x, reg.y - targetBurg.y);
          const isCavalryHeavy =
            (reg.u?.cavalry || 0) + (reg.u?.["light cavalry"] || 0) > (reg.u?.infantry || 0) + (reg.u?.archers || 0);
          if (dist <= (isCavalryHeavy ? cavalryRadius : infantryRadius)) arrives = true;
        }

        if (arrives) {
          const reductionRatio = Math.max(0, 1 - defenderCasualties / defendingForceArrived);
          reg.a = Math.floor(reg.a * reductionRatio);
        }
      }
    }

    // Handle City Capture
    let actionText = "";
    let rawText = "";

    if (cityCaptured) {
      targetBurg.state = attackerId;
      // Transfer cells belonging to this burg
      for (let i = 0; i < pack.cells.burg.length; i++) {
        if (pack.cells.burg[i] === targetBurg.i) {
          pack.cells.state[i] = attackerId;
        }
      }
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
