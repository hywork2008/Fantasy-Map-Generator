import type { Burg } from "../../hostTypes";
import { getInnFacilities, getMarkets, getWorldContext, setInnFacilities } from "../economyContext";
import type { InnClass, InnFacility, InnFacilityTotals } from "./innFacilityTypes";

export type { InnClass, InnFacility, InnFacilityTotals } from "./innFacilityTypes";
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
  }

  clear(): void {
    setInnFacilities([]);
  }
}

export const InnFacilities = new InnFacilitiesModule();
