/**
 * Fast-Forward "systematic-drain suppression" flag (docs/plan/advance-time-fast-forward.md §9.4 /
 * Phase 3, fix option "stop the systematic outflows").
 *
 * When Fast-Forward is active, applyFastForwardEconomySettlement() is meant to be the *only* thing
 * that moves State/Burg treasury — it replaces the whole real settlement pipeline with a flat
 * preset rate. But several annual economy systems keep running for real during a Fast-Forward
 * batch (they must, so tech/knowledge/infrastructure history keeps progressing — §2.2) and some of
 * them also debit `state.treasury` directly. Left unguarded, that real spending compounds on top of
 * the preset rate, so the observed treasury trajectory is a blend of the two rather than the
 * preset the user picked (§9.4). This flag lets those specific treasury writes be skipped while the
 * rest of each system's work — RNG draws included, so Fast-Forward stays deterministic per
 * seed+preset — runs unchanged.
 *
 * Set once per economy tick from registerEconomyTickSystem()'s wrapper (the one place with the
 * SimulationStepContext, hence `isBulkAdvance`), cleared in its finally. Any treasury write reached
 * outside an economy tick sees `false`, the safe default.
 */
let fastForwardTickActive = false;

export function setFastForwardTickActive(active: boolean): void {
  fastForwardTickActive = active;
}

/**
 * True only while an economy tick is executing as part of an active Fast-Forward bulk advance.
 * The systematic annual treasury spenders that keep running during Fast-Forward (chemistry/
 * medicine/infrastructure maintenance via chemMedCommon.debitTreasury(), StateSecretKnowledge,
 * GreatLibrary) check this and skip only their `state.treasury`/`burg.treasury` mutation.
 */
export function isFastForwardTickActive(): boolean {
  return fastForwardTickActive;
}
