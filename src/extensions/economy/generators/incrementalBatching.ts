/**
 * Shared frame-budget batching for the economy extension's initial-generation "incremental"
 * entry points (Production.produceIncrementally, Markets.runGlobalTradeIncrementally,
 * Caravans.spawnFromDealsIncrementally, planRetailReplenishmentIncrementally). Every one of
 * these mirrors an existing synchronous function 1:1 in output, but yields to the browser via
 * requestAnimationFrame between batches so the "Preparing economy" Map Ready task (economy/
 * index.tsx) doesn't block the main thread for its whole cost in one block. Only that initial
 * task uses the incremental entry points — every other caller (Advance Time, the "regenerate"
 * extension command, player-facing quotes, tests) keeps calling the synchronous originals and
 * is unaffected.
 */

export interface IncrementalBatchOptions {
  /** Checked once per frame; a `true` return stops the batch early without finishing `items`. */
  isCancelled?: () => boolean;
  /** Wall-clock budget (ms) per frame before yielding via requestAnimationFrame. */
  frameBudgetMs?: number;
}

/**
 * Runs `fn` once for every item in `items`, yielding to the browser whenever the current
 * frame's time budget is exceeded. Mirrors the per-burg batching in
 * Production.produceIncrementally() so any other O(n) economy-generation loop (per-good trade
 * matching, per-bundle caravan spawning, per-market retail planning) can reuse the same pattern
 * instead of freezing the main thread for its entire cost. Returns `false` if cancelled before
 * every item ran, `true` once the full list has been processed.
 */
export async function runBatchedYielding<T>(
  items: readonly T[],
  fn: (item: T) => void,
  { isCancelled = () => false, frameBudgetMs = 8 }: IncrementalBatchOptions = {}
): Promise<boolean> {
  let index = 0;
  while (index < items.length) {
    if (isCancelled()) return false;
    const frameStart = performance.now();
    do {
      fn(items[index]);
      index++;
    } while (index < items.length && performance.now() - frameStart < frameBudgetMs);
    if (index < items.length) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }
  return true;
}
