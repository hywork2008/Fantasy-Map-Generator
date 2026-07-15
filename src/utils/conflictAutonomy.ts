import type { ConflictAutonomy } from "../types/WorldState";

export const DEFAULT_CONFLICT_AUTONOMY: ConflictAutonomy = "playerDirected"; // "autonomous" | "playerDirected"

/** Converts untrusted saved/UI input to a supported conflict-autonomy policy. */
export function normalizeConflictAutonomy(value: unknown): ConflictAutonomy {
  return value === "playerDirected" ? "playerDirected" : DEFAULT_CONFLICT_AUTONOMY;
}
