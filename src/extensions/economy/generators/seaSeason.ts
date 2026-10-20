/**
 * When a port is closed to merchant sailing (docs/plan/port-freight-queue-and-warehouses.md §4.6,
 * §10.27). Two things closed the sea:
 *
 * - Winter storms. Vegetius held the Mediterranean closed from 11 November to 10 March (Epitoma
 *   4.39), and the Hanse towns' statutes (1417, 1418, 1447) laid ships up from Martinmas
 *   (11 November) to St Peter's Chair (22 February): no master might sail and no merchant ship
 *   goods before it. Open ships gave their crews no shelter. The statutes no longer name the lay-up
 *   after the fifteenth century, when decked ocean-going hulls sailed through the winter, so from
 *   ocean-going hulls (adopted) storms no longer close a port. Inside the tropics there is no such
 *   winter; the monsoon is not modelled.
 * - Ice. A harbour whose month is below freezing on average is shut to every hull, sail or steam.
 *
 * Ships at sea finish their voyage; cargo already in port waits for the opening, and its waiting
 * clock stops meanwhile. Only with `fmg-long-distance-trade` on.
 */

import { isTechnologyAtLeast } from "../../../generators/technologyProgress";
import { historicalPeriodIndex } from "../../../types/historicalPeriod";
import { getDaysInMonth } from "../../../utils/seasonUtils";
import { getLatitude } from "../../hostUtils";
import { getSimulationDay, getSimulationMonth, getSimulationYear, getWorldContext } from "../economyContext";
import { isLongDistanceTradeEnabled } from "./merchantTradeCapital";
import { readAgriculturalClimate } from "./seasonalCropClimate";

/** Latitude inside which no winter closes the sea (the tropics). */
const TROPIC_LATITUDE_DEG = 23.44;
/** Lay-up in the northern hemisphere: Martinmas to St Peter's Chair, as [month, day]. */
const LAY_UP_START: readonly [number, number] = [11, 11];
const LAY_UP_END_MEDIEVAL: readonly [number, number] = [2, 22];
/** Antiquity kept the sea closed to 10 March (Vegetius). */
const LAY_UP_END_ANTIQUITY: readonly [number, number] = [3, 10];
/** Monthly mean air temperature at or below which the harbour is iced in (°C). */
const ICE_MONTH_MEAN_C = -1;
/**
 * Days before the opening that a house books sea cargo again, so that it lies in the port
 * warehouse for the first sailing: the merchant might gather goods in winter but not ship them.
 */
const SEA_SEASON_BOOKING_LEAD_DAYS = 30;
/** Longest look ahead for the opening. */
const MAX_LOOKAHEAD_DAYS = 366;

type PortSeason = { stormLayUp: boolean; south: boolean; iceMonths: boolean[] };

let cacheKey = "";
let cachePack: unknown = null;
let seasons = new Map<number, PortSeason | null>();
let openingDays = new Map<number, number>();
let waitDaysCache = new Map<string, number>();

function isAntiquity(): boolean {
  const period = historicalPeriodIndex(getWorldContext().options?.historicalPeriod);
  return period >= 0 && period <= historicalPeriodIndex("lateAntiquity");
}

function portSeason(burgId: number): PortSeason | null {
  const key = `${getSimulationYear()}:${getSimulationMonth()}:${getSimulationDay()}`;
  const pack = getWorldContext().pack;
  if (key !== cacheKey || pack !== cachePack) {
    // Technology and the year's climate change slowly; the opening moves with the day.
    if (pack !== cachePack || !cacheKey.startsWith(`${getSimulationYear()}:${getSimulationMonth()}:`))
      seasons = new Map();
    openingDays = new Map();
    waitDaysCache = new Map();
    cacheKey = key;
    cachePack = pack;
  }
  if (seasons.has(burgId)) return seasons.get(burgId) ?? null;
  const world = getWorldContext();
  const burg = world.pack.burgs?.[burgId];
  let season: PortSeason | null = null;
  if (burg && !burg.removed && typeof burg.cell === "number") {
    const latitude = getLatitude(burg.y ?? 0, world.mapCoordinates ?? {}, world.graphHeight || 1);
    const stateId = burg.state ?? 0;
    const stormLayUp =
      Math.abs(latitude) >= TROPIC_LATITUDE_DEG &&
      !(stateId > 0 && isTechnologyAtLeast("oceanGoingHulls", stateId, "adopted"));
    const temperatures = world.pack.cells ? readAgriculturalClimate(world, burg.cell).monthlyMeanTemperatureC : [];
    const iceMonths = Array.from({ length: 12 }, (_, month) => (temperatures[month] ?? 0) <= ICE_MONTH_MEAN_C);
    season = stormLayUp || iceMonths.some(Boolean) ? { stormLayUp, south: latitude < 0, iceMonths } : null;
  }
  seasons.set(burgId, season);
  return season;
}

/** Whether a date (month 1–12) falls in the storm lay-up; the south keeps it six months later. */
export function isStormLayUpDate(month: number, day: number, options: { south: boolean; antiquity: boolean }): boolean {
  const shifted = options.south ? ((month + 5) % 12) + 1 : month;
  const [startMonth, startDay] = LAY_UP_START;
  const [endMonth, endDay] = options.antiquity ? LAY_UP_END_ANTIQUITY : LAY_UP_END_MEDIEVAL;
  const date = shifted * 100 + day;
  return date >= startMonth * 100 + startDay || date < endMonth * 100 + endDay;
}

function closedOn(season: PortSeason, month: number, day: number, antiquity: boolean): boolean {
  return (
    season.iceMonths[month - 1] ||
    (season.stormLayUp && isStormLayUpDate(month, day, { south: season.south, antiquity }))
  );
}

/**
 * Days from today until cargo ready to sail in `readyDays` may leave the port: `readyDays` if the
 * port is open that day, else the day it opens after (`readyDays` 0: today).
 */
function daysUntilOpenFrom(portBurgId: number, readyDays: number): number {
  const season = portSeason(portBurgId);
  if (!season) return readyDays;
  let year = getSimulationYear();
  let month = getSimulationMonth();
  let day = getSimulationDay();
  let days = 0;
  const antiquity = isAntiquity();
  const step = () => {
    days += 1;
    day += 1;
    if (day > getDaysInMonth(year, month)) {
      day = 1;
      month = (month % 12) + 1;
      if (month === 1) year += 1;
    }
  };
  while (days < readyDays) step();
  while (days < readyDays + MAX_LOOKAHEAD_DAYS && closedOn(season, month, day, antiquity)) step();
  return days;
}

/** Days until merchant hulls may sail from the port again: 0 while it is open. */
export function daysUntilSeaOpens(portBurgId: number | undefined): number {
  if (portBurgId === undefined || !isLongDistanceTradeEnabled()) return 0;
  portSeason(portBurgId);
  const cached = openingDays.get(portBurgId);
  if (cached !== undefined) return cached;
  const days = daysUntilOpenFrom(portBurgId, 0);
  openingDays.set(portBurgId, days);
  return days;
}

/**
 * Days cargo booked today is expected to lie in the port before it sails: the usual wait for a
 * fuller hold, or, where the port is shut by then, until it opens again (§10.27). Cargo booked
 * just before Martinmas lies in the warehouse all winter.
 */
export function expectedSeaWaitDays(portBurgId: number | undefined, waitDays: number): number {
  const wait = Math.max(0, Math.round(waitDays));
  if (portBurgId === undefined || !isLongDistanceTradeEnabled()) return wait;
  portSeason(portBurgId);
  const key = `${portBurgId}:${wait}`;
  const cached = waitDaysCache.get(key);
  if (cached !== undefined) return cached;
  const days = daysUntilOpenFrom(portBurgId, wait);
  waitDaysCache.set(key, days);
  return days;
}

/** Whether merchant hulls may not sail from the port today. */
export function isSeaClosed(portBurgId: number | undefined): boolean {
  return daysUntilSeaOpens(portBurgId) > 0;
}

/** Whether a house may book sea cargo from the port now: open, or opening within the lead. */
export function isSeaBookable(portBurgId: number | undefined): boolean {
  return daysUntilSeaOpens(portBurgId) <= SEA_SEASON_BOOKING_LEAD_DAYS;
}
