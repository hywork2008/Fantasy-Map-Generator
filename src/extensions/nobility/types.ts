export interface ConflictAuthorization {
  origin: "player";
  startedAt: { year: number; month: number; day: number };
}

declare module "../../types/models" {
  interface State {
    /** Denormalized pointer to the primary ruling Character.i, for O(1) lookup. */
    rulerId?: number;
    /** Player-approved interstate conflicts, indexed by the other state id. */
    conflictAuthorizations?: Record<number, ConflictAuthorization>;
  }
}
