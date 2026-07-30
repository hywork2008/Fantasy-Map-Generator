export type MerchantOrganizationScale = "local" | "regional" | "major";

export interface MerchantOrganization {
  i: number;
  name: string;
  scale: MerchantOrganizationScale;
  homeBurgId: number;
  homeMarketId: number;
  homeStateId: number;
  chairpersonCharacterId: number;
  secretaryCharacterId?: number;
  bodyguardCharacterId?: number;
  executiveCharacterIds?: number[];
  memberCharacterIds: number[];
  parentOrganizationId?: number;
  childOrganizationIds?: number[];
  tradeRangeKm: number;
  urbanPreference: number;
  ruralFocus: number;
}
