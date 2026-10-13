import { clearBlockFabricCache } from "../generators/blockInfill";
import type { CityDocument } from "../types/document";

/**
 * Derived data the town view recomputes from a document is never saved and never
 * needed for correctness; these caches only avoid repeating work. Policy:
 *
 * | Cache | Owner | Key | Invalidated by | Released by |
 * | --- | --- | --- | --- | --- |
 * | block fabric (per document) | `buildBlockFabric` | document object + content fingerprint | fingerprint change (in-place edits) | GC, document replacement (`clearRenderDerivedCaches(document)`), or full clear |
 * | block fabric (shared LRU, 256 entries) | `FabricCache` | district content key | LRU eviction | full clear (`clearRenderDerivedCaches()` on mount/dispose) |
 * | ferry plan | `ferryPlan` | connection object + document + `riverFlows` identity | either identity changing | GC of the connection |
 * | town facts, bridge decks, cemetery plans | none (recomputed per render) | - | - | - |
 *
 * `prepareTownFacts` is deliberately not cached: its expensive part is the block
 * fabric above, and a whole-document fingerprint would cost more than the rest.
 * Add a cache only with measurements, keyed by document identity plus a cheap
 * revision, and list it in this table.
 */
export function clearRenderDerivedCaches(document?: CityDocument): void {
  clearBlockFabricCache(document);
}
