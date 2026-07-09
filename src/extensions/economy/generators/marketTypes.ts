export interface Market {
  i: number;
  centerBurgId: number;
  color: string;
  name?: string;
  managerCharacterId?: number;
  goods: Record<number, { stock: number; price: number }>;
}

export interface Deal {
  i: number;
  seller: number;
  sellerType: "burg" | "market";
  buyer: number;
  buyerType: "burg" | "market";
  good: number;
  units: number;
  price: number;
  tax: number;
  distance?: number;
  durationDays?: number;
  accountingPeriodDays?: 7 | 30;
}
