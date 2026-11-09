import RBush from "rbush";
import type { GuildDomain } from "../../../types/contracts/burgSiteEconomy";
import type { WardKind } from "../../../types/geometry";
import type { Point } from "../../../types/primitives";
import type { VectorCityDocument } from "../../../types/vector/document";
import type { VectorPolygon } from "../../../types/vector/generation";
import type { ResidentialHeightKind } from "../../buildingHeightPolicy";
import { convexHull, polygonCentroid } from "../../geom";
import { assignWardMix, type WardSpot } from "../../wards";
import { pointSegmentDistance, samplePath } from "../geometry/sampling";
import { CIVIC_PLAZA_ID } from "./market";

/** Street blocks this close are neighbours across a street; one this close to the wall line lies along it. */
const NEIGHBOUR_METERS = 14;
const WALL_METERS = 30;

export interface VectorWard {
  ward: WardKind;
  craftDomain?: GuildDomain;
}

const box = (points: Point[], pad = 0) => {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
};

function ringGap(a: Point[], b: Point[]): number {
  let best = Infinity;
  for (const [p, ring] of [
    [a, b],
    [b, a]
  ] as const)
    for (const q of p)
      for (let i = 0; i < ring.length; i++) {
        best = Math.min(best, pointSegmentDistance(q, ring[i], ring[(i + 1) % ring.length]));
        if (best < 1e-6) return 0;
      }
  return best;
}

/** The street block (perimeter cell) a parcel district belongs to. */
export const streetBlockOf = (districtId: string) => districtId.replace(/:parcel:\d+$/, "");

/**
 * The economic wards of a town's districts by the mesh editor's ward mix (P6g, `assignWardMix`): the FMG economy's
 * craftsman streets by guild, merchant streets by commerce rank, patricians, slums, administration, military and
 * the rest, each taking the street block the mesh editor's location rules score best. Only districts of the town
 * (inside the wall, or the core of an open town) take a ward; the rest keep none. The map holds both the street
 * blocks and their parcel districts.
 */
export function assignVectorWards(
  doc: VectorCityDocument,
  districts: readonly { id: string; inside: boolean; core: boolean; polygon: VectorPolygon }[]
): Map<string, VectorWard> {
  // A ward is a street block, as a mesh cell is in the mesh editor; its parcels share it.
  const groups = new Map<string, Point[]>();
  for (const d of districts) {
    if (!d.core) continue;
    const key = streetBlockOf(d.id);
    groups.set(key, [...(groups.get(key) ?? []), ...d.polygon.outer]);
  }
  const town = [...groups].map(([id, points]) => ({ id, ring: convexHull(points) })).filter(t => t.ring.length >= 3);
  if (!town.length) return new Map();
  const spots: WardSpot[] = town.map((d, i) => ({
    id: i,
    polygon: d.ring,
    centroid: polygonCentroid(d.ring),
    neighbors: []
  }));
  const index = new RBush<ReturnType<typeof box> & { id: number }>();
  index.load(spots.map(s => ({ ...box(s.polygon), id: s.id })));
  for (const s of spots)
    s.neighbors = index
      .search(box(s.polygon, NEIGHBOUR_METERS))
      .filter(o => o.id !== s.id && ringGap(s.polygon, spots[o.id].polygon) <= NEIGHBOUR_METERS)
      .map(o => o.id)
      .sort((a, b) => a - b);
  const walls = Object.values(doc.paths)
      .filter(p => p.role === "wall")
      .map(p => samplePath(p).map(q => q.point)),
    plaza = doc.environment?.features[CIVIC_PLAZA_ID],
    site = doc.site;
  const { wards, craftDomains } = assignWardMix(spots, {
    seed: doc.recipe.seed,
    plazaAnchor: plaza ? polygonCentroid(plaza.boundary.outer) : (site?.center ?? [0, 0]),
    walled: walls.length > 0,
    touchesWall: spot =>
      walls.some(line =>
        spot.polygon.some(p => line.slice(1).some((b, i) => pointSegmentDistance(p, line[i], b) <= WALL_METERS))
      ),
    economy: site?.descriptor?.economy,
    rivers: Object.values(doc.paths)
      .filter(p => p.role === "river" && p.id !== "town-moat")
      .map(p => samplePath(p).map(q => q.point))
  });
  const out = new Map<string, VectorWard>();
  for (const [i, ward] of wards) {
    const craftDomain = craftDomains.get(i);
    out.set(town[i].id, craftDomain ? { ward, craftDomain } : { ward });
  }
  for (const d of districts) {
    const ward = d.core ? out.get(streetBlockOf(d.id)) : undefined;
    if (ward && d.id !== streetBlockOf(d.id)) out.set(d.id, ward);
  }
  return out;
}

/** The mesh editor's height kind of a house in a ward (`buildingHeightPolicy`): patricians build rich, merchants
 * and the market commercial. */
export function wardHeightKind(ward: WardKind | undefined): ResidentialHeightKind {
  if (ward === "patriciate") return "rich";
  if (ward === "market" || ward === "merchant") return "commercial";
  return "ordinary";
}
