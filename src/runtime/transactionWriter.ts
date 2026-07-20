import type { DataTopic } from "./worldRuntime";

/**
 * Per-system write ledger for one simulation step.
 *
 * Systems declare an upper-bound `writes` list at registration. During `run()`,
 * only those topics may be marked. The host commits the union of marked topics
 * (not the full declaration) so undeclared work cannot silently invalidate
 * unrelated projections.
 *
 * Transitional note: systems may still mutate live pack/simulation in place;
 * `markChanged` is the enforced seam that records which topics those mutations
 * affect. Target architecture replaces in-place mutation with staged buffers
 * applied through this writer (unite-data-and-map §5.1 / §6).
 */
export interface TransactionWriter {
  /** Record that `topic` was mutated. Throws when the topic is not declared. */
  markChanged(...topics: readonly DataTopic[]): void;
  /** Topics marked so far in this system run (stable insertion order). */
  readonly changedTopics: readonly DataTopic[];
}

/** Create a writer limited to `allowed` topics for one system invocation. */
export function createTransactionWriter(allowed: readonly DataTopic[]): TransactionWriter {
  const allowedSet = new Set<DataTopic>(allowed);
  const changed: DataTopic[] = [];
  const seen = new Set<DataTopic>();

  return {
    markChanged(...topics: readonly DataTopic[]): void {
      for (const topic of topics) {
        if (!allowedSet.has(topic)) {
          throw new Error(`TransactionWriter: topic '${topic}' is not in the system's declared writes`);
        }
        if (seen.has(topic)) continue;
        seen.add(topic);
        changed.push(topic);
      }
    },
    get changedTopics(): readonly DataTopic[] {
      return changed;
    }
  };
}
