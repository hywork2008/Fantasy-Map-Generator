/**
 * A compact, pre-polity area selected around one viable water/resource site.
 * `"mountain"` (docs/plan/underground-realm-and-supernatural-areas.md §3.4) is a reserved region
 * injected directly from a Dwarf hold's SubterraneanDomain rather than discovered by the normal
 * capacity/climate site-scoring pass (dwarves are food/temperature-independent, so the ordinary
 * screening in `collectSites()` would exclude their cells entirely).
 */
export interface SettlementRegion {
  readonly id: number;
  readonly kind: "river" | "lake" | "coast" | "spring" | "mountain";
  readonly center: number;
  readonly cells: readonly number[];
}

/** A future capital, town, or village site selected by the settlement plan. */
export interface SettlementNode {
  readonly id: number;
  readonly regionId: number;
  readonly cell: number;
  readonly role: "center" | "village";
  readonly score: number;
  /**
   * When true, capital selection (`ensureMandatoryCapitals`) guarantees this node is chosen as a
   * capital instead of leaving it to farthest-point/frontier scoring — used for the one Dwarf hold
   * region so it cannot end up a capital-less one-cell enclave (docs §3.4/§4, §7.3).
   */
  readonly mandatoryCapital?: boolean;
}

/** An initial overland movement corridor between two settlement nodes. */
export interface SettlementLink {
  readonly fromNodeId: number;
  readonly toNodeId: number;
  readonly kind: "trail" | "river" | "coastal";
}

/** Canonical Phase 1 output; later phases derive polities from this plan. */
export interface SettlementFoundationPlan {
  readonly regions: readonly SettlementRegion[];
  readonly nodes: readonly SettlementNode[];
  readonly links: readonly SettlementLink[];
}
