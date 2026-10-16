export interface WaterfrontIssue {
  kind: "shore-distance" | "shore-missing" | "bank-distance" | "river-unresolved";
  /** Metres beyond the allowed distance, for the distance kinds. */
  excessMeters?: number;
  reason?: string;
}
