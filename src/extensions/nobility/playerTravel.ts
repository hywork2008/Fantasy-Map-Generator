import { simulationView } from "../../simulation/viewPort";
import { playerCharacterStore } from "../characters/state/playerCharacterStore";
import { getWorldContext } from "./nobilityContext";

/**
 * The simulated half of player-character travel (docs/plan/simulation-core-separation.md S5): the
 * pending journey counts down with the calendar and moves the character on arrival. Picking a
 * destination and the move mode live in `controllers/playerCharacterTravel.ts`.
 */

/**
 * Called from the nobility tick system each day. Decrements remaining travel and
 * applies the destination when the journey completes.
 */
export function tickPlayerTravel(deltaDays: number): void {
  if (!(deltaDays > 0)) return;
  const store = playerCharacterStore.getState();
  const pending = store.pendingTravel;
  if (!pending) return;

  const remaining = pending.remainingDays - deltaDays;
  if (remaining > 0) {
    store.setPendingTravel({ ...pending, remainingDays: remaining });
    return;
  }

  store.setPendingTravel(null);
  applyCharacterArrival(pending.characterId, pending.destinationBurgId);
}

export function applyCharacterArrival(characterId: number, destinationBurgId: number): void {
  const { pack } = getWorldContext();
  const character = pack.characters?.find(c => c.i === characterId);
  if (!character || character.dead) return;

  const burg = pack.burgs?.[destinationBurgId];
  if (!burg || burg.removed) return;

  character.location = destinationBurgId;
  playerCharacterStore.getState().bumpRefreshToken();

  const name = burg.name || `Burg ${destinationBurgId}`;
  simulationView.tip(`${character.name} arrived at ${name}`, false, "success");
}

/** Drops a pending journey (the extension was disabled or unloaded). */
export function clearPendingPlayerTravel(): void {
  playerCharacterStore.getState().setPendingTravel(null);
}
