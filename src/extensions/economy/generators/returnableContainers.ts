import { STAPLE_NEED_KG_PER_PERSON_YEAR } from "../../../generators/settlementClearance";
import { GROSS_FOOD_NEED } from "./foodConstants";
import type { Market } from "./marketTypes";

/**
 * Casks, pots and bottles that go out full and come back empty (docs/plan/returnable-drink-containers.md).
 *
 * A drink's recipe consumes only the containers lost on a trip, so its cost and price are the
 * wear, not a new set. The rest circulate: the market keeps its clean empties, fills them, and
 * gets them back when its households drink the lot. A lot shipped away takes its containers with
 * it; they come back to the market that drinks it.
 */
export const DRINK_CONTAINERS = ["Barrels", "Ceramics", "Glass"] as const;
export type DrinkContainer = (typeof DRINK_CONTAINERS)[number];

export const RETURNABLE_DRINKS = ["Beer", "Cider", "Perry", "Mead", "Wine"] as const;
export type ReturnableDrink = (typeof RETURNABLE_DRINKS)[number];

const WAIN_KG = STAPLE_NEED_KG_PER_PERSON_YEAR / GROSS_FOOD_NEED;

/** Litres a market lot holds: the 1,000 L tun, or the 200 L wine cask. */
export const DRINK_LOT_LITERS: Readonly<Record<ReturnableDrink, number>> = {
  Beer: 1_000,
  Cider: 1_000,
  Perry: 1_000,
  Mead: 1_000,
  Wine: 200
};

export type ContainerProfile = {
  /** Kilograms of container for a litre held. */
  kgPerLiter: number;
  /** Kilograms of one market unit of the container good. */
  unitKg: number;
  /** Share of the containers not coming back from a trip: broken, lost or kept. */
  lossPerTrip: number;
};

export const CONTAINER_PROFILES: Readonly<Record<DrinkContainer, ContainerProfile>> = {
  // A 120 L barrel weighs 25 kg. The 4.8% a trip is the wear the ale and wine recipes always took
  // (0.4 barrels a tun, 0.08 a wine cask). Truman lost butts worth £500 a year in 1743, at 22s a
  // butt, and held 23,947 butts in 1760 (Pryor 2015), and Bass reused its home-trade casks "an
  // almost indefinite number of times": a London cask lost less.
  Barrels: { kgPerLiter: 25 / 120, unitKg: 25, lossPerTrip: 0.048 },
  // Amphorae weigh 0.3 (Gauloise 4) to 1 (Dressel 1) kg a litre held. Gamo beer pots last 2.3
  // years on average (Arthur), Shipibo beer mugs less than one: about 18 monthly trips.
  Ceramics: { kgPerLiter: 0.5, unitKg: WAIN_KG, lossPerTrip: 0.06 },
  // An onion bottle of about 0.75 L weighs 0.6-1 kg. Their loss is taken as the pots'.
  Glass: { kgPerLiter: 1, unitKg: WAIN_KG, lossPerTrip: 0.06 }
};

/**
 * Containers each drink can go out in. Town ale was drawn into the buyer's jug or sent out in the
 * cask, and bottled ale came late and dear: a tun's bottles would cost more than the ale.
 */
export const DRINK_CONTAINER_CHOICES: Readonly<Record<ReturnableDrink, readonly DrinkContainer[]>> = {
  Beer: ["Barrels", "Ceramics"],
  Cider: DRINK_CONTAINERS,
  Perry: DRINK_CONTAINERS,
  Mead: DRINK_CONTAINERS,
  Wine: DRINK_CONTAINERS
};

export function isDrinkContainer(name: string): name is DrinkContainer {
  return (DRINK_CONTAINERS as readonly string[]).includes(name);
}

export function isReturnableDrink(name: string): name is ReturnableDrink {
  return (RETURNABLE_DRINKS as readonly string[]).includes(name);
}

/** Container units that hold one lot of the drink. */
export function getContainerSetPerLot(drink: ReturnableDrink, container: DrinkContainer): number {
  const profile = CONTAINER_PROFILES[container];
  return (DRINK_LOT_LITERS[drink] * profile.kgPerLiter) / profile.unitKg;
}

/** Container units a lot's recipe consumes: the ones lost on its trip. */
export function getContainerReplacementPerLot(drink: ReturnableDrink, container: DrinkContainer): number {
  // Rounded so the casks' replacement stays the recipes' own 0.4 a tun and 0.08 a wine cask.
  return Math.round(getContainerSetPerLot(drink, container) * CONTAINER_PROFILES[container].lossPerTrip * 1e6) / 1e6;
}

/** Recipe variants of a drink in each container, from the recipe without one. */
export function withDrinkContainers<T extends Record<string, number>>(
  drink: ReturnableDrink,
  base: T
): (T & Record<string, number>)[] {
  return DRINK_CONTAINER_CHOICES[drink].map(container => ({
    ...base,
    [container]: getContainerReplacementPerLot(drink, container)
  }));
}

/**
 * A drink's recipes that differ only in their container are one choice: the brewer takes the
 * cheapest. Returns the recipes' costs one per choice, the cheapest container of each.
 */
export function cheapestContainerChoiceCosts(
  recipes: readonly (readonly { goodId: number; amount: number }[])[],
  costs: readonly number[],
  isContainer: (goodId: number) => boolean
): number[] {
  const byChoice = new Map<string, number>();
  recipes.forEach((recipe, index) => {
    const key = recipe
      .filter(entry => !isContainer(entry.goodId))
      .map(entry => `${entry.goodId}:${entry.amount}`)
      .sort()
      .join(",");
    const previous = byChoice.get(key);
    byChoice.set(key, previous === undefined ? costs[index] : Math.min(previous, costs[index]));
  });
  return [...byChoice.values()];
}

export type ContainerCirculation = {
  /** Clean empties waiting to be filled, by container. */
  empties: Partial<Record<DrinkContainer, number>>;
  /** Filled lots in stock or with households, by drink and container. */
  filled: Partial<Record<ReturnableDrink, Partial<Record<DrinkContainer, number>>>>;
  /** Filled lots on the way to another market, by drink and container. */
  shipped: Partial<Record<ReturnableDrink, Partial<Record<DrinkContainer, number>>>>;
  /** Lots filled a month lately, by drink and container: half last month, half the months before. */
  fillRate: Partial<Record<ReturnableDrink, Partial<Record<DrinkContainer, number>>>>;
  /** Lots filled so far this month, by drink and container. */
  filledThisMonth: Partial<Record<ReturnableDrink, Partial<Record<DrinkContainer, number>>>>;
  /** Cumulative counts, by container: refilled empties, new ones bought, lost, put back in stock. */
  reused: Partial<Record<DrinkContainer, number>>;
  bought: Partial<Record<DrinkContainer, number>>;
  lost: Partial<Record<DrinkContainer, number>>;
  released: Partial<Record<DrinkContainer, number>>;
};

export function emptyCirculation(): ContainerCirculation {
  return {
    empties: {},
    filled: {},
    shipped: {},
    fillRate: {},
    filledThisMonth: {},
    reused: {},
    bought: {},
    lost: {},
    released: {}
  };
}

export function getCirculation(market: Market): ContainerCirculation | undefined {
  return market.returnableContainerLedger?.circulation;
}

function add(record: Partial<Record<DrinkContainer, number>>, container: DrinkContainer, units: number): void {
  record[container] = (record[container] ?? 0) + units;
}

/**
 * Share of a drink's lots that go out in each container: by its recent fillings, else by its lots
 * out, else all in casks.
 */
export function getFilledMix(
  circulation: ContainerCirculation | undefined,
  drink: ReturnableDrink
): Record<DrinkContainer, number> {
  const rate = circulation?.fillRate?.[drink] ?? {};
  const filled = DRINK_CONTAINERS.some(container => (rate[container] ?? 0) > 0)
    ? rate
    : (circulation?.filled[drink] ?? {});
  const total = DRINK_CONTAINERS.reduce((sum, container) => sum + Math.max(0, filled[container] ?? 0), 0);
  const mix = { Barrels: 0, Ceramics: 0, Glass: 0 };
  if (!(total > 0)) {
    mix.Barrels = 1;
    return mix;
  }
  for (const container of DRINK_CONTAINERS) mix[container] = Math.max(0, filled[container] ?? 0) / total;
  return mix;
}

export type ContainerDraw = {
  /** Empties refilled. */
  reused: number;
  /** New containers to buy beyond the recipe's replacement. */
  extra: number;
};

/**
 * What filling `lots` lots takes: the recipe buys `recipeUnits`, the empties make up the rest of
 * the set, and new containers whatever the empties cannot.
 */
export function planContainerDraw(
  circulation: ContainerCirculation | undefined,
  drink: ReturnableDrink,
  container: DrinkContainer,
  lots: number,
  recipeUnits: number
): ContainerDraw {
  const need = Math.max(0, lots * getContainerSetPerLot(drink, container) - recipeUnits);
  const reused = Math.min(Math.max(0, circulation?.empties[container] ?? 0), need);
  return { reused, extra: need - reused };
}

/**
 * Most recipe lots that `purchasable` container units can fill, with the market's empties: each
 * recipe lot buys `replacementPerLot`, fills `filledPerLot` lots, and a lot takes `setPerLot`.
 */
export function getContainerYieldCap(
  empties: number,
  purchasable: number,
  setPerLot: number,
  replacementPerLot: number,
  filledPerLot: number
): number {
  const need = setPerLot * filledPerLot;
  const fromEmpties = need - replacementPerLot;
  if (!(need > 0)) return Number.POSITIVE_INFINITY;
  if (!(fromEmpties > 0)) return replacementPerLot > 0 ? purchasable / replacementPerLot : Number.POSITIVE_INFINITY;
  const emptiesLast = Math.max(0, empties) / fromEmpties;
  const byPurchase = replacementPerLot > 0 ? purchasable / replacementPerLot : Number.POSITIVE_INFINITY;
  // While the empties last, the recipe's replacement is all a lot buys; after, a whole set.
  if (byPurchase <= emptiesLast) return byPurchase;
  return (Math.max(0, purchasable) + Math.max(0, empties)) / need;
}

/** Records a filling: the empties refilled, the new containers bought, and the lots now out. */
export function recordContainerFilling(
  circulation: ContainerCirculation,
  drink: ReturnableDrink,
  container: DrinkContainer,
  filledLots: number,
  draw: ContainerDraw
): void {
  if (!(filledLots > 0)) return;
  circulation.empties[container] = Math.max(0, (circulation.empties[container] ?? 0) - draw.reused);
  add(circulation.reused, container, draw.reused);
  add(circulation.bought, container, draw.extra);
  circulation.filled[drink] ??= {};
  add(circulation.filled[drink]!, container, filledLots);
  circulation.filledThisMonth ??= {};
  circulation.filledThisMonth[drink] ??= {};
  add(circulation.filledThisMonth[drink]!, container, filledLots);
}

/** Closes the month's fillings into the recent fill rate. */
export function rollContainerFillRate(circulation: ContainerCirculation): void {
  circulation.fillRate ??= {};
  for (const drink of RETURNABLE_DRINKS) {
    const month = circulation.filledThisMonth?.[drink] ?? {};
    const rate = circulation.fillRate[drink] ?? {};
    for (const container of DRINK_CONTAINERS) {
      const next = 0.5 * (rate[container] ?? 0) + 0.5 * (month[container] ?? 0);
      if (next > 1e-6) rate[container] = next;
      else delete rate[container];
    }
    if (Object.keys(rate).length) circulation.fillRate[drink] = rate;
    else delete circulation.fillRate[drink];
  }
  circulation.filledThisMonth = {};
}

/** Households drank `lots`: their containers come back empty, less the trip's loss. */
export function returnDrunkContainers(circulation: ContainerCirculation, drink: ReturnableDrink, lots: number): void {
  const filled = circulation.filled[drink];
  if (!filled || !(lots > 0)) return;
  const mix = getFilledMix(circulation, drink);
  for (const container of DRINK_CONTAINERS) {
    const out = Math.min(Math.max(0, filled[container] ?? 0), lots * mix[container]);
    if (!(out > 0)) continue;
    filled[container] = (filled[container] ?? 0) - out;
    const units = out * getContainerSetPerLot(drink, container);
    const lost = units * CONTAINER_PROFILES[container].lossPerTrip;
    add(circulation.empties, container, units - lost);
    add(circulation.lost, container, lost);
  }
}

/** A lot leaves the market: its containers travel with it. */
export function shipFilledContainers(circulation: ContainerCirculation, drink: ReturnableDrink, lots: number): void {
  const filled = circulation.filled[drink];
  if (!filled || !(lots > 0)) return;
  const mix = getFilledMix(circulation, drink);
  circulation.shipped[drink] ??= {};
  for (const container of DRINK_CONTAINERS) {
    const out = Math.min(Math.max(0, filled[container] ?? 0), lots * mix[container]);
    if (!(out > 0)) continue;
    filled[container] = (filled[container] ?? 0) - out;
    add(circulation.shipped[drink]!, container, out);
  }
}

/**
 * Lots arrive at `destination`: they take their containers from what all markets have on the way,
 * in the shipped mix, so the casks that left one market come back to the one that drinks them.
 */
export function receiveShippedContainers(
  markets: readonly Market[],
  destination: ContainerCirculation,
  drink: ReturnableDrink,
  lots: number
): void {
  if (!(lots > 0)) return;
  const totals = { Barrels: 0, Ceramics: 0, Glass: 0 };
  for (const market of markets) {
    const shipped = getCirculation(market)?.shipped[drink];
    if (!shipped) continue;
    for (const container of DRINK_CONTAINERS) totals[container] += Math.max(0, shipped[container] ?? 0);
  }
  const total = totals.Barrels + totals.Ceramics + totals.Glass;
  if (!(total > 0)) return;
  const share = Math.min(1, lots / total);
  destination.filled[drink] ??= {};
  for (const market of markets) {
    const shipped = getCirculation(market)?.shipped[drink];
    if (!shipped) continue;
    for (const container of DRINK_CONTAINERS) {
      const units = Math.max(0, shipped[container] ?? 0) * share;
      if (!(units > 0)) continue;
      shipped[container] = (shipped[container] ?? 0) - units;
      add(destination.filled[drink]!, container, units);
    }
  }
}
