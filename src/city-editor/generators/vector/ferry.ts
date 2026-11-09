import type { Point } from "../../types/primitives";
import type { VectorCityDocument } from "../../types/vector/document";
import type { VectorFerry } from "../../types/vector/ferry";
import type { VectorPolygon } from "../../types/vector/generation";
import { FERRY_LANDING_RESERVE_METERS, octagon, TOWPATH_HALF_WIDTH_METERS } from "../ferryLanding";
import { defenseAccessSurface } from "./defense";
import { containsRegion } from "./geometry/regions";
import { samplePath } from "./geometry/sampling";
import { allVectorWater } from "./geometry/water";

/** The plank jetty each landing runs out into the river (the mesh editor's drawn jetty). */
export const FERRY_JETTY = { lengthMeters: 12, widthMeters: 4 };

const ring = (outer: Point[]): VectorPolygon => ({ outer, holes: [] });
const landings = (f: VectorFerry): [Point, Point][] => [
  [f.landing, f.across],
  ...(f.farInFrame ? [[f.farLanding, [-f.across[0], -f.across[1]]] as [Point, Point]] : [])
];
const tows = (f: VectorFerry) => (f.farInFrame ? [f.townTow, f.farTow] : [f.townTow]);

/** Jetties of a ferry, each from its landing out into the river. */
export function ferryJetties(f: VectorFerry): VectorPolygon[] {
  return landings(f).flatMap(([p, out]) =>
    defenseAccessSurface(
      [p, [p[0] + out[0] * FERRY_JETTY.lengthMeters, p[1] + out[1] * FERRY_JETTY.lengthMeters]],
      FERRY_JETTY.widthMeters
    )
  );
}

/** Ground kept for a ferry, as the mesh editor keeps it: round each landing and along each towpath. */
export function ferryReservations(f: VectorFerry): VectorPolygon[] {
  return [
    ...landings(f).map(([p]) => ring(octagon(p, FERRY_LANDING_RESERVE_METERS))),
    ...tows(f).flatMap(t =>
      Math.hypot(t[1][0] - t[0][0], t[1][1] - t[0][1]) >= 1
        ? defenseAccessSurface(t, 2 * TOWPATH_HALF_WIDTH_METERS)
        : []
    )
  ];
}

const point = (v: unknown): v is Point =>
  Array.isArray(v) && v.length === 2 && v.every(n => typeof n === "number" && Number.isFinite(n));
const line = (v: unknown, max = 64): v is Point[] =>
  Array.isArray(v) && v.length >= 2 && v.length <= max && v.every(point);
const KEYS = [
  "id",
  "riverPathId",
  "roadPathId",
  "landing",
  "farLanding",
  "farInFrame",
  "across",
  "outbound",
  "inbound",
  "townTow",
  "farTow"
];

/** A stored ferry stands by the end of its road, on the dry bank of its river, and crosses square to it. */
export function validateVectorFerries(doc: VectorCityDocument): string[] {
  const ferries = doc.environment?.ferries;
  if (ferries === undefined) return [];
  if (!ferries || typeof ferries !== "object" || Array.isArray(ferries) || Object.keys(ferries).length > 64)
    return ["ferries"];
  const water = allVectorWater(doc);
  const errors: string[] = [];
  for (const [id, f] of Object.entries(ferries)) {
    const road = doc.paths[f?.roadPathId],
      river = doc.paths[f?.riverPathId];
    const ok =
      !!f &&
      typeof f === "object" &&
      f.id === id &&
      /^ferry:[A-Za-z0-9:._/-]{1,110}$/.test(id) &&
      Object.keys(f).every(k => KEYS.includes(k)) &&
      KEYS.every(k => k in f) &&
      [f.landing, f.farLanding, f.across].every(point) &&
      typeof f.farInFrame === "boolean" &&
      Math.abs(Math.hypot(f.across[0], f.across[1]) - 1) < 1e-6 &&
      line(f.outbound) &&
      line(f.inbound) &&
      line(f.townTow, 2) &&
      line(f.farTow, 2) &&
      road?.role === "road" &&
      river?.role === "river" &&
      !containsRegion(water, f.landing) &&
      (() => {
        const ends = samplePath(road).map(s => s.point),
          // The road ends just short of the landing on the bank, its end clear of the water.
          near = (p: Point) => Math.hypot(p[0] - f.landing[0], p[1] - f.landing[1]) < FERRY_LANDING_RESERVE_METERS;
        return near(ends[0]) || near(ends.at(-1)!);
      })();
    if (!ok) errors.push(`ferry:${id}`);
  }
  return errors;
}
