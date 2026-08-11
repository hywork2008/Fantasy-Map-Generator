/** A shelf-stable recipe that may absorb one cell's fresh-food harvest. */
export type CellFoodPreservationPath = {
  outputGoodId: number;
  /** Raw fresh-food units consumed for one unit of the preserved output. */
  inputPerOutput: number;
};

export type CellFreshFoodInput = {
  sourceGoodId: number;
  harvestedUnits: number;
  householdDemandUnits: number;
  /** Limits direct fresh consumption where only households at the source can safely receive it. */
  maxFreshHouseholdShare?: number;
  /** Shelf-stable reserve drawn only when the staple-food system reports a local food emergency. */
  emergencyReserveDemandUnits: number;
  preservationLaborPerUnit: number;
  /** Shelf-stable output used only to restore the source cell's food reserve. */
  reservePath: CellFoodPreservationPath | null;
  /** Commercial output sold only after the local reserve is complete. */
  commercialPath: CellFoodPreservationPath | null;
  /** Confirmed demand for the commercial output, expressed in output units. */
  exportDemandUnits: number;
  /** A missing physical preservation supply is the only permitted source of fresh-food spoilage. */
  preservationSuppliesAvailable: boolean;
};

/** Sparse, persisted reserves: values are raw-fresh equivalents keyed by source Good id. */
export type CellFoodReserve = Record<number, number>;

export type CellFreshFoodOutcome = {
  sourceGoodId: number;
  producedUnits: number;
  eatenFreshUnits: number;
  reserveInputUnits: number;
  /** Shelf-stable food output held in the source cell's private reserve, not Market stock. */
  reserveOutputUnits: number;
  exportOutputUnits: number;
  spoiledForMissingSuppliesUnits: number;
};

export type CellFoodRescuePlan = {
  outcomes: CellFreshFoodOutcome[];
  nextReserve: CellFoodReserve;
  processingLaborUsed: number;
};
