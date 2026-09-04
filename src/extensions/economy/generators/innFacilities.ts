import type { Burg } from "../../hostTypes";
import {
  ANNUAL_GATE,
  getConstructionOperations,
  getGoods,
  getInnConstructionOrders,
  getInnFacilities,
  getMarkets,
  getSimulationYear,
  getWorldContext,
  setAnnualGateYear,
  setInnConstructionOrders,
  setInnFacilities,
  settleAnnualOnce
} from "../economyContext";
import { isGoodEnabled } from "./goods-generator";
import {
  INN_CLASSES,
  type InnClass,
  type InnConstructionOrder,
  type InnFacility,
  type InnFacilityTotals
} from "./innFacilityTypes";
import { Markets } from "./markets-generator";

export type { InnClass, InnConstructionOrder, InnFacility, InnFacilityTotals } from "./innFacilityTypes";
export { INN_CLASSES } from "./innFacilityTypes";

type InnBundle = {
  privateRoomsPerBuilding: readonly [number, number];
  sharedBedsPerBuilding: readonly [number, number];
  privateBedsPerRoom: readonly [number, number];
  commonSeatsPerBuilding: readonly [number, number];
  stableSpacesPerBuilding: readonly [number, number];
};

const INN_BUNDLES: Readonly<Record<InnClass, InnBundle>> = {
  wayside: {
    privateRoomsPerBuilding: [0, 2],
    sharedBedsPerBuilding: [4, 8],
    privateBedsPerRoom: [1, 2],
    commonSeatsPerBuilding: [8, 18],
    stableSpacesPerBuilding: [2, 6]
  },
  market: {
    privateRoomsPerBuilding: [2, 5],
    sharedBedsPerBuilding: [6, 14],
    privateBedsPerRoom: [1, 3],
    commonSeatsPerBuilding: [18, 40],
    stableSpacesPerBuilding: [4, 10]
  },
  waterside: {
    privateRoomsPerBuilding: [3, 7],
    sharedBedsPerBuilding: [10, 20],
    privateBedsPerRoom: [1, 3],
    commonSeatsPerBuilding: [26, 54],
    stableSpacesPerBuilding: [2, 8]
  },
  grand: {
    privateRoomsPerBuilding: [8, 16],
    sharedBedsPerBuilding: [18, 42],
    privateBedsPerRoom: [1, 3],
    commonSeatsPerBuilding: [56, 120],
    stableSpacesPerBuilding: [8, 22]
  },
  caravanserai: {
    privateRoomsPerBuilding: [0, 6],
    sharedBedsPerBuilding: [30, 72],
    privateBedsPerRoom: [1, 2],
    commonSeatsPerBuilding: [40, 120],
    stableSpacesPerBuilding: [20, 64]
  }
};

type InnConstructionRequirements = {
  wood: number;
  masonry: number;
  workers: number;
};

/** One order always adds one physical inn building, never permanent dwellings. */
const INN_CONSTRUCTION_REQUIREMENTS: Readonly<Record<InnClass, InnConstructionRequirements>> = {
  wayside: { wood: 8, masonry: 2, workers: 2 },
  market: { wood: 12, masonry: 5, workers: 3 },
  waterside: { wood: 10, masonry: 7, workers: 3 },
  grand: { wood: 16, masonry: 14, workers: 5 },
  caravanserai: { wood: 12, masonry: 16, workers: 5 }
};
const INN_CONSTRUCTION_STOCK_SHARE = 0.08;
const INN_CONDITION_REPAIR_RATE = 0.01;
const INN_CONDITION_DECAY_RATE = 0.05;
const INN_REMOVAL_CONDITION = 0.25;

/** A small deterministic FNV-1a hash. Facility generation must not consume map RNG. */
function hash32(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function integerInRange(key: string, min: number, max: number): number {
  if (max <= min) return min;
  return min + (hash32(key) % (max - min + 1));
}

function unitInterval(key: string): number {
  return hash32(key) / 0xffffffff;
}

function actualUrbanPeople(burg: Burg, populationRate: number, urbanization: number): number {
  return Math.max(0, burg.population ?? 0) * Math.max(0, populationRate) * Math.max(0, urbanization);
}

function marketInnBuildings(people: number, seedKey: string): number {
  if (people >= 24000) return 4;
  if (people >= 9000) return 3;
  if (people >= 3000) return 2;
  if (people >= 500) return 1;
  return unitInterval(seedKey) < 0.45 ? 1 : 0;
}

function waysideInnBuildings(people: number, seedKey: string): number {
  if (people >= 12000) return 2;
  if (people >= 1500) return 1;
  return unitInterval(seedKey) < 0.3 ? 1 : 0;
}

function createFacility(seed: string, burgId: number, innClass: InnClass, buildingCount: number): InnFacility | null {
  if (buildingCount <= 0) return null;
  const bundle = INN_BUNDLES[innClass];
  const key = `${seed}:inn:${burgId}:${innClass}`;
  const privateRooms =
    buildingCount *
    integerInRange(`${key}:private-rooms`, bundle.privateRoomsPerBuilding[0], bundle.privateRoomsPerBuilding[1]);
  const privateBeds =
    privateRooms * integerInRange(`${key}:private-beds`, bundle.privateBedsPerRoom[0], bundle.privateBedsPerRoom[1]);

  return {
    burgId,
    innClass,
    buildingCount,
    privateRooms,
    privateBeds,
    sharedBeds:
      buildingCount *
      integerInRange(`${key}:shared-beds`, bundle.sharedBedsPerBuilding[0], bundle.sharedBedsPerBuilding[1]),
    commonSeats:
      buildingCount *
      integerInRange(`${key}:common-seats`, bundle.commonSeatsPerBuilding[0], bundle.commonSeatsPerBuilding[1]),
    stableSpaces:
      buildingCount *
      integerInRange(`${key}:stables`, bundle.stableSpacesPerBuilding[0], bundle.stableSpacesPerBuilding[1]),
    condition: 0.72 + unitInterval(`${key}:condition`) * 0.26
  };
}

export function generateInnFacilitiesForBurgs(args: {
  burgs: readonly (Burg | undefined | null)[];
  marketBurgIds: ReadonlySet<number>;
  populationRate: number;
  urbanization: number;
  seed: string;
}): InnFacility[] {
  const facilities: InnFacility[] = [];

  for (const burg of args.burgs) {
    if (!burg?.i || burg.removed || burg.group === "fort") continue;

    const people = actualUrbanPeople(burg, args.populationRate, args.urbanization);
    const isCaravanserai = burg.group === "caravanserai";
    const hasMarket = (burg.market ?? 0) > 0 || args.marketBurgIds.has(burg.i);
    const seedKey = `${args.seed}:inn:${burg.i}`;
    const desired: Array<readonly [InnClass, number]> = [];

    if (isCaravanserai) desired.push(["caravanserai", people >= 10000 ? 2 : 1]);
    if (hasMarket) {
      desired.push(["market", marketInnBuildings(people, `${seedKey}:market`)]);
      desired.push(["wayside", waysideInnBuildings(people, `${seedKey}:wayside`)]);
    }
    if (burg.port) desired.push(["waterside", people >= 16000 ? 3 : people >= 4000 ? 2 : 1]);
    if ((burg.capital && people >= 1500) || people >= 30000) {
      desired.push(["grand", people >= 40000 ? 2 : 1]);
    }

    for (const [innClass, buildingCount] of desired) {
      const facility = createFacility(args.seed, burg.i, innClass, buildingCount);
      if (facility) facilities.push(facility);
    }
  }

  return facilities;
}

export function getInnFacilityTotals(facilities: readonly InnFacility[]): InnFacilityTotals {
  const totals: InnFacilityTotals = {
    buildingCount: 0,
    privateRooms: 0,
    beds: 0,
    commonSeats: 0,
    stableSpaces: 0
  };
  for (const facility of facilities) {
    totals.buildingCount += facility.buildingCount;
    totals.privateRooms += facility.privateRooms;
    totals.beds += facility.privateBeds + facility.sharedBeds;
    totals.commonSeats += facility.commonSeats;
    totals.stableSpaces += facility.stableSpaces;
  }
  return totals;
}

export function getInnFacilitiesForBurg(burgId: number): InnFacility[] {
  return getInnFacilities().filter(facility => facility.burgId === burgId);
}

function facilityKey(burgId: number, innClass: InnClass): string {
  return `${burgId}:${innClass}`;
}

function scaleFacility(target: InnFacility, buildingCount: number, condition: number): InnFacility {
  const ratio = buildingCount / target.buildingCount;
  const scaled = (value: number) => Math.max(0, Math.round(value * ratio));
  return {
    ...target,
    buildingCount,
    privateRooms: scaled(target.privateRooms),
    privateBeds: scaled(target.privateBeds),
    sharedBeds: scaled(target.sharedBeds),
    commonSeats: scaled(target.commonSeats),
    stableSpaces: scaled(target.stableSpaces),
    condition: Math.max(0, Math.min(1, condition))
  };
}

/**
 * Applies only completed single-building orders and decline/maintenance to facility stock.
 * Material purchasing and labour progress are deliberately handled separately by the module.
 */
export function reconcileInnFacilities(args: {
  current: readonly InnFacility[];
  desired: readonly InnFacility[];
  completedOrderKeys: ReadonlySet<string>;
}): InnFacility[] {
  const desiredByKey = new Map(
    args.desired.map(facility => [facilityKey(facility.burgId, facility.innClass), facility])
  );
  const reconciled: InnFacility[] = [];
  const knownKeys = new Set<string>();

  for (const facility of args.current) {
    const key = facilityKey(facility.burgId, facility.innClass);
    knownKeys.add(key);
    const target = desiredByKey.get(key);
    const targetBuildings = target?.buildingCount ?? 0;

    if (facility.buildingCount > targetBuildings) {
      if (facility.condition <= INN_REMOVAL_CONDITION) {
        const nextBuildingCount = facility.buildingCount - 1;
        if (nextBuildingCount > 0) {
          reconciled.push(scaleFacility(target ?? facility, nextBuildingCount, 0.55));
        }
      } else {
        reconciled.push({ ...facility, condition: Math.max(0, facility.condition - INN_CONDITION_DECAY_RATE) });
      }
      continue;
    }

    if (target && facility.buildingCount < targetBuildings && args.completedOrderKeys.has(key)) {
      reconciled.push(scaleFacility(target, facility.buildingCount + 1, Math.max(0.65, facility.condition)));
      continue;
    }

    reconciled.push({ ...facility, condition: Math.min(0.95, facility.condition + INN_CONDITION_REPAIR_RATE) });
  }

  for (const target of args.desired) {
    const key = facilityKey(target.burgId, target.innClass);
    if (!knownKeys.has(key) && args.completedOrderKeys.has(key)) {
      reconciled.push(scaleFacility(target, 1, 0.65));
    }
  }

  return reconciled.toSorted((left, right) => {
    if (left.burgId !== right.burgId) return left.burgId - right.burgId;
    return INN_CLASSES.indexOf(left.innClass) - INN_CLASSES.indexOf(right.innClass);
  });
}

function createConstructionOrders(desired: readonly InnFacility[]): InnConstructionOrder[] {
  const existing = getInnFacilities();
  const currentBuildings = new Map(
    existing.map(facility => [facilityKey(facility.burgId, facility.innClass), facility.buildingCount])
  );
  const orders = getInnConstructionOrders();
  const desiredByKey = new Map(desired.map(facility => [facilityKey(facility.burgId, facility.innClass), facility]));
  const year = getSimulationYear();
  const next = orders.filter(order => {
    const desiredFacility = desiredByKey.get(facilityKey(order.burgId, order.innClass));
    return Boolean(
      desiredFacility &&
        (currentBuildings.get(facilityKey(order.burgId, order.innClass)) ?? 0) < desiredFacility.buildingCount
    );
  });
  const pendingKeys = new Set(next.map(order => facilityKey(order.burgId, order.innClass)));

  for (const facility of desired) {
    const key = facilityKey(facility.burgId, facility.innClass);
    if ((currentBuildings.get(key) ?? 0) >= facility.buildingCount || pendingKeys.has(key)) continue;
    next.push({
      burgId: facility.burgId,
      innClass: facility.innClass,
      startedYear: year,
      laborProgress: 0,
      woodAcquired: 0,
      masonryAcquired: 0
    });
  }
  return next;
}

function consumeConstructionMaterial(marketId: number, goodId: number | undefined, requested: number): number {
  if (goodId === undefined || requested <= 0) return 0;
  return Markets.consumeForConstruction(marketId, goodId, requested, INN_CONSTRUCTION_STOCK_SHARE);
}

function advanceConstructionOrders(orders: readonly InnConstructionOrder[]): {
  orders: InnConstructionOrder[];
  completedOrderKeys: Set<string>;
} {
  const operationsByBurg = new Map(getConstructionOperations().map(operation => [operation.burgId, operation]));
  const goodsByName = new Map(
    getGoods()
      .filter(isGoodEnabled)
      .map(good => [good.name.toLowerCase(), good.i])
  );
  const completedOrderKeys = new Set<string>();
  const nextOrders: InnConstructionOrder[] = [];

  for (const order of orders) {
    const operation = operationsByBurg.get(order.burgId);
    if (!operation?.active) {
      nextOrders.push(order);
      continue;
    }
    const requirements = INN_CONSTRUCTION_REQUIREMENTS[order.innClass];
    const woodAcquired = Math.min(
      requirements.wood,
      order.woodAcquired +
        consumeConstructionMaterial(operation.marketId, goodsByName.get("wood"), requirements.wood - order.woodAcquired)
    );
    const masonryRemaining = requirements.masonry - order.masonryAcquired;
    const stoneAcquired = consumeConstructionMaterial(operation.marketId, goodsByName.get("stone"), masonryRemaining);
    const masonryAcquired = Math.min(
      requirements.masonry,
      order.masonryAcquired +
        stoneAcquired +
        consumeConstructionMaterial(operation.marketId, goodsByName.get("brick"), masonryRemaining - stoneAcquired)
    );
    const woodCoverage = requirements.wood > 0 ? woodAcquired / requirements.wood : 1;
    const masonryCoverage = requirements.masonry > 0 ? masonryAcquired / requirements.masonry : 1;
    const laborAvailability = Math.min(1, (operation.masonWorkers + operation.carpenterWorkers) / requirements.workers);
    const laborProgress = Math.min(
      1,
      Math.round((order.laborProgress + laborAvailability * Math.min(woodCoverage, masonryCoverage)) * 10000) / 10000
    );
    if (laborProgress >= 1 && woodCoverage >= 1 && masonryCoverage >= 1) {
      completedOrderKeys.add(facilityKey(order.burgId, order.innClass));
      continue;
    }
    nextOrders.push({ ...order, woodAcquired, masonryAcquired, laborProgress });
  }
  return { orders: nextOrders, completedOrderKeys };
}

class InnFacilitiesModule {
  generate(): void {
    const world = getWorldContext();
    const marketBurgIds = new Set(getMarkets().map(market => market.centerBurgId));
    setInnFacilities(
      generateInnFacilitiesForBurgs({
        burgs: world.pack.burgs,
        marketBurgIds,
        populationRate: world.populationRate,
        urbanization: world.urbanization,
        seed: world.seed
      })
    );
    setInnConstructionOrders([]);
    setAnnualGateYear(ANNUAL_GATE.innFacilities, getSimulationYear());
  }

  /**
   * Settles at most one inn construction or decline step per class and burg each simulation year.
   * It uses existing construction workers and consumes Wood plus Stone/Brick from the same market,
   * while keeping its work order completely separate from permanent dwelling construction.
   */
  settleAnnual(): boolean {
    if (!settleAnnualOnce(ANNUAL_GATE.innFacilities)) return false;

    const world = getWorldContext();
    const desired = generateInnFacilitiesForBurgs({
      burgs: world.pack.burgs,
      marketBurgIds: new Set(getMarkets().map(market => market.centerBurgId)),
      populationRate: world.populationRate,
      urbanization: world.urbanization,
      seed: world.seed
    });
    const startedOrders = createConstructionOrders(desired);
    const { orders, completedOrderKeys } = advanceConstructionOrders(startedOrders);
    setInnConstructionOrders(orders);
    setInnFacilities(reconcileInnFacilities({ current: getInnFacilities(), desired, completedOrderKeys }));
    return true;
  }

  clear(): void {
    setInnFacilities([]);
    setInnConstructionOrders([]);
    setAnnualGateYear(ANNUAL_GATE.innFacilities, -1);
  }
}

export const InnFacilities = new InnFacilitiesModule();
