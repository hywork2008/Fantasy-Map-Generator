import type { Point } from "../../types/primitives";
import type { FreeformWayFlight, FreeformWayLanding } from "../../types/terrain";
import { stationsAlong } from "./wayGeometry";

/** One riser. A flight rises by a whole number of these. */
export const WAY_RISER_METERS = 0.17;
/** One tread. A flight of n steps runs n times this along the centre line. */
export const WAY_TREAD_METERS = 0.3;
export const WAY_LANDING_MIN_METERS = 3;
/** One flight climbs at most this far. 17 risers is 2.89 m. */
export const WAY_FLIGHT_RISE_MAX_METERS = 3;

const MAX_STEPS = Math.floor(WAY_FLIGHT_RISE_MAX_METERS / WAY_RISER_METERS + 1e-9);
const MIN_STEPS = Math.round(WAY_LANDING_MIN_METERS / WAY_TREAD_METERS);
/** A landing may leave the ground, but only far enough for a flight on either side. */
const BAND_METERS = 6;

export interface SteppedProfile {
  landings: FreeformWayLanding[];
  flights: FreeformWayFlight[];
  earthMeters: number;
}

export interface SteppedRequest {
  centerline: readonly Point[];
  heightAt: (point: Point) => number;
  /** Absolute level the first landing keeps, when the way starts on a plot. */
  pinStart?: number;
  pinEnd?: number;
}

interface StepState {
  h: number;
  s: number;
  cost: number;
  prevStation: number;
  prevIndex: number;
  action: number;
}

/**
 * Landings and flights along a fixed centre line.
 * One-dimensional dynamic programming: each state is a station, a riser-quantized
 * height, and how much of the current landing is already long enough to leave.
 * The cost is cut plus fill along the centre line. No library.
 */
export function planSteppedWay(request: SteppedRequest): SteppedProfile | null {
  const stations = stationsAlong(request.centerline, WAY_TREAD_METERS);
  if (!stations || stations.length < MIN_STEPS + 1) return null;
  const n = stations.length;
  const ground = stations.map(station => request.heightAt(station.point));
  let low = Math.min(...ground);
  let high = Math.max(...ground);
  if (request.pinStart !== undefined) {
    low = Math.min(low, request.pinStart);
    high = Math.max(high, request.pinStart);
  }
  if (request.pinEnd !== undefined) {
    low = Math.min(low, request.pinEnd);
    high = Math.max(high, request.pinEnd);
  }
  const origin = Math.round((low - BAND_METERS) / WAY_RISER_METERS) * WAY_RISER_METERS;
  const heightCount = Math.round((high + BAND_METERS - origin) / WAY_RISER_METERS) + 2;
  if (heightCount < 2 || heightCount > 4000) return null;
  const levelOf = (h: number) => origin + h * WAY_RISER_METERS;
  const binOf = (level: number) => Math.round((level - origin) / WAY_RISER_METERS);
  const pinStart = request.pinStart !== undefined ? binOf(request.pinStart) : null;
  const pinEnd = request.pinEnd !== undefined ? binOf(request.pinEnd) : null;
  const near = (station: number, h: number) => Math.abs(levelOf(h) - ground[station]) <= BAND_METERS + 1e-6;

  const layers: StepState[][] = stations.map(() => []);
  const index = stations.map(() => new Map<string, number>());
  const offer = (station: number, node: StepState) => {
    if (node.h < 0 || node.h >= heightCount) return;
    if (!near(station, node.h) && !(station === n - 1 && node.h === pinEnd) && !(station === 0 && node.h === pinStart))
      return;
    const key = `${node.h}:${node.s}`;
    const map = index[station];
    const existing = map.get(key);
    if (existing === undefined) {
      map.set(key, layers[station].length);
      layers[station].push(node);
      return;
    }
    const kept = layers[station][existing];
    if (node.cost < kept.cost) {
      kept.cost = node.cost;
      kept.prevStation = node.prevStation;
      kept.prevIndex = node.prevIndex;
      kept.action = node.action;
    }
  };

  for (let h = 0; h < heightCount; h++) {
    if (pinStart !== null && h !== pinStart) continue;
    if (pinStart === null && !near(0, h)) continue;
    offer(0, {
      h,
      s: 0,
      cost: Math.abs(levelOf(h) - ground[0]) * WAY_TREAD_METERS * 0.5,
      prevStation: -1,
      prevIndex: -1,
      action: 0
    });
  }

  // Short ways keep every state. Pruning a 3 m landing can make a legal stair look impossible.
  const limit = n > 250 ? 480 : 4000;
  for (let i = 0; i < n - 1; i++) {
    if (layers[i].length > limit) {
      layers[i] = layers[i].sort((a, b) => a.cost - b.cost).slice(0, limit);
      index[i].clear();
      for (let at = 0; at < layers[i].length; at++) {
        const node = layers[i][at];
        index[i].set(`${node.h}:${node.s}`, at);
      }
    }
    for (let at = 0; at < layers[i].length; at++) {
      const node = layers[i][at];
      const level = levelOf(node.h);
      const delta = stations[i + 1].distance - stations[i].distance;
      const exact = Math.abs(delta - WAY_TREAD_METERS) <= 1e-3;
      const nextSteps = exact ? Math.min(MIN_STEPS, node.s + 1) : node.s;
      offer(i + 1, {
        h: node.h,
        s: nextSteps,
        cost: node.cost + Math.abs(level - ground[i + 1]) * delta,
        prevStation: i,
        prevIndex: at,
        action: 0
      });
      if (node.s < MIN_STEPS || !exact) continue;
      for (let steps = 1; steps <= MAX_STEPS; steps++) {
        const destination = i + steps;
        if (destination >= n) break;
        if (Math.abs(stations[destination].distance - stations[i].distance - steps * WAY_TREAD_METERS) > 1e-2) break;
        for (const sign of [1, -1] as const) {
          const arrival = level + sign * steps * WAY_RISER_METERS;
          if (Math.abs(arrival - ground[destination]) > BAND_METERS + 1e-6 && destination !== n - 1) continue;
          let flight = 0;
          for (let tread = 1; tread <= steps; tread++) {
            const sample = i + tread;
            const treadLevel = level + sign * tread * WAY_RISER_METERS;
            flight +=
              Math.abs(treadLevel - ground[sample]) * (stations[sample].distance - stations[sample - 1].distance);
          }
          offer(destination, {
            h: node.h + sign * steps,
            s: 0,
            cost: node.cost + flight,
            prevStation: i,
            prevIndex: at,
            action: sign * steps
          });
        }
      }
    }
  }

  let bestAt = -1;
  let bestCost = Infinity;
  for (let at = 0; at < layers[n - 1].length; at++) {
    const node = layers[n - 1][at];
    if (node.s < MIN_STEPS) continue;
    if (pinEnd !== null && node.h !== pinEnd) continue;
    if (node.cost < bestCost) {
      bestCost = node.cost;
      bestAt = at;
    }
  }
  if (bestAt < 0) return null;

  const chain: { station: number; h: number; action: number }[] = [];
  let station = n - 1;
  let at = bestAt;
  while (at >= 0 && station >= 0) {
    const node = layers[station][at];
    if (!node) return null;
    chain.push({ station, h: node.h, action: node.action });
    station = node.prevStation;
    at = node.prevIndex;
  }
  chain.reverse();
  if (!chain.length || chain[0].station !== 0) return null;

  const landings: FreeformWayLanding[] = [];
  const flights: FreeformWayFlight[] = [];
  let landingStart = chain[0];
  for (let k = 1; k < chain.length; k++) {
    if (chain[k].action === 0) continue;
    const depart = chain[k - 1];
    const arrive = chain[k];
    const landing = landingBetween(stations, levelOf, landingStart.station, landingStart.h, depart.station);
    if (!landing) return null;
    landings.push(landing);
    flights.push({
      fromMeters: stations[depart.station].distance,
      toMeters: stations[arrive.station].distance,
      fromLevelMeters: roundLevel(levelOf(depart.h)),
      toLevelMeters: roundLevel(levelOf(arrive.h)),
      steps: Math.abs(arrive.action)
    });
    landingStart = arrive;
  }
  const tail = chain[chain.length - 1];
  const last = landingBetween(stations, levelOf, landingStart.station, landingStart.h, tail.station);
  if (!last) return null;
  landings.push(last);
  if (landings.some(landing => landing.toMeters - landing.fromMeters < WAY_LANDING_MIN_METERS - 1e-6)) return null;
  if (flights.some(flight => flight.steps < 1 || flight.steps > MAX_STEPS)) return null;
  return { landings, flights, earthMeters: bestCost };
}

function roundLevel(level: number): number {
  return Math.round(level * 10000) / 10000;
}

function landingBetween(
  stations: { distance: number }[],
  levelOf: (h: number) => number,
  from: number,
  h: number,
  to: number
): FreeformWayLanding | null {
  if (to < from) return null;
  return {
    fromMeters: stations[from].distance,
    toMeters: stations[to].distance,
    levelMeters: roundLevel(levelOf(h))
  };
}
