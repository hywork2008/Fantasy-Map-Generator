import { type IntelligenceReport, simulationContext } from "../../../context/simulationContext";
import { getWorldContext } from "../nobilityContext";

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
      const observerRuler = characters.find(c => c.i === observer.rulerId);
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

        const targetRuler = characters.find(c => c.i === target.rulerId);
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

        const diff = observerIntrigue - targetIntrigue;

        if (diff > 10) {
          // Highly accurate
          estimatedMilitary *= 1 + (Math.random() * 0.1 - 0.05);
          estimatedWealth *= 1 + (Math.random() * 0.1 - 0.05);
          accuracyLevel = "accurate";
        } else if (diff >= -10 && diff <= 10) {
          // Somewhat fuzzy (+/- 30%)
          estimatedMilitary *= 1 + (Math.random() * 0.6 - 0.3);
          estimatedWealth *= 1 + (Math.random() * 0.6 - 0.3);
          accuracyLevel = "accurate"; // It's fuzzy but not intentionally manipulated
        } else {
          // Target successfully deceives observer
          const targetBoldness = targetRuler?.personality.boldness ?? 50;
          const targetConfidence = targetRuler?.personality.confidence ?? 50;

          if (targetBoldness < 40 || targetConfidence < 40) {
            // Paranoid/Cautious: Make themselves look stronger to deter attacks
            estimatedMilitary *= 1 + (Math.random() * 0.5 + 0.5); // +50% to +100%
            accuracyLevel = "overestimated";
          } else if (targetBoldness > 60) {
            // Ambitious/Bold: Make themselves look weaker to bait an attack
            estimatedMilitary *= 1 - (Math.random() * 0.3 + 0.2); // -20% to -50%
            accuracyLevel = "underestimated";
          } else {
            // General deception
            estimatedMilitary *= 1 + (Math.random() * 0.8 - 0.4);
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
