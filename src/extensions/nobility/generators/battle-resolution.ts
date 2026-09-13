import { getFormationMatchupFactor, resolveBattleFormations } from "../../../data/militaryFormations";
import {
  isFantasySupernaturalEnabled,
  mundaneIncomingCasualtyFactor,
  stateDurability,
  trySpendArcaneWarWorking
} from "../../characters/arcane";
import type { Character } from "../../characters/characterTypes";
import { recordSpecializationExperience, specializationScore } from "../../characters/specializations";
import {
  applyDemographicCasualties,
  appServices,
  buildSeaRouteGraph,
  livingTroops,
  type StrategicGoal
} from "../../hostCore";
import type { ChronicleEvent, MilitaryRegiment } from "../../hostTypes";
import {
  getApi,
  getCurrentDay,
  getCurrentMonth,
  getCurrentYear,
  getRulerId,
  getWorldContext
} from "../nobilityContext";
import {
  calculateEffectiveSiegePower,
  captureBurg,
  commanderPowerMultiplier,
  fortificationAttackRatio,
  getClusterCommander,
  isBurgFortified,
  occupyingDisciplineMultiplier,
  regimentDistanceTo,
  regimentReinforcementRadius,
  sumClusterTroops
} from "./localDefense";
import { getRegimentCommander } from "./officerAssignment";

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

    const isFortified = isBurgFortified(targetBurg);
    const seaRouteGraph = buildSeaRouteGraph(pack);

    // 1. Detection Phase (Spymaster vs Spymaster)
    const attackerSpymaster =
      findOfficeHolder(characters, attackerId, "Spymaster") ?? characters.find(c => c.i === getRulerId(attackerState));
    const defenderSpymaster =
      findOfficeHolder(characters, goal.targetState, "Spymaster") ??
      characters.find(c => c.i === getRulerId(targetState));

    const attackerGuile = attackerSpymaster ? specializationScore(attackerSpymaster, "intrigue.covertOperations") : 50;
    const defenderGuile = defenderSpymaster
      ? specializationScore(defenderSpymaster, "intrigue.counterintelligence")
      : 50;

    const attackerRoll = appServices.rng.rand() * 100 + attackerGuile;
    const defenderRoll = appServices.rng.rand() * 100 + defenderGuile;

    const isSurpriseAttack = attackerRoll > defenderRoll;

    // 2. Response Time Logic
    let defendingForceArrived = 0;
    const defendingRegiments = targetState.military || [];
    const arrivedDefendingRegiments: MilitaryRegiment[] = [];

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
        arrivedDefendingRegiments.push(regiment);
        defendingForceArrived +=
          regiment.a * commanderPowerMultiplier(characters, regiment, [{ kind: "terrain", id: "urban" }]);
      }
    }

    // 3. Attacker Force
    // Prevent "teleporting" military power. Land regiments only count if they're on the
    // target's own landmass (they can't cross open water on their own). Naval regiments
    // (fleets, which also carry any embarked marines — see military-generator.ts's
    // marine-embark logic) count only if a charted sea route actually reaches the target
    // port; see docs/plan/naval-sea-lanes.md.
    let attackerPower = 0;
    const attackingRegiments: MilitaryRegiment[] = [];

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
        attackerPower +=
          effectivePower * commanderPowerMultiplier(characters, regiment, [{ kind: "terrain", id: "urban" }]);
        regiment.actionStatus = "battled";
        attackingRegiments.push(regiment);
      }
    }

    const troopsA = sumClusterTroops(attackingRegiments);
    const troopsB = sumClusterTroops(arrivedDefendingRegiments);
    troopsB.infantry = (troopsB.infantry ?? 0) + cityGarrison;
    const formations = resolveBattleFormations(
      getClusterCommander(characters, attackingRegiments),
      troopsA,
      getClusterCommander(characters, arrivedDefendingRegiments),
      troopsB,
      () => appServices.rng.rand()
    );
    const militiaOnly = defendingForceArrived <= cityGarrison * 1.5;
    attackerPower *= getFormationMatchupFactor(formations.formationA, formations.formationB, troopsA, troopsB);
    defendingForceArrived *= getFormationMatchupFactor(formations.formationB, formations.formationA, troopsB, troopsA);

    // Snapshot the actual participants before casualties change their troop mix or command scale.
    const participants = [...attackingRegiments, ...arrivedDefendingRegiments].map(regiment => ({
      regiment,
      targets: [
        { kind: "terrain" as const, id: "urban" },
        { kind: "commandScale" as const, id: regiment.n ? "fleet" : regiment.a >= 1000 ? "army" : "regiment" },
        ...Object.entries(regiment.u ?? {})
          .filter(([, count]) => count > 0)
          .map(([id]) => ({ kind: "troop" as const, id }))
      ]
    }));

    // 4. Resolution
    let attackerCasualties = 0;
    let defenderCasualties = 0;
    let cityCaptured = false;

    // A bloodless fall requires the defenders to be caught off-guard (militia only) AND the attackers to be overwhelmingly stronger
    if (militiaOnly && attackerPower >= Math.max(1, defendingForceArrived) * 1.5) {
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
      const requiredRatio = fortificationAttackRatio(targetBurg, 1.5);

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

    if (isFantasySupernaturalEnabled()) {
      attackerCasualties *= mundaneIncomingCasualtyFactor(stateDurability(attackerState, pack));
      defenderCasualties *= mundaneIncomingCasualtyFactor(stateDurability(targetState, pack));
      const rand = () => appServices.rng.rand();
      const year = getCurrentYear();
      const month = getCurrentMonth();
      const day = getCurrentDay();
      const commandersA = attackingRegiments.map(r => r.commanderId).filter((id): id is number => id !== undefined);
      const commandersB = arrivedDefendingRegiments
        .map(r => r.commanderId)
        .filter((id): id is number => id !== undefined);
      const workingA = trySpendArcaneWarWorking({
        characters,
        stateId: attackerId,
        battlefieldCell: targetBurg.cell,
        currentYear: year,
        currentMonth: month,
        currentDay: day,
        races: pack.races,
        burgs: pack.burgs,
        commanderIds: commandersA,
        rand,
        kind: "campaign"
      });
      const workingB = trySpendArcaneWarWorking({
        characters,
        stateId: goal.targetState,
        battlefieldCell: targetBurg.cell,
        currentYear: year,
        currentMonth: month,
        currentDay: day,
        races: pack.races,
        burgs: pack.burgs,
        commanderIds: commandersB,
        rand,
        kind: "campaign"
      });
      if (workingA) defenderCasualties += workingA.casualties;
      if (workingB) attackerCasualties += workingB.casualties;
      attackerCasualties = Math.min(attackerCasualties, attackerPower);
    }

    // Apply Casualties to Regiments (proportional reduction) and tally combat deaths
    let attackerDead = 0;
    let defenderDead = 0;

    if (attackerCasualties > 0 && attackingRegiments.length > 0) {
      const reductionRatio = Math.max(0, 1 - attackerCasualties / attackerPower);
      for (const reg of attackingRegiments) {
        const before = livingTroops(reg);
        let survivors = 0;
        for (const unit in reg.u) {
          reg.u[unit] = Math.floor(reg.u[unit] * reductionRatio);
          survivors += reg.u[unit];
        }
        reg.a = survivors;
        attackerDead += Math.max(0, before - livingTroops(reg));
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
          const before = livingTroops(reg);
          let survivors = 0;
          for (const unit in reg.u) {
            reg.u[unit] = Math.floor(reg.u[unit] * reductionRatio);
            survivors += reg.u[unit];
          }
          reg.a = survivors;
          defenderDead += Math.max(0, before - livingTroops(reg));
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

    const battlefieldCell = targetBurg.cell;
    if (attackerDead > 0) applyDemographicCasualties(attackerId, attackerDead, battlefieldCell);
    if (defenderDead > 0) applyDemographicCasualties(goal.targetState, defenderDead, battlefieldCell);

    const simulation = getApi().simulationContext;
    const battleYear = simulation?.currentYear ?? Number(options.year);
    for (const { regiment, targets } of participants) {
      const commander = getRegimentCommander(characters, regiment);
      if (!commander) continue;
      recordSpecializationExperience(commander, {
        id: `siege:${battleYear}:${simulation?.currentMonth ?? 0}:${simulation?.currentDay ?? 0}:${attackerId}:${targetBurg.i}:${regiment.state}:${regiment.i}`,
        domainId: "martial.siege",
        year: battleYear,
        coverage: 0.02,
        mode: "battle",
        role: "commander",
        outcome: cityCaptured === (regiment.state === attackerId) ? "victory" : "defeat",
        source: "simulation",
        targets
      });
    }

    // Handle City Capture
    let actionText = "";
    let rawText = "";

    if (cityCaptured) {
      captureBurg(pack, targetBurg, attackerId, occupyingDisciplineMultiplier(characters, attackingRegiments));
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
