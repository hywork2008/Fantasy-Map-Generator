import { clearBlockFabricCache } from "../core/gen/blockInfill";

/**
 * Derived data the town view recomputes from a document is never saved and never
 * needed for correctness; these caches only avoid repeating work. Policy:
 *
 * | Cache | Owner | Key | Invalidated by | Released by |
 * | --- | --- | --- | --- | --- |
 * | block fabric (per document) | `buildBlockFabric` | document object + content fingerprint | fingerprint change (in-place edits) | GC of the document, or `clearRenderDerivedCaches` |
 * | block fabric (shared LRU, 256 entries) | `FabricCache` | district content key | LRU eviction | `clearRenderDerivedCaches` |
 * | ferry plan | `ferryPlan` | connection object + document + `riverFlows` identity | either identity changing | GC of the connection |
 * | town facts, bridge decks, cemetery plans | none (recomputed per render) | - | - | - |
 *
 * `prepareTownFacts` is deliberately not cached: its expensive part is the block
 * fabric above, and a whole-document fingerprint would cost more than the rest.
 * Add a cache only with measurements, keyed by document identity plus a cheap
 * revision, and list it in this table.
 */
export function clearRenderDerivedCaches(): void {
  clearBlockFabricCache();
}
