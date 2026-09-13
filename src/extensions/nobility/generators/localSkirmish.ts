import { getFormationMatchupFactor, resolveBattleFormations } from "../../../data/militaryFormations";
import {
  isFantasySupernaturalEnabled,
  mundaneIncomingCasualtyFactor,
  stateDurability,
  trySpendArcaneWarWorking
} from "../../characters/arcane";
import type { Character } from "../../characters/characterTypes";
import {
  applyDemographicCasualties,
  appServices,
  buildSeaRouteGraph,
  livingTroops,
  regimentQualityMultiplier,
  type SeaRouteGraph,
  simulationContext
} from "../../hostCore";
import type { Burg, ChronicleEvent, MilitaryRegiment, MilitaryUnit, PackedGraph, State } from "../../hostTypes";
import { mayAdvanceConflict } from "../conflictDirector";
import { getCurrentDay, getCurrentMonth, getCurrentYear, getWorldContext } from "../nobilityContext";
import {
  canOccupyBurg,
  captureBurg,
  commanderPowerMultiplier,
  getClusterCommander,
  occupyingDisciplineMultiplier,
  regimentDistanceTo,
  regimentReinforcementRadius,
  sumClusterTroops
} from "./localDefense";

/**
 * Power-ratio threshold above which an isolated side is routed outright this tick rather than
 * ground down by the normal gradual daily lethality roll — restores the pre-daily-tick
 * "hopeless exclave, no chance of surviving contact" outcome (the old ANNIHILATION_RATIO) for
 * the subset of fights the isolation gate above already lets through. Ordinary skirmishes
 * between forces within this ratio still resolve as gradual per-day attrition.
 */
const ANNIHILATION_RATIO = 3;

/** The burg (if any) that `regiment` was garrisoning — same lookup the old annihilate() used. */
function findGarrisonedBurg(pack: PackedGraph, regiment: MilitaryRegiment, stateId: number): Burg | undefined {
  return pack.burgs.find(b => !b.removed && b.state === stateId && b.cell === regiment.cell);
}

function hasStrategicTension(stateA: State, stateB: State): boolean {
  const goalsA = simulationContext.strategicGoals[stateA.i] ?? [];
  const goalsB = simulationContext.strategicGoals[stateB.i] ?? [];
  return goalsA.some(g => g.targetState === stateB.i) || goalsB.some(g => g.targetState === stateA.i);
}

function logSkirmish(loserState: State, winnerState: State, capturedBurgName: string | undefined) {
  const { pack } = getWorldContext();
  let chronicle = pack.states[0].diplomacy;
  if (!chronicle) chronicle = [];

  const event: ChronicleEvent = {
    id: `skirmish-${winnerState.i}-${loserState.i}-${Date.now()}`,
    yearsAgo: 0,
    from: winnerState.i,
    to: loserState.i,
    action: "annihilated an enemy detachment",
    rawText: capturedBurgName
      ? `${winnerState.name} annihilated an enemy ${loserState.name} detachment and took ${capturedBurgName}.`
      : `${winnerState.name} annihilated an enemy ${loserState.name} detachment in battle.`
  };

  pack.states[0].diplomacy = [[`Skirmish: ${winnerState.name} vs ${loserState.name}`, event], ...chronicle];
}

/**
 * True if any of `siblings` outside `cluster` (still standing) is within reinforcement range of
 * some member of `cluster` — i.e. the cluster isn't truly cut off from the rest of its state's
 * army. Restores the pre-daily-tick "isolated exclave, no hope of relief" protection (see
 * docs/plan/military-time-advance-review-findings.md §1.4): a supported cluster is left to the
 * formal siege/tension pipeline (strategic-planner.ts/battle-resolution.ts) instead of being
 * ground down by this background mechanic every single day it stays in contact.
 */
function hasExternalReinforcement(
  cluster: MilitaryRegiment[],
  siblings: MilitaryRegiment[],
  seaRouteGraph: SeaRouteGraph
): boolean {
  const clusterSet = new Set(cluster);
  return siblings.some(sibling => {
    if (clusterSet.has(sibling) || sibling.a <= 0) return false;
    return cluster.some(member => {
      const dist = regimentDistanceTo(sibling, member.cell, member.x, member.y, seaRouteGraph);
      return dist !== null && dist <= regimentReinforcementRadius(sibling);
    });
  });
}

/**
 * Background skirmishes only fire when hostile regiments share a packed cell.
 * Adjacent-but-different cells (or close Euclidean distance) is not enough — that used to
 * wipe exclaves before armies actually arrived on the same battlefield cell.
 */
function isInContact(regA: MilitaryRegiment, regB: MilitaryRegiment): boolean {
  return regA.cell === regB.cell;
}

function calculateRegimentPower(reg: MilitaryRegiment, militaryOptions: MilitaryUnit[]): number {
  let power = 0;
  for (const name in reg.u) {
    const unit = militaryOptions.find(u => u.name === name);
    if (unit) {
      // In battle-screen.ts, power is survivors * unit.power. We use the full unit.power here.
      power += reg.u[name] * unit.power;
    }
  }
  // Phase 5: green recruits fight below paper strength
  return power * regimentQualityMultiplier(reg);
}

/** Remove up to `dead` headcount from a cluster, proportional within each regiment. */
function applyHeadcountCasualties(regs: MilitaryRegiment[], dead: number): number {
  let remaining = Math.max(0, Math.floor(dead));
  for (const regiment of regs) {
    if (remaining <= 0 || regiment.a <= 0) continue;
    const take = Math.min(regiment.a, remaining);
    const factor = (regiment.a - take) / regiment.a;
    let survivors = 0;
    for (const unit in regiment.u) {
      regiment.u[unit] = Math.floor(regiment.u[unit] * factor);
      survivors += regiment.u[unit];
    }
    remaining -= Math.max(0, regiment.a - survivors);
    regiment.a = survivors;
  }
  return Math.max(0, Math.floor(dead) - remaining);
}

/** Apply attrition; returns headcount killed. */
function applyCasualties(reg: MilitaryRegiment, casualtiesRate: number): number {
  const before = reg.a;
  let totalSurvivors = 0;
  for (const unit in reg.u) {
    const randVal = 0.8 + appServices.rng.rand() * 0.4;
    const died = Math.min(Math.floor(reg.u[unit] * casualtiesRate * randVal), reg.u[unit]);
    reg.u[unit] -= died;
    totalSurvivors += reg.u[unit];
  }
  reg.a = totalSurvivors;
  return Math.max(0, before - totalSurvivors);
}

function getContactCluster(seedA: MilitaryRegiment, regimentsA: MilitaryRegiment[], regimentsB: MilitaryRegiment[]) {
  const clusterA = new Set([seedA]);
  const clusterB = new Set<MilitaryRegiment>();

  let added = true;
  while (added) {
    added = false;
    for (const b of regimentsB) {
      if (clusterB.has(b)) continue;
      if (Array.from(clusterA).some(a => isInContact(a, b))) {
        clusterB.add(b);
        added = true;
      }
    }
    for (const a of regimentsA) {
      if (clusterA.has(a)) continue;
      if (Array.from(clusterB).some(b => isInContact(a, b))) {
        clusterA.add(a);
        added = true;
      }
    }
  }
  return { regsA: Array.from(clusterA), regsB: Array.from(clusterB) };
}

export class LocalSkirmishGenerator {
  resolve(deltaYears = 0, deltaMonths = 0, deltaDays = 0): boolean {
    const { pack, options, populationRate, urbanization } = getWorldContext();
    let iterations = deltaDays;
    if (iterations === 0 && (deltaMonths > 0 || deltaYears > 0)) {
      // 簡略化計画までの暫定として1回だけ実行する
      iterations = 1;
    }
    if (iterations <= 0) return false;
    const states = pack.states.filter(s => s.i && !s.removed);
    const characters: Character[] = pack.characters || [];
    const seaRouteGraph = buildSeaRouteGraph(pack);
    const militaryOptions = options.military || [];
    let skirmishOccurred = false;

    for (let iter = 0; iter < iterations; iter++) {
      const fought = new Set<MilitaryRegiment>();

      for (const stateA of states) {
        const regimentsA = stateA.military || [];
        if (!regimentsA.length) continue;

        for (const stateB of states) {
          if (stateB.i <= stateA.i) continue; // each unordered pair once
          if (stateA.diplomacy?.[stateB.i] !== "Enemy") continue;
          if (!mayAdvanceConflict(stateA.i, stateB.i) && !mayAdvanceConflict(stateB.i, stateA.i)) continue;
          if (!hasStrategicTension(stateA, stateB)) continue;

          const regimentsB = stateB.military || [];
          if (!regimentsB.length) continue;

          for (const regA of regimentsA) {
            if (regA.a <= 0 || fought.has(regA)) continue;
            if (regA.isCapitalGuard) continue;

            const validB = regimentsB.filter(b => b.a > 0 && !fought.has(b) && !b.isCapitalGuard);
            if (!validB.some(b => isInContact(regA, b))) continue;

            const validA = regimentsA.filter(a => a.a > 0 && !fought.has(a) && !a.isCapitalGuard);
            const { regsA, regsB } = getContactCluster(regA, validA, validB);

            let powerA = 0;
            for (const r of regsA)
              powerA += calculateRegimentPower(r, militaryOptions) * commanderPowerMultiplier(characters, r);

            let powerB = 0;
            for (const r of regsB)
              powerB += calculateRegimentPower(r, militaryOptions) * commanderPowerMultiplier(characters, r);

            const clusterTroopsA = sumClusterTroops(regsA);
            const clusterTroopsB = sumClusterTroops(regsB);
            const cmdA = getClusterCommander(characters, regsA);
            const cmdB = getClusterCommander(characters, regsB);
            const formations = resolveBattleFormations(cmdA, clusterTroopsA, cmdB, clusterTroopsB, () =>
              appServices.rng.rand()
            );
            const factorA = getFormationMatchupFactor(
              formations.formationA,
              formations.formationB,
              clusterTroopsA,
              clusterTroopsB
            );
            const factorB = getFormationMatchupFactor(
              formations.formationB,
              formations.formationA,
              clusterTroopsB,
              clusterTroopsA
            );
            powerA *= factorA;
            powerB *= factorB;

            // Isolation protection: if the weaker side of this matchup still has reinforcement
            // reachable from the rest of its state's army, leave the encounter to the formal
            // siege/tension pipeline instead of grinding it down here every day it stays in
            // contact — only genuinely cut-off forces (no hope of relief) take background
            // skirmish casualties.
            const [weakerCluster, weakerSiblings] = powerA <= powerB ? [regsA, regimentsA] : [regsB, regimentsB];
            if (hasExternalReinforcement(weakerCluster, weakerSiblings, seaRouteGraph)) continue;

            const dieA = 3.5;
            const dieB = 3.5;
            const attack = powerA * (dieA / 10 + 0.4);
            const defense = powerB * (dieB / 10 + 0.4);

            const lethalityA = appServices.rng.rand() * 0.05 + 0.05; // 5% to 10%
            const lethalityB = appServices.rng.rand() * 0.05 + 0.05;
            const absoluteCasualtiesA = defense * lethalityB;
            const absoluteCasualtiesB = attack * lethalityA;
            const durabilityA = isFantasySupernaturalEnabled()
              ? mundaneIncomingCasualtyFactor(stateDurability(stateA, pack))
              : 1;
            const durabilityB = isFantasySupernaturalEnabled()
              ? mundaneIncomingCasualtyFactor(stateDurability(stateB, pack))
              : 1;
            const casualtiesA = Math.min(1.0, (absoluteCasualtiesA / (attack || 1)) * durabilityA);
            const casualtiesB = Math.min(1.0, (absoluteCasualtiesB / (defense || 1)) * durabilityB);

            // An isolated side facing overwhelming force is routed outright this tick instead of
            // grinding through the normal gradual roll — see ANNIHILATION_RATIO above. Zeroed
            // directly rather than via applyCasualties(rate=1.0): its per-unit 0.8x-1.2x roll
            // can leave survivors even at a 100% nominal casualty rate.
            const annihilateA = powerB >= powerA * ANNIHILATION_RATIO;
            const annihilateB = powerA >= powerB * ANNIHILATION_RATIO;

            let totalA = 0;
            const livingBeforeA = regsA.reduce((sum, r) => sum + livingTroops(r), 0);
            for (const r of regsA) {
              if (annihilateA) {
                for (const unit in r.u) r.u[unit] = 0;
                r.a = 0;
              } else {
                applyCasualties(r, casualtiesA);
              }
              fought.add(r);
              r.actionStatus = "battled";
              totalA += r.a;
            }

            let totalB = 0;
            const livingBeforeB = regsB.reduce((sum, r) => sum + livingTroops(r), 0);
            for (const r of regsB) {
              if (annihilateB) {
                for (const unit in r.u) r.u[unit] = 0;
                r.a = 0;
              } else {
                applyCasualties(r, casualtiesB);
              }
              fought.add(r);
              r.actionStatus = "battled";
              totalB += r.a;
            }

            // Population Overview combat tally (+ civilian male loss when manpower ledger is off).
            // Attribute battlefield deaths to the contact seed's cell (cluster centroid alternative
            // would need pack.cells lookup; seed cell is stable and already on the regiment).
            const battlefieldCell = regA.cell;

            if (isFantasySupernaturalEnabled() && !annihilateA && !annihilateB) {
              const year = getCurrentYear();
              const month = getCurrentMonth();
              const day = getCurrentDay();
              const rand = () => appServices.rng.rand();
              const commandersA = regsA.map(r => r.commanderId).filter((id): id is number => id !== undefined);
              const commandersB = regsB.map(r => r.commanderId).filter((id): id is number => id !== undefined);
              const workingA = trySpendArcaneWarWorking({
                characters,
                stateId: stateA.i,
                battlefieldCell,
                currentYear: year,
                currentMonth: month,
                currentDay: day,
                races: pack.races,
                burgs: pack.burgs,
                commanderIds: commandersA,
                rand,
                kind: "daily"
              });
              const workingB = trySpendArcaneWarWorking({
                characters,
                stateId: stateB.i,
                battlefieldCell,
                currentYear: year,
                currentMonth: month,
                currentDay: day,
                races: pack.races,
                burgs: pack.burgs,
                commanderIds: commandersB,
                rand,
                kind: "daily"
              });
              if (workingA) applyHeadcountCasualties(regsB, workingA.casualties);
              if (workingB) applyHeadcountCasualties(regsA, workingB.casualties);
              totalA = regsA.reduce((sum, r) => sum + r.a, 0);
              totalB = regsB.reduce((sum, r) => sum + r.a, 0);
            }
            // Count living losses after both mundane and arcane damage. Risen losses
            // must never create graves or return to the civilian population as wounded.
            const deadA = livingBeforeA - regsA.reduce((sum, r) => sum + livingTroops(r), 0);
            const deadB = livingBeforeB - regsB.reduce((sum, r) => sum + livingTroops(r), 0);
            if (deadA > 0) applyDemographicCasualties(stateA.i, deadA, battlefieldCell);
            if (deadB > 0) applyDemographicCasualties(stateB.i, deadB, battlefieldCell);

            skirmishOccurred = true;

            // A dead regiment's burg only falls if the winning cluster's survivors are enough
            // to actually occupy it — see canOccupyBurg/OCCUPATION_FORCE_RATIO above.
            for (const r of regsA) {
              if (r.a <= 0) {
                console.warn(`⚔️ BACKGROUND COMBAT: ${stateB.name} annihilated ${stateA.name}'s ${r.name}.`);
                const burg = findGarrisonedBurg(pack, r, stateA.i);
                const captured = burg && canOccupyBurg(burg, totalB, populationRate, urbanization);
                if (captured) {
                  captureBurg(
                    pack,
                    burg,
                    stateB.i,
                    occupyingDisciplineMultiplier(
                      characters,
                      regsB.filter(regiment => regiment.a > 0)
                    )
                  );
                }
                logSkirmish(stateA, stateB, captured ? burg.name : undefined);
              }
            }
            for (const r of regsB) {
              if (r.a <= 0) {
                console.warn(`⚔️ BACKGROUND COMBAT: ${stateA.name} annihilated ${stateB.name}'s ${r.name}.`);
                const burg = findGarrisonedBurg(pack, r, stateB.i);
                const captured = burg && canOccupyBurg(burg, totalA, populationRate, urbanization);
                if (captured) {
                  captureBurg(
                    pack,
                    burg,
                    stateA.i,
                    occupyingDisciplineMultiplier(
                      characters,
                      regsA.filter(regiment => regiment.a > 0)
                    )
                  );
                }
                logSkirmish(stateB, stateA, captured ? burg.name : undefined);
              }
            }
          }
        }
      }
    }

    return skirmishOccurred;
  }
}

export const LocalSkirmish = new LocalSkirmishGenerator();
