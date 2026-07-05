import { P } from "../../hostUtils";
import { getWorldContext } from "../nobilityContext";

export function applyAffinitiesToDiplomacy() {
  const { pack } = getWorldContext();
  if (!pack.characters || !pack.states) return;

  const states = pack.states.filter(s => s.i && !s.removed);

  for (const state of states) {
    if (state.rulerId === undefined) continue;
    const ruler = pack.characters.find(c => c.i === state.rulerId);
    if (!ruler?.affinities) continue;

    for (const other of states) {
      if (state.i === other.i) continue;

      const affinity = ruler.affinities[other.i] || 0;
      const isMarried = ruler.marriages?.includes(other.i);

      const currentRel = state.diplomacy![other.i];

      // Suzerain-Vassal ties are hardcoded, we don't break them just because of affinity easily
      if (currentRel === "Suzerain" || currentRel === "Vassal") continue;

      if (isMarried) {
        // Marriage forces peace and high chance of alliance
        if (currentRel === "Enemy" || currentRel === "Rival" || currentRel === "Suspicion") {
          state.diplomacy![other.i] = "Neutral";
          pack.states[other.i].diplomacy![state.i] = "Neutral";
        }
        if (P(0.5) && currentRel !== "Ally") {
          state.diplomacy![other.i] = "Ally";
          pack.states[other.i].diplomacy![state.i] = "Ally";
        }
        continue;
      }

      if (affinity <= -50) {
        // High grudge -> Rivalry (if neighbors) or Suspicion (if distant)
        const isNeighbor = state.neighbors?.includes(other.i);
        if (isNeighbor && currentRel !== "Enemy" && currentRel !== "Rival" && P(0.4)) {
          state.diplomacy![other.i] = "Rival";
          pack.states[other.i].diplomacy![state.i] = "Rival";
        } else if (
          !isNeighbor &&
          currentRel !== "Enemy" &&
          currentRel !== "Rival" &&
          currentRel !== "Suspicion" &&
          P(0.4)
        ) {
          state.diplomacy![other.i] = "Suspicion";
          pack.states[other.i].diplomacy![state.i] = "Suspicion";
        } else if (currentRel === "Ally") {
          // Break alliance
          state.diplomacy![other.i] = "Suspicion";
          pack.states[other.i].diplomacy![state.i] = "Suspicion";
        }
      } else if (affinity <= -20) {
        // Mild grudge -> Suspicion
        if (currentRel === "Ally" && P(0.5)) {
          state.diplomacy![other.i] = "Suspicion";
          pack.states[other.i].diplomacy![state.i] = "Suspicion";
        } else if (currentRel === "Neutral" && P(0.3)) {
          state.diplomacy![other.i] = "Suspicion";
          pack.states[other.i].diplomacy![state.i] = "Suspicion";
        }
      } else if (affinity >= 50) {
        // High affinity -> Alliance or Peace
        if (currentRel === "Enemy" && P(0.5)) {
          state.diplomacy![other.i] = "Neutral";
          pack.states[other.i].diplomacy![state.i] = "Neutral";
        } else if (currentRel !== "Ally" && P(0.4)) {
          state.diplomacy![other.i] = "Ally";
          pack.states[other.i].diplomacy![state.i] = "Ally";
        }
      } else if (affinity >= 20) {
        // Mild affinity -> Improve relations
        if (currentRel === "Enemy" && P(0.2)) {
          state.diplomacy![other.i] = "Suspicion";
          pack.states[other.i].diplomacy![state.i] = "Suspicion";
        } else if (currentRel === "Suspicion" && P(0.5)) {
          state.diplomacy![other.i] = "Neutral";
          pack.states[other.i].diplomacy![state.i] = "Neutral";
        }
      }
    }
  }
}
