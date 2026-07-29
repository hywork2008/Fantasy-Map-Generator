export interface BurgEconomySummary {
  production: string;
  wealth: string;
  treasury: string;
  /** Human-readable share of the burg's residents supported by imported food. */
  foodImportDependency: string;
}

export const burgEconomyExtensions: {
  getBurgEconomySummary?: (burgId: number) => BurgEconomySummary | null;
} = {};
