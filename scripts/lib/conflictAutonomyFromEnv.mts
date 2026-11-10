/**
 * Audit runs may override the saved conflict policy with FMG_CONFLICT_AUTONOMY (e.g. "peace" for
 * calibration: no war starts or advances and no state is at war). Call after the world is loaded.
 */
import { worldContext } from "../../src/context/worldContext";
import { normalizeConflictAutonomy } from "../../src/utils/conflictAutonomy";

export function applyConflictAutonomyFromEnv(): void {
  const value = process.env.FMG_CONFLICT_AUTONOMY;
  if (!value) return;
  const mode = normalizeConflictAutonomy(value);
  if (mode !== value) throw new Error(`Unknown FMG_CONFLICT_AUTONOMY: ${value}`);
  worldContext.options.conflictAutonomy = mode;
  console.error(`[conflict-autonomy] ${mode}`);
}
