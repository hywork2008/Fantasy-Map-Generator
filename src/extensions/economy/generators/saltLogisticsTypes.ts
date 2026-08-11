/**
 * State-operated source of Salt. Capacity and output use the Salt Good's `bag` unit.
 * A bag is normalized to 60 kg; see saltLogistics.ts and docs/simulation/salt-logistics.md.
 */
export interface Saltworks {
  i: number;
  stateId: number;
  /** Market where the works deposits its wholesale output. */
  marketId: number;
  /** Cell containing the pan, brine well, or rock-salt working. */
  cellId: number;
  kind: "saltPan" | "brineWell" | "rockSaltMine";
  /** Sustainable output target, including the national operating reserve. */
  annualCapacityBags: number;
  /** Output actually placed on the origin market during the latest production month. */
  monthlyOutputBags: number;
  active: boolean;
}

/** A domestic wholesale shipment from a state saltworks to a city market. */
export interface SaltShipment {
  i: number;
  stateId: number;
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
}

/** Current-month population requirement and fulfillment for one state. */
export interface StateSaltLedger {
  stateId: number;
  population: number;
  monthlyProvisionBags: number;
  monthlyHouseholdDemandBags: number;
  monthlyOutputBags: number;
  monthlyDispatchedBags: number;
  monthlyDeliveredBags: number;
  monthlyHouseholdSalesBags: number;
  monthlyUnmetHouseholdBags: number;
  inTransitBags: number;
  saltworksIds: number[];
}
