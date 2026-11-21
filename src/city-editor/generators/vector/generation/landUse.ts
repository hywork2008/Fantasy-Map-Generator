import { STANDARD_BIOME_KEYS, type StandardBiomeKey } from "../../../../types/biome";
import type { Point } from "../../../types/primitives";
import type { VectorCityDocument } from "../../../types/vector/document";
import type { VectorPolygon } from "../../../types/vector/generation";
import type { VectorLandUse, VectorLandUseClass, VectorLandUseKind } from "../../../types/vector/landUse";
import { polygonCentroid } from "../../geom";
import { pathIsClosed } from "../geometry/curves";
import { regionArea, regionBoolean } from "../geometry/regions";
import { samplePath } from "../geometry/sampling";
import { simpleContour } from "../geometry/surfaces";
import { validateVectorLandUse } from "../landUse";
import { vectorCountryside, vectorForestSettings, vectorLandscapeClimate, vectorTreesGrow } from "./forest";
import { vectorFurlongs } from "./furlongs";
import { vectorReachableLand } from "./reachability";

/** Pieces smaller than this are slivers between the zones, left to the wild ground. */
const MIN_ZONE_M2 = 400;
/** Sides of the discs whose union draws a reach round the town, the roads and the rivers. */
const DISC_SIDES = 20;

/**
 * How far each use reaches, in metres: from the town's land (`town`), from its roads (`road`) and from its rivers
 * (`river`, irrigated plots in a dry land; `meadow`, hay meadow on the flood plain). `pasture` reaches from the town;
 * Infinity grazes all the open land. The rest is wild: woodland where trees grow, heath, marsh or barren ground.
 * Hypotheses for a pre-modern town of walking distance (a furlong is about 200 m), not agronomic constants.
 */
export const LAND_USE_REACH: Record<
  VectorLandUseClass,
  { town: number; road: number; river: number; meadow: number; meadowTown: number; pasture: number }
> = {
  temperate: { town: 420, road: 260, river: 0, meadow: 45, meadowTown: 0, pasture: 650 },
  boreal: { town: 160, road: 90, river: 0, meadow: 30, meadowTown: 0, pasture: 240 },
  steppe: { town: 90, road: 0, river: 110, meadow: 0, meadowTown: 0, pasture: Number.POSITIVE_INFINITY },
  desert: { town: 60, road: 0, river: 70, meadow: 0, meadowTown: 0, pasture: 0 },
  wetland: { town: 110, road: 60, river: 0, meadow: 200, meadowTown: 450, pasture: 0 },
  moor: { town: 140, road: 80, river: 0, meadow: 30, meadowTown: 0, pasture: 700 },
  cold: { town: 0, road: 0, river: 0, meadow: 0, meadowTown: 0, pasture: 220 }
};

/** Every standard biome names its farming, so adding a biome means choosing one. */
export const LAND_USE_CLASS: Record<StandardBiomeKey, VectorLandUseClass> = {
  marine: "temperate",
  hotDesert: "desert",
  coldDesert: "desert",
  savanna: "steppe",
  grassland: "temperate",
  tropicalSeasonalForest: "temperate",
  temperateDeciduousForest: "temperate",
  tropicalRainforest: "boreal",
  temperateRainforest: "temperate",
  taiga: "boreal",
  tundra: "cold",
  glacier: "cold",
  wetland: "wetland",
  centralEuropeanGreatForest: "temperate",
  mediterraneanWoodlandScrub: "temperate",
  temperateConiferousForest: "temperate",
  montaneForest: "boreal",
  alpineTundra: "cold",
  mangrove: "wetland",
  xericShrubland: "steppe",
  cloudForest: "boreal",
  heathMoorland: "moor",
  floodedForest: "wetland",
  coldSteppe: "steppe",
  tropicalDryForest: "steppe",
  borealPeatland: "wetland",
  volcanicBarrens: "desert",
  lavaField: "desert",
  volcanicSoil: "temperate"
};

/** The town's farming by the FMG burg's biome (its key, else the climate's), temperate when unknown. */
export function vectorLandUseClass(doc: VectorCityDocument): VectorLandUseClass {
  const climate = vectorLandscapeClimate(doc);
  for (const key of [climate.biome?.key, climate.climateBiomeKey]) {
    const known = STANDARD_BIOME_KEYS.find(k => k.toLowerCase() === key?.toLowerCase());
    if (known) return LAND_USE_CLASS[known];
  }
  return "temperate";
}

const disc = (c: Point, r: number): VectorPolygon => ({
  outer: Array.from({ length: DISC_SIDES }, (_, i): Point => {
    const a = (i / DISC_SIDES) * Math.PI * 2;
    return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r];
  }),
  holes: []
});

/** Points along a line `step` apart (and its last point). */
function along(line: Point[], step: number, closed = false): Point[] {
  const pts = closed ? [...line, line[0]] : line;
  if (!pts.length) return [];
  const out: Point[] = [pts[0]];
  let left = step;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1],
      b = pts[i],
      l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let at = 0;
    while (l - at >= left) {
      at += left;
      out.push([a[0] + ((b[0] - a[0]) * at) / l, a[1] + ((b[1] - a[1]) * at) / l]);
      left = step;
    }
    left -= l - at;
  }
  if (!closed && pts.length > 1) out.push(pts.at(-1)!);
  return out;
}

/** Ground within `r` of the lines: discs every `r/2`, whose union bulges a little between them like a hedge line. */
function reach(lines: { points: Point[]; closed?: boolean }[], r: number, base: VectorPolygon[] = []): VectorPolygon[] {
  if (r <= 0) return [];
  const step = Math.max(8, r / 2),
    discs = lines.flatMap(l => along(l.points, step, l.closed).map(p => disc(p, r)));
  return discs.length || base.length ? regionBoolean([...base, ...discs], [], "union") : [];
}

const clean = (regions: VectorPolygon[]) =>
  regions.filter(
    r => regionArea(r) >= MIN_ZONE_M2 && simpleContour(r.outer, true) && r.holes.every(h => simpleContour(h, true))
  );

/** The town centre a carter starts from: the outer wall's centre, else the largest piece of the town's land. */
function townCentre(doc: VectorCityDocument): Point {
  const wall = Object.values(doc.paths).find(p => p.role === "wall" && pathIsClosed(p) && !p.id.includes("inner"));
  if (wall) return polygonCentroid(samplePath(wall).map(s => s.point));
  const land = doc.site!.domain.reduce((a, b) => (regionArea(b) > regionArea(a) ? b : a));
  return polygonCentroid(land.outer);
}

/**
 * The open land beyond the town split by use (pre-acceptance U5b): hay meadow on the river's flood plain, arable
 * round the town and out along its roads, pasture beyond, and wild ground past that, each as far as the town's biome
 * farms (`LAND_USE_REACH`), half as far with no pasture when the forest settings ask woodland round the town. Only land reached from the town centre through the gates and over the bridges (U5) is
 * farmed; ground cut off stays wild. A dry land farms only irrigated plots by its rivers and round the town.
 */
export function raiseVectorLandUse(
  doc: VectorCityDocument,
  townLand: VectorPolygon[] = [],
  /** `furlongs: false` leaves the arable unstripped. */
  options: { furlongs?: boolean } = {}
): VectorCityDocument {
  if (!doc.site?.domain.length) return doc;
  const landClass = vectorLandUseClass(doc),
    wooded = vectorForestSettings(doc)?.mode === "surroundings" && vectorTreesGrow(doc),
    base = LAND_USE_REACH[landClass],
    // Woodland asked round the town: the fields reach half as far and the beasts graze the wood (wood-pasture).
    r = wooded ? { ...base, town: base.town / 2, road: base.road / 2, pasture: 0 } : base,
    countryside = vectorCountryside(doc, townLand);
  if (!countryside.length) return doc;
  const reachable = vectorReachableLand(doc, townCentre(doc)),
    open = reachable ? regionBoolean(countryside, reachable, "intersection") : countryside,
    townAll = [...doc.site.domain, ...townLand],
    town = townAll.map(d => ({ points: d.outer, closed: true })),
    roads = Object.values(doc.paths)
      .filter(p => p.role === "road")
      .map(p => ({ points: samplePath(p).map(s => s.point) })),
    rivers = Object.values(doc.paths)
      .filter(p => p.role === "river" && p.id !== "town-moat")
      .map(p => ({ points: samplePath(p).map(s => s.point) })),
    zones = new Map<VectorLandUseKind, VectorPolygon[]>();
  let taken: VectorPolygon[] = [];
  const claim = (kind: VectorLandUseKind, ground: VectorPolygon[]) => {
    if (!ground.length) return;
    const regions = clean(
      regionBoolean(regionBoolean(open, ground, "intersection"), taken, "difference").filter(x => x.outer.length >= 3)
    );
    if (!regions.length) return;
    zones.set(kind, [...(zones.get(kind) ?? []), ...regions]);
    taken = regionBoolean([...taken, ...regions], [], "union");
  };
  claim("meadow", reach(rivers, r.meadow));
  claim("arable", [
    ...reach(town, r.town, r.town > 0 ? townAll : []),
    ...reach(roads, r.road),
    ...reach(rivers, r.river)
  ]);
  // A wet land mows what it does not plough round the town.
  claim("meadow", reach(town, r.meadowTown, townAll));
  claim("pasture", r.pasture === Number.POSITIVE_INFINITY ? open : reach(town, r.pasture, townAll));
  const wild = clean(regionBoolean(countryside, taken, "difference"));
  if (wild.length) zones.set("wild", wild);
  if (!zones.size) return doc;
  const landUse: VectorLandUse = {
    version: 1,
    landClass,
    zones: [...zones].map(([kind, regions]) => ({
      kind,
      regions,
      areaM2: regions.reduce((n, x) => n + regionArea(x), 0)
    }))
  };
  const furlongs =
    options.furlongs === false
      ? []
      : vectorFurlongs(
          zones.get("arable") ?? [],
          roads.map(r => r.points),
          doc.recipe.seed,
          townCentre(doc),
          // The dry south kept the two-field course (corn and fallow); elsewhere three fields.
          landClass === "steppe" || landClass === "desert" ? 2 : 3
        );
  if (furlongs.length) landUse.furlongs = furlongs;
  const next: VectorCityDocument = {
    ...doc,
    environment: { features: {}, hidden: [], ...doc.environment, landUse }
  };
  return validateVectorLandUse(next).length ? doc : next;
}
