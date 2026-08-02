/** Construction hire-board applications and named seats (job postings Phase 2–3). */

export type ConstructionHireRole = "mason" | "carpenter";

/**
 * Pending application — seat is reserved until lag expires.
 * `characterId === null` is an anonymous NPC application from the slow hire round.
 */
export interface ConstructionHireApplication {
  i: number;
  burgId: number;
  role: ConstructionHireRole;
  /** Named character applying; null = anonymous pool hire. */
  characterId: number | null;
  /** Simulation days until resolve. */
  daysRemaining: number;
}

/** One character holding a construction seat at a burg (counts as 1 worker point). */
export interface ConstructionNamedSeat {
  burgId: number;
  role: ConstructionHireRole;
  characterId: number;
}
