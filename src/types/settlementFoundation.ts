/** A compact, pre-polity area selected around one viable water/resource site. */
export interface SettlementRegion {
  readonly id: number;
  readonly kind: "river" | "lake" | "coast" | "spring";
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
