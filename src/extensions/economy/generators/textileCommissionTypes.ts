/** Same-market, same-cycle paid tailoring. Materials are household-owned during the atomic job. */
export interface TextileCommissionJob {
  burgId: number;
  inputGoodId: number;
  inputUnits: number;
  productGoodId: number;
  productUnits: number;
  materialPayment: number;
  servicePayment: number;
  laborPoints: number;
  status: "delivered";
}
export interface TextileCommissionLedger {
  marketId: number;
  year: number;
  month: number;
  garments: number;
  blankets: number;
  garmentSpending: number;
  blanketSpending: number;
  materialSpending: number;
  serviceSpending: number;
  jobs: TextileCommissionJob[];
}
