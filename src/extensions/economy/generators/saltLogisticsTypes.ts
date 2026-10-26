/** Church ids identify the existing state ecclesiastica account, not a cleric's personal purse. */
export type SaltworksOwner = { kind: "state" | "burg" | "church" | "private"; id: number };

/**
 * Owned source of Salt. Capacity and output use the Salt Good's `bag` unit.
 * A bag is normalized to 60 kg; see saltLogistics.ts and docs/simulation/salt-logistics.md.
 */
export interface Saltworks {
  i: number;
  stateId: number;
  /** Missing in legacy saves: the territorial state retains ownership. */
  owner?: SaltworksOwner;
  /** Owner of the latest production settlement, retained across later editor assignments. */
  settlementOwner?: SaltworksOwner;
  /** Market where the works deposits its wholesale output. */
  marketId: number;
  /** Cell containing the pan, brine well, or rock-salt working. */
  cellId: number;
  kind: "saltPan" | "brineWell" | "rockSaltMine";
  /** Sustainable output target, including the national operating reserve. */
  annualCapacityBags: number;
  /** Output actually placed on the origin market during the latest production month. */
  monthlyOutputBags: number;
  /** Recomputed each settlement; legacy saves need no synthetic inputs. */
  productionMethod?: "solar" | "boiling" | "mining";
  monthlyCapacityBags?: number;
  monthlyLaborHours?: number;
  monthlyFuelWoodUnits?: number;
  monthlyWagesPaid?: number;
  monthlyFuelPaid?: number;
  monthlyWholesaleReceived?: number;
  monthlyFreightPaid?: number;
  active: boolean;
}

/** A wholesale shipment from a state saltworks to a city market. */
export interface SaltShipment {
  i: number;
  /** Compatibility field for shipments saved before exporter/importer states were split. */
  stateId?: number;
  /** Territorial exporting state; the actual owner is separate. */
  exporterStateId: number;
  /** State whose city market ordered the cargo. */
  importerStateId: number;
  saltworksId: number;
  fromMarketId: number;
  toMarketId: number;
  /** Physical cargo currently travelling or delivered during the latest settlement. */
  bags: number;
  /** Map-space travel estimate used by the state wholesale carrier. */
  travelDays: number;
  /** Remaining transit time; zero only after arrival. */
  remainingDays: number;
  status: "inTransit" | "delivered";
  /** Destination retail price at the moment of delivery. */
  unitPrice: number;
  /** Prepaid at dispatch. Absent on legacy cargo, which is never retroactively charged. */
  wholesalePaid?: number;
  /** Owner paid at dispatch for fresh output; later assignments never rewrite this receipt. */
  sellerOwner?: SaltworksOwner;
  /** Government holding exclusive wholesale rights when this cargo departed. */
  monopolyStateId?: number;
  freightPaid?: number;
}

/** Current-month population requirement and fulfillment for one state. */
export interface StateSaltLedger {
  /** Unmapped households have demand but no implied delivery. State zero represents neutral residents. */
  unmarketedPeople?: number;
  monthlyHouseholdPaid?: number;
  monthlySaltTaxPaid?: number;
  monthlySaltTaxFarmPaid?: number;
  monthlySaltTaxNet?: number;
  monthlySmuggledBags?: number;
  monthlyLegalHouseholdBags?: number;
  monthlyTaxAffordabilityGapBags?: number;
  monthlyUnmetQuotaBags?: number;
  saltMonopoly?: boolean;
  saltAutomated?: boolean;
  saltCompulsoryPurchase?: boolean;
  saltTaxRate?: number;
  saltUnrest?: number;
  saltRevolt?: boolean;
  saltCouncilDecision?: "approved" | "rejected" | "unchanged";
  monthlyLivestockPaid?: number;
  monthlyImportsPaid?: number;
  monthlyExportsReceived?: number;
  monthlyProcessingForecastBags?: number;
  monthlyLivestockTotalRequirementBags?: number;
  monthlyLivestockNaturalBags?: number;
  monthlyLivestockDemandBags?: number;
  monthlyLivestockSuppliedBags?: number;
  monthlyUnmetLivestockBags?: number;
  stateId: number;
  population: number;
  monthlyProvisionBags: number;
  monthlyHouseholdDemandBags: number;
  monthlyOutputBags: number;
  monthlyDispatchedBags: number;
  monthlyDeliveredBags: number;
  monthlyImportedBags: number;
  monthlyExportedBags: number;
  monthlyHouseholdSalesBags: number;
  monthlyUnmetHouseholdBags: number;
  inTransitBags: number;
  saltworksIds: number[];
}
