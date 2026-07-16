import {
  analyzeFrontiers,
  analyzeSeaFrontiers,
  appServices,
  buildSeaRouteGraph,
  findSeaRouteDistance,
  mergeFrontiers,
  type StrategicGoal,
  simulationContext,
  useOptionsState
} from "../../hostCore";
import { mayAdvanceAutonomousConflict, mayAdvanceConflict } from "../conflictDirector";
import { getWorldContext } from "../nobilityContext";
import { BattleResolutionGenerator } from "./battle-resolution";
import {
  calculateEffectiveSiegePower,
  commanderPowerMultiplier,
  estimateLocalDefendingForce,
  regimentReinforcementRadius
} from "./localDefense";

/**
 * Attack-force multiplier required over the perceived defense. A fortified target
 * (citadel or walls) needs the classic 3x siege ratio; an unfortified town in the open
 * only needs a solid numerical edge — sieging doctrine doesn't apply to field battles.
 */
const FORTIFIED_ATTACK_RATIO = 3;
const FIELD_ATTACK_RATIO = 1.3;

export class StrategicPlannerGenerator {
  generate() {
    const { pack, options, populationRate, urbanization } = getWorldContext();
    const states = pack.states.filter(s => s.i && !s.removed);
    const burgs = pack.burgs.filter(b => b.i && !b.removed);
    const characters = pack.characters || [];

    // Analyze frontiers to find borders — land (adjacency-based) and sea (charted
    // sea-route-based, see docs/plan/naval-sea-lanes.md) merged into one map so the rest of
    // this method doesn't need to know which kind of border produced a given segment except
    // where target-selection/power math genuinely differs (segment.origin === "sea" below).
    const year = options.year || simulationContext.currentYear;
    const seaRouteGraph = buildSeaRouteGraph(pack);
    const frontiers = mergeFrontiers(analyzeFrontiers(pack, year), analyzeSeaFrontiers(pack, seaRouteGraph, year));

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
        if (!mayAdvanceConflict(attacker.i, targetStateId)) continue;

        // Only plan against Rivals or Enemies for now, or if bold and massive power difference
        if (segment.threatWeight < 0.5) continue;

        const intel = attackerIntel[targetStateId];
        if (!intel) continue; // No intel? can't plan

        const isSeaSegment = segment.origin === "sea";
        if (isSeaSegment) continue; // FUTURE: Naval invasions. Disable for now.

        // Find the frontier burg to target. Sea segments can only reasonably invade the
        // target's own ports (routes connect ports — see docs/plan/naval-sea-lanes.md §1.2
        // for the non-port-landfall nuance, deferred), picked by charted sea-route distance
        // instead of straight-line distance to the segment anchor.
        let targetBurg = -1;
        let minDist = Infinity;
        const candidateTargets = isSeaSegment
          ? burgs.filter(b => b.state === targetStateId && b.port)
          : burgs.filter(b => b.state === targetStateId && pack.cells.f[b.cell] === segment.landmass);

        if (isSeaSegment) {
          for (const b of candidateTargets) {
            if (b.i === undefined) continue;
            let routeDist: number | null = null;
            for (const ownPortCell of segment.cells) {
              const d = findSeaRouteDistance(seaRouteGraph, ownPortCell, b.cell);
              if (d !== null && (routeDist === null || d < routeDist)) routeDist = d;
            }
            if (routeDist !== null && routeDist < minDist) {
              minDist = routeDist;
              targetBurg = b.i;
            }
          }
        } else {
          // Reclaiming a burg that used to be ours (docs/plan/strategy.md — "十分な兵数があれば
          // 敵国に落とされた自国内の都市の再占領") outranks pure nearest-distance expansion: a
          // ruler settles old scores before picking a fresh fight. Only falls back to plain
          // nearest-enemy-burg when this segment holds no historically-own candidate.
          const historicallyOwn = candidateTargets.filter(b => b.stateHistory?.includes(attacker.i));
          const pool = historicallyOwn.length ? historicallyOwn : candidateTargets;
          for (const b of pool) {
            const dist = Math.hypot(b.x - segment.cx, b.y - segment.cy);
            if (dist < minDist && b.i !== undefined) {
              minDist = dist;
              targetBurg = b.i;
            }
          }
        }

        if (targetBurg === -1) continue;

        const targetBurgData = pack.burgs[targetBurg];
        const isFortified = !!(targetBurgData?.citadel || targetBurgData?.walls);
        const militaryOptions = options.military || [];

        // Calculate local attacker power. Sea segments only count naval regiments (fleets,
        // which also carry any embarked marines as part of the same regiment — see
        // military-generator.ts's marine-embark logic) reachable by charted sea route to the
        // target port; land regiments can't project power across open water on their own in
        // this model. Land segments keep the original same-landmass-or-close-enough logic.
        let localAttackerPower = 0;
        if (isSeaSegment) {
          const targetPortCell = pack.burgs[targetBurg].cell;
          for (const regiment of attacker.military || []) {
            if (regiment.a <= 0 || !regiment.n) continue;
            if (findSeaRouteDistance(seaRouteGraph, regiment.cell, targetPortCell) !== null) {
              const effectivePower = calculateEffectiveSiegePower(regiment, isFortified, militaryOptions);
              localAttackerPower += effectivePower * commanderPowerMultiplier(characters, regiment);
            }
          }
        } else {
          for (const regiment of attacker.military || []) {
            if (regiment.a <= 0) continue;

            const effectivePower = calculateEffectiveSiegePower(regiment, isFortified, militaryOptions);
            localAttackerPower += effectivePower * commanderPowerMultiplier(characters, regiment);
          }
        }

        // Check retreat path (are they cornered?)
        const isCornered = candidateTargets.length === 1;

        // Calculate required force from the burg's actual local defenders (garrison +
        // nearby regiments), not the defending state's entire national military — a
        // state's total army is usually many times larger than what a single border
        // town can muster, and using it here made every burg look impregnable
        // regardless of how it was actually defended.
        const perceivedDefense = estimateLocalDefendingForce(
          pack,
          targetBurgData,
          characters,
          seaRouteGraph,
          populationRate,
          urbanization
        );

        // Fortified targets (citadel/walls) need the classic 3x siege ratio; an
        // unfortified town in the open only needs a solid numerical edge.
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
            tension: 10 + appServices.rng.rand() * 20,
            expectedCasualties,
            justification: isCornered ? "overwhelming_force_crush" : "border_expansion",
            requiredAttackForce
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

    // War Frequency controls autonomous AI escalation only. A conflict explicitly approved
    // by the player must remain actionable even when autonomous escalation is set to 0.
    const frequencyMultiplier = mayAdvanceAutonomousConflict() ? (useOptionsState.getState().warFrequency ?? 1.0) : 1;

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
        if (!mayAdvanceConflict(stateId, goal.targetState)) continue;

        // If the target burg is already owned by the state, the goal is achieved/invalid
        if (pack.burgs[goal.targetBurg]?.state === stateId) {
          // Clear the stale tag from any regiments still counted toward this now-completed goal
          // (mirrors evaluatePlans()'s withdrawal cleanup below) — otherwise a regiment keeps
          // pointing at a burg that's no longer a meaningful siege target forever.
          for (const regiment of state.military || []) {
            if (regiment.goalTargetBurg === goal.targetBurg) regiment.goalTargetBurg = undefined;
          }
          continue; // Goal accomplished or invalid, drop it
        }

        const currentDiplomacy = state.diplomacy?.[goal.targetState];
        if (currentDiplomacy === "Ally" || currentDiplomacy === "Friendly") {
          for (const regiment of state.military || []) {
            if (regiment.goalTargetBurg === goal.targetBurg) regiment.goalTargetBurg = undefined;
          }
          continue; // Goal invalid due to allied/friendly status, drop it
        }

        // Tension calculation — top-down (ruler ambition) plus bottom-up (ground reality).
        // Base increment per year: +1 to +5 based on boldness
        const baseIncrement = 1 + boldness / 25;
        // Add random noise so they don't all progress identically
        const noise = appServices.rng.rand() * 4;

        // Bottom-up: if any of this goal's regiments (tagged by the arrival check below) are
        // already trading blows with the target on the ground this tick — localSkirmish.ts's
        // background attrition sets actionStatus "battled" — tension escalates faster than the
        // ruler's ambition alone would drive it. A fight already underway pushes the formal
        // declaration, rather than the sovereign's clock being the sole source of truth.
        const groundClash = (state.military || []).some(
          r => r.goalTargetBurg === goal.targetBurg && r.actionStatus === "battled"
        );
        const groundClashBonus = groundClash ? 15 : 0;

        goal.tension += (baseIncrement + noise) * frequencyMultiplier + groundClashBonus;

        if (goal.tension >= 100) {
          if (state.diplomacy) {
            state.diplomacy[goal.targetState] = "Enemy";
          }
          const target = pack.states[goal.targetState];
          if (target?.diplomacy) {
            target.diplomacy[stateId] = "Enemy";
          }

          // Check if enough troops have arrived to initiate the siege
          let arrivedAttackerPower = 0;
          const targetBurgObj = pack.burgs[goal.targetBurg];
          const isFortified = !!(targetBurgObj?.citadel || targetBurgObj?.walls);
          const characters = pack.characters || [];
          const militaryOptions = getWorldContext().options.military || [];

          if (targetBurgObj) {
            for (const regiment of state.military || []) {
              if (regiment.a <= 0) continue;
              if (regiment.n) continue; // Skip naval for land sieges currently

              const dist = Math.hypot(regiment.x - targetBurgObj.x, regiment.y - targetBurgObj.y);
              if (dist <= regimentReinforcementRadius(regiment)) {
                const effectivePower = calculateEffectiveSiegePower(regiment, isFortified, militaryOptions);
                arrivedAttackerPower += effectivePower * commanderPowerMultiplier(characters, regiment);
                // Tag this regiment as counted toward this specific goal, so cancelling it later
                // (evaluatePlans()) only clears march orders for regiments actually tied to it.
                regiment.goalTargetBurg = goal.targetBurg;
              }
            }
          }

          // Wait until at least 50% of the originally required attack force has physically arrived
          // AND at least SOME troops must have arrived (power > 0)
          const required = (goal.requiredAttackForce || 0) * 0.5;
          if (arrivedAttackerPower > 0 && arrivedAttackerPower >= required) {
            const burgName = targetBurgObj?.name || "Unknown City";
            console.warn(
              `⚔️ WAR DECLARED & SIEGE BEGUN: State ${state.name} has laid siege to ${burgName} of State ${target?.name}!`
            );

            // Resolve the siege
            BattleResolutionGenerator.resolveSiege(goal, stateId);

            // Once war is triggered, this specific goal is "consumed"
            warOccurred = true;
          } else {
            // Troops are still marching or haven't gathered enough force yet.
            // Keep tension at 100 and wait for them to arrive.
            goal.tension = 100;
            validGoals.push(goal);
          }
        } else {
          // Keep the goal
          validGoals.push(goal);
        }
      }

      // Keep only valid and unresolved goals. Safe to write back now that regiment march
      // orders are only ever cleared per-goal (evaluatePlans(), via goalTargetBurg — see §1.7)
      // rather than for the whole army, which was the "teleporting"/order-stomping problem that
      // originally motivated dropping this write-back.
      strategicGoals[stateId] = validGoals;
    }
    return warOccurred;
  }

  public evaluatePlans(): void {
    const { strategicGoals } = simulationContext;
    const { pack, options } = getWorldContext();
    const characters = pack.characters || [];
    const militaryOptions = options.military || [];
    const seaRouteGraph = buildSeaRouteGraph(pack);

    for (const stateIdStr in strategicGoals) {
      const stateId = Number(stateIdStr);
      const goals = strategicGoals[stateId];
      if (!goals || goals.length === 0) continue;

      const attacker = pack.states[stateId];
      if (!attacker || attacker.removed) continue;

      for (let i = goals.length - 1; i >= 0; i--) {
        const goal = goals[i];
        if (!mayAdvanceConflict(stateId, goal.targetState)) {
          goals.splice(i, 1);
          continue;
        }
        const targetBurgObj = pack.burgs[goal.targetBurg];
        if (!targetBurgObj || targetBurgObj.state === stateId) {
          goals.splice(i, 1);
          continue;
        }

        const currentDiplomacy = attacker.diplomacy?.[goal.targetState];
        if (currentDiplomacy === "Ally" || currentDiplomacy === "Friendly") {
          goals.splice(i, 1);
          for (const regiment of attacker.military || []) {
            if (regiment.goalTargetBurg === goal.targetBurg) {
              regiment.goalTargetBurg = undefined;
              if (regiment.destinationCell !== undefined) {
                regiment.destinationCell = undefined;
                regiment.path = undefined;
                regiment.pathIndex = undefined;
                regiment.actionStatus = "waiting";
              }
            }
          }
          continue;
        }

        const isFortified = !!(targetBurgObj.citadel || targetBurgObj.walls);

        let localAttackerPower = 0;
        for (const regiment of attacker.military || []) {
          if (regiment.a <= 0) continue;

          const effectivePower = calculateEffectiveSiegePower(regiment, isFortified, militaryOptions);
          localAttackerPower += effectivePower * commanderPowerMultiplier(characters, regiment);
        }

        // Just like in generate(), but we recalculate to see if situation changed
        const { populationRate, urbanization } = getWorldContext();
        const perceivedDefense = estimateLocalDefendingForce(
          pack,
          targetBurgObj,
          characters,
          seaRouteGraph,
          populationRate,
          urbanization
        );
        const requiredAttackForce = perceivedDefense * (isFortified ? FORTIFIED_ATTACK_RATIO : FIELD_ATTACK_RATIO);

        // If the attacker force is less than 80% of required, cancel the goal
        if (localAttackerPower < requiredAttackForce * 0.8) {
          console.log(
            `[StrategicPlanner] State ${stateId} withdrawing troops from siege of ${targetBurgObj.name} (Power: ${localAttackerPower.toFixed()} vs Req: ${requiredAttackForce.toFixed()})`
          );
          goals.splice(i, 1);

          // Only release regiments actually tied to *this* goal (goalTargetBurg, set by
          // advanceTension() above) — a state running two sieges at once must not have the
          // still-valid one's marching regiments yanked back to "waiting" as collateral (see
          // docs/plan/military-time-advance-review-findings.md §1.7). Released regiments aren't
          // immediately re-tasked either: clearing their march order just lets the normal
          // per-tick reaction layer (regimentMovement.ts) decide their next move locally until
          // the ruler assigns a new goal.
          for (const regiment of attacker.military || []) {
            if (regiment.goalTargetBurg !== goal.targetBurg) continue;
            regiment.goalTargetBurg = undefined;
            if (regiment.destinationCell !== undefined) {
              regiment.destinationCell = undefined;
              regiment.path = undefined;
              regiment.pathIndex = undefined;
              regiment.actionStatus = "waiting";
            }
          }
        }
      }
    }
  }

  /**
   * Every state's currently-committed siege targets (`goal.tension >= 100` — the point at which
   * `advanceTension()` above already flips diplomacy to Enemy), keyed by attacker state id. Fed
   * into `regimentMovement.ts`'s `advanceAllRegimentMovement()` so Generator-layer march-order
   * logic can actually send regiments toward a goal instead of the goal sitting at tension=100
   * forever with no one marching to make it happen (docs/plan/strategy.md).
   */
  public getActiveSiegeTargets(): Map<number, number[]> {
    const { strategicGoals } = simulationContext;
    const result = new Map<number, number[]>();
    for (const stateIdStr in strategicGoals) {
      const stateId = Number(stateIdStr);
      const targets = (strategicGoals[stateId] ?? [])
        .filter(g => g.tension >= 100 && mayAdvanceConflict(stateId, g.targetState))
        .map(g => g.targetBurg);
      if (targets.length) result.set(stateId, targets);
    }
    return result;
  }
}

export const StrategicPlanner = new StrategicPlannerGenerator();
