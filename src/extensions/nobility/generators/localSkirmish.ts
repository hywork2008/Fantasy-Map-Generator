import { simulationContext } from "../../../context/simulationContext";
import { buildSeaRouteGraph, findSeaRouteDistance, type SeaRouteGraph } from "../../../generators/seaRouteGraph";
import type { ChronicleEvent, MilitaryRegiment, MilitaryUnit, State } from "../../../types/models";
import { getWorldContext } from "../nobilityContext";
import type { Character } from "./characterTypes";
import { commanderPowerMultiplier } from "./localDefense";

/** Distance (map units) within which two hostile land regiments are considered in direct contact. */
const SKIRMISH_CONTACT_RADIUS = 20;
const NAVAL_SKIRMISH_CONTACT_RADIUS = 100;

function hasStrategicTension(stateA: State, stateB: State): boolean {
  const goalsA = simulationContext.strategicGoals[stateA.i] ?? [];
  const goalsB = simulationContext.strategicGoals[stateB.i] ?? [];
  return goalsA.some(g => g.targetState === stateB.i) || goalsB.some(g => g.targetState === stateA.i);
}

function logSkirmish(loserState: State, winnerState: State, loserBurgName: string | undefined) {
  const { pack } = getWorldContext();
  let chronicle = pack.states[0].diplomacy;
  if (!chronicle) chronicle = [];

  const event: ChronicleEvent = {
    id: `skirmish-${winnerState.i}-${loserState.i}-${Date.now()}`,
    yearsAgo: 0,
    from: winnerState.i,
    to: loserState.i,
    action: "annihilated an enemy detachment",
    rawText: loserBurgName
      ? `${winnerState.name} annihilated an enemy ${loserState.name} detachment and took ${loserBurgName}.`
      : `${winnerState.name} annihilated an enemy ${loserState.name} detachment in battle.`
  };

  pack.states[0].diplomacy = [[`Skirmish: ${winnerState.name} vs ${loserState.name}`, event], ...chronicle];
}

function isInContact(regA: MilitaryRegiment, regB: MilitaryRegiment, seaRouteGraph: SeaRouteGraph): boolean {
  if (regA.n || regB.n) {
    const routeDist = findSeaRouteDistance(seaRouteGraph, regA.cell, regB.cell);
    return routeDist !== null && routeDist <= NAVAL_SKIRMISH_CONTACT_RADIUS;
  }
  const dist = Math.hypot(regA.x - regB.x, regA.y - regB.y);
  return dist <= SKIRMISH_CONTACT_RADIUS;
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
  return power;
}

function applyCasualties(reg: MilitaryRegiment, casualtiesRate: number): void {
  let totalSurvivors = 0;
  for (const unit in reg.u) {
    const randVal = 0.8 + Math.random() * 0.4;
    const died = Math.min(Math.floor(reg.u[unit] * casualtiesRate * randVal), reg.u[unit]);
    reg.u[unit] -= died;
    totalSurvivors += reg.u[unit];
  }
  reg.a = totalSurvivors;
}

function getContactCluster(
  seedA: MilitaryRegiment,
  regimentsA: MilitaryRegiment[],
  regimentsB: MilitaryRegiment[],
  seaRouteGraph: SeaRouteGraph
) {
  const clusterA = new Set([seedA]);
  const clusterB = new Set<MilitaryRegiment>();

  let added = true;
  while (added) {
    added = false;
    for (const b of regimentsB) {
      if (clusterB.has(b)) continue;
      if (Array.from(clusterA).some(a => isInContact(a, b, seaRouteGraph))) {
        clusterB.add(b);
        added = true;
      }
    }
    for (const a of regimentsA) {
      if (clusterA.has(a)) continue;
      if (Array.from(clusterB).some(b => isInContact(a, b, seaRouteGraph))) {
        clusterA.add(a);
        added = true;
      }
    }
  }
  return { regsA: Array.from(clusterA), regsB: Array.from(clusterB) };
}

export class LocalSkirmishGenerator {
  resolve(deltaYears = 0, deltaMonths = 0, deltaDays = 0): boolean {
    const { pack, options } = getWorldContext();
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
          if (!hasStrategicTension(stateA, stateB)) continue;

          const regimentsB = stateB.military || [];
          if (!regimentsB.length) continue;

          for (const regA of regimentsA) {
            if (regA.a <= 0 || fought.has(regA)) continue;
            if (regA.isCapitalGuard) continue;

            const validB = regimentsB.filter(b => b.a > 0 && !fought.has(b) && !b.isCapitalGuard);
            if (!validB.some(b => isInContact(regA, b, seaRouteGraph))) continue;

            const validA = regimentsA.filter(a => a.a > 0 && !fought.has(a) && !a.isCapitalGuard);
            const { regsA, regsB } = getContactCluster(regA, validA, validB, seaRouteGraph);

            let powerA = 0;
            for (const r of regsA)
              powerA += calculateRegimentPower(r, militaryOptions) * commanderPowerMultiplier(characters, r);

            let powerB = 0;
            for (const r of regsB)
              powerB += calculateRegimentPower(r, militaryOptions) * commanderPowerMultiplier(characters, r);

            const dieA = 3.5;
            const dieB = 3.5;
            const attack = powerA * (dieA / 10 + 0.4);
            const defense = powerB * (dieB / 10 + 0.4);

            const lethalityA = Math.random() * 0.05 + 0.05; // 5% to 10%
            const lethalityB = Math.random() * 0.05 + 0.05;
            const absoluteCasualtiesA = defense * lethalityB;
            const absoluteCasualtiesB = attack * lethalityA;
            const casualtiesA = Math.min(1.0, absoluteCasualtiesA / (attack || 1));
            const casualtiesB = Math.min(1.0, absoluteCasualtiesB / (defense || 1));

            let _totalA = 0;
            for (const r of regsA) {
              applyCasualties(r, casualtiesA);
              fought.add(r);
              r.actionStatus = "battled";
              _totalA += r.a;
            }

            let _totalB = 0;
            for (const r of regsB) {
              applyCasualties(r, casualtiesB);
              fought.add(r);
              r.actionStatus = "battled";
              _totalB += r.a;
            }

            skirmishOccurred = true;

            for (const r of regsA) {
              if (r.a <= 0) {
                console.warn(`⚔️ BACKGROUND COMBAT: ${stateB.name} annihilated ${stateA.name}'s ${r.name}.`);
                logSkirmish(stateA, stateB, undefined);
              }
            }
            for (const r of regsB) {
              if (r.a <= 0) {
                console.warn(`⚔️ BACKGROUND COMBAT: ${stateA.name} annihilated ${stateB.name}'s ${r.name}.`);
                logSkirmish(stateB, stateA, undefined);
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
