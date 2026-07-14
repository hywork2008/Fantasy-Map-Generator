import { worldContext } from "../context/worldContext";
import { useOptionsState } from "../store/optionsState";
import { normalizeConflictAutonomy } from "../utils/conflictAutonomy";

/**
 * Updates the saved map policy and its React-store mirror together.
 * Extensions receive the event rather than importing this controller, preserving the host/extension seam.
 */
export function setConflictAutonomy(value: unknown): void {
  const mode = normalizeConflictAutonomy(value);
  worldContext.options.conflictAutonomy = mode;
  useOptionsState.getState().setOption("conflictAutonomy", mode);
  document.dispatchEvent(new CustomEvent("fmg:conflict-autonomy-changed", { detail: { mode } }));
}
