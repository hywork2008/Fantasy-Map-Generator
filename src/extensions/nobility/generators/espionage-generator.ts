import { appServices, type IntelligenceReport, simulationContext } from "../../hostCore";
import { getRulerId, getWorldContext } from "../nobilityContext";

// Cumulative intrigue bonus one state's ships gather on another by spying while
// disguised as merchants on trade voyages (Shipbuilding extension,
// fmg:shipbuilding-voyage-intel — see docs/plan/ships.md "航海訓練・偽装通商・諜報（暫定案）").
// Keyed "observerStateId:targetStateId", capped so a long-running rivalry can't make
// espionage perfectly omniscient. Never decays on its own — it represents an
// accumulated network of contacts/informants built up over repeated voyages.
//
// Canonical storage: simulation.extensions.nobility.voyageIntelBonus so save/load
// keeps the network built mid-session.
const MAX_VOYAGE_INTEL_BONUS = 20;

function voyageIntelKey(observerStateId: number, targetStateId: number): string {
  return `${observerStateId}:${targetStateId}`;
}

function getVoyageIntelTable(): Record<string, number> {
  if (!simulationContext.extensions || typeof simulationContext.extensions !== "object") {
    simulationContext.extensions = {};
  }
  const existingSlice = simulationContext.extensions.nobility;
  let slice: Record<string, unknown>;
  if (existingSlice && typeof existingSlice === "object" && !Array.isArray(existingSlice)) {
    slice = existingSlice;
  } else {
    slice = {};
    simulationContext.extensions.nobility = slice;
  }
  const existing = slice.voyageIntelBonus;
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    return existing as Record<string, number>;
  }
  const table: Record<string, number> = {};
  slice.voyageIntelBonus = table;
  return table;
}

/** Called by nobility/index.tsx's fmg:shipbuilding-voyage-intel listener. Harmless no-op if Shipbuilding is never enabled. */
export function addVoyageIntel(observerStateId: number, targetStateId: number, amount: number): void {
  const key = voyageIntelKey(observerStateId, targetStateId);
  const table = getVoyageIntelTable();
  const current = table[key] ?? 0;
  table[key] = Math.min(MAX_VOYAGE_INTEL_BONUS, current + amount);
}

export function clearVoyageIntel(): void {
  const table = getVoyageIntelTable();
  for (const key of Object.keys(table)) delete table[key];
}

export class EspionageGenerator {
  generate() {
    const { pack } = getWorldContext();
    const states = pack.states.filter(s => s.i && !s.removed);
    const characters = pack.characters || [];

    // Reset intelligence
    simulationContext.intelligence = simulationContext.intelligence || {};

    for (const observer of states) {
      if (!simulationContext.intelligence[observer.i]) {
        simulationContext.intelligence[observer.i] = {};
      }
      const observerRuler = characters.find(c => c.i === getRulerId(observer));
      const observerSpymaster = characters.find(
        c =>
          c.state === observer.i &&
          c.titles.some(
            t =>
              t.title === "Spymaster" ||
              t.title === "Director of Intelligence" ||
              t.title === "Minister of Intelligence"
          )
      );

      const observerIntrigue =
        (observerSpymaster?.skills.intrigue ?? 5) * 1.5 +
        (observerRuler?.skills.intrigue ?? 5) +
        (observerRuler?.personality.guile ?? 5);

      for (const target of states) {
        if (observer.i === target.i) continue;

        const existingReport = simulationContext.intelligence[observer.i][target.i];
        if (existingReport?.hiddenBySpymaster) {
          // If hidden by spymaster, we only update if the spymaster or ruler has changed
          if (existingReport.spymasterId === observerSpymaster?.i && existingReport.rulerId === observerRuler?.i) {
            continue; // Skip updating this report, keep the old inaccurate one
          }
        }

        const targetRuler = characters.find(c => c.i === getRulerId(target));
        const targetSpymaster = characters.find(
          c =>
            c.state === target.i &&
            c.titles.some(
              t =>
                t.title === "Spymaster" ||
                t.title === "Director of Intelligence" ||
                t.title === "Minister of Intelligence"
            )
        );

        const targetIntrigue =
          (targetSpymaster?.skills.intrigue ?? 5) * 1.5 +
          (targetRuler?.skills.intrigue ?? 5) +
          (targetRuler?.personality.guile ?? 5);

        // Actual values
        const actualMilitary = target.military?.reduce((sum, reg) => sum + (reg.a || 0), 0) || 0;
        // Proxy for wealth: urban population + rural population.
        const actualWealth = (target.urban || 0) * 2 + (target.rural || 0);

        let estimatedMilitary = actualMilitary;
        let estimatedWealth = actualWealth;
        let accuracyLevel: IntelligenceReport["accuracyLevel"] = "unknown";

        const voyageIntelBonus = getVoyageIntelTable()[voyageIntelKey(observer.i, target.i)] ?? 0;
        const diff = observerIntrigue + voyageIntelBonus - targetIntrigue;

        if (diff > 10) {
          // Highly accurate
          estimatedMilitary *= 1 + (appServices.rng.rand() * 0.1 - 0.05);
          estimatedWealth *= 1 + (appServices.rng.rand() * 0.1 - 0.05);
          accuracyLevel = "accurate";
        } else if (diff >= -10 && diff <= 10) {
          // Somewhat fuzzy (+/- 30%)
          estimatedMilitary *= 1 + (appServices.rng.rand() * 0.6 - 0.3);
          estimatedWealth *= 1 + (appServices.rng.rand() * 0.6 - 0.3);
          accuracyLevel = "accurate"; // It's fuzzy but not intentionally manipulated
        } else {
          // Target successfully deceives observer
          const targetBoldness = targetRuler?.personality.boldness ?? 50;
          const targetConfidence = targetRuler?.personality.confidence ?? 50;

          if (targetBoldness < 40 || targetConfidence < 40) {
            // Paranoid/Cautious: Make themselves look stronger to deter attacks
            estimatedMilitary *= 1 + (appServices.rng.rand() * 0.5 + 0.5); // +50% to +100%
            accuracyLevel = "overestimated";
          } else if (targetBoldness > 60) {
            // Ambitious/Bold: Make themselves look weaker to bait an attack
            estimatedMilitary *= 1 - (appServices.rng.rand() * 0.3 + 0.2); // -20% to -50%
            accuracyLevel = "underestimated";
          } else {
            // General deception
            estimatedMilitary *= 1 + (appServices.rng.rand() * 0.8 - 0.4);
            accuracyLevel = "unknown";
          }
        }

        const spymasterGuile = observerSpymaster?.personality.guile ?? 50;
        const spymasterHonor = observerSpymaster?.personality.honor ?? 50;
        let hidden = false;

        if (spymasterGuile > 70 && spymasterHonor < 30) {
          hidden = true;
        }

        simulationContext.intelligence[observer.i][target.i] = {
          estimatedMilitaryPower: Math.max(0, Math.round(estimatedMilitary)),
          estimatedWealth: Math.max(0, Math.round(estimatedWealth)),
          lastUpdatedYear: simulationContext.currentYear,
          accuracyLevel,
          hiddenBySpymaster: hidden,
          spymasterId: observerSpymaster?.i,
          rulerId: observerRuler?.i
        };
      }
    }
  }
}

export const Espionage = new EspionageGenerator();
