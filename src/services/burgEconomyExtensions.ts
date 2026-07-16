export interface BurgEconomySummary {
  production: string;
  wealth: string;
  treasury: string;
}

export const burgEconomyExtensions: {
  getBurgEconomySummary?: (burgId: number) => BurgEconomySummary | null;
} = {};
