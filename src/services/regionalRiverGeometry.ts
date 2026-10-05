import type { WorldContext } from "../context/worldContext";
import type { River } from "../types/models";
import { registerPhysicalWaterPartitions } from "./indexedPhysicalWater";
import { buildCubicRiverAxis, type CubicRiverAxis } from "./riverCurveGeometry";
import type { RiverPoint } from "./riverGeometry";
import { type PhysicalRiverGeometry, type RiverBankReference, validWaterPolygon } from "./riverPhysicalGeometry";
import { buildPhysicalRiverGeometry } from "./riverPhysicalGeometryBuilder";
import { type SpatialBounds, SpatialBoundsIndex } from "./spatialBoundsIndex";
import { prepareWorldRiverGeometry, type WorldRiverGeometrySettings } from "./worldRiverGeometry";

type Prepared = Extract<ReturnType<typeof prepareWorldRiverGeometry>, { curves: unknown }>;
interface Section {
  id: number;
  bounds: SpatialBounds;
}
type Patch =
  | {
      geometry: PhysicalRiverGeometry;
      sampleCount: number;
      l: RiverPoint[];
      r: RiverPoint[];
      lr: RiverBankReference[];
      rr: RiverBankReference[];
    }
  | { reason: string };
export interface RegionalRiverSuccess {
  geometry: PhysicalRiverGeometry;
  geometryVersion: number;
  metersPerMapUnit: number;
  bounds: SpatialBounds;
  coverageBounds: SpatialBounds;
  sourceSegments: number[];
  artificialCaps: [number, number][];
}
export type RegionalRiverResult = RegionalRiverSuccess | { reason: string; bounds: SpatialBounds | null };
let nextVersion = 1;
/** Full source metadata is cheap; only requested cubic sections receive integrated/sampled banks. */
export class RegionalRiverGeometry {
  readonly version = nextVersion++;
  readonly sections: Section[];
  private index: SpatialBoundsIndex<Section>;
  private patches = new Map<number, Patch>();
  private shapes = new Map<string, RegionalRiverSuccess>();
  sectionBuilds = 0;
  constructor(
    readonly riverId: number,
    readonly source: Prepared,
    readonly settings: WorldRiverGeometrySettings
  ) {
    this.sections = source.curves.map((curve, id) => {
      const half = Math.max(source.widths[id], source.widths[id + 1]) / 2 + 1e-7;
      return {
        id,
        bounds: {
          minX: Math.min(...curve.map(p => p[0])) - half,
          maxX: Math.max(...curve.map(p => p[0])) + half,
          minY: Math.min(...curve.map(p => p[1])) - half,
          maxY: Math.max(...curve.map(p => p[1])) + half
        }
      };
    });
    this.index = new SpatialBoundsIndex(this.sections, section => section.bounds);
  }
  private patch(id: number): Patch {
    const cached = this.patches.get(id);
    if (cached) return cached;
    this.sectionBuilds++;
    const built = buildCubicRiverAxis(this.riverId, this.version, [this.source.curves[id]], {
      ...this.settings.precision,
      arcToleranceMeters: this.settings.precision.arcToleranceMeters / this.source.curves.length
    });
    let result: Patch;
    if (!("axis" in built)) result = built;
    else {
      // Preserve the evaluator tolerance of the full reference axis.
      built.axis.precision = { ...this.settings.precision };
      const builtPhysical = buildPhysicalRiverGeometry(
        built.axis,
        [
          { arcLengthMeters: 0, widthMeters: this.source.widths[id] },
          { arcLengthMeters: built.axis.length, widthMeters: this.source.widths[id + 1] }
        ],
        this.settings.banks
      );
      if (!("geometry" in builtPhysical)) result = builtPhysical;
      else {
        const water = builtPhysical.geometry.water;
        for (const ring of water.rings) {
          for (const p of ring) Object.freeze(p);
          Object.freeze(ring);
        }
        Object.freeze(water.rings);
        Object.freeze(water);
        const ring = water.rings[0];
        const refs = water.bankReferences![0];
        const split = refs.indexOf(null);
        const l = ring.slice(0, split + 1);
        const r = ring.slice(split + 1).toReversed();
        if (r.length < l.length) r.unshift(l[0]);
        const lr = refs.slice(0, split).map(ref => ({ ...ref! }));
        const rr = refs
          .slice(split + 1)
          .filter((ref): ref is RiverBankReference => !!ref)
          .toReversed()
          .map(ref => ({ ...ref }));
        result = { ...builtPhysical, l, r, lr, rr };
      }
    }
    this.patches.set(id, result);
    return result;
  }
  query(coverage: SpatialBounds): RegionalRiverResult | null {
    const steps = this.querySteps(coverage);
    let result = steps.next();
    while (!result.done) result = steps.next();
    return result.value;
  }
  *querySteps(coverage: SpatialBounds): Generator<void, RegionalRiverResult | null> {
    const selected = this.index
      .query(coverage)
      .filter(s => this.source.widths[s.id] > 0 || this.source.widths[s.id + 1] > 0);
    if (!selected.length) return null;
    // Include one neighboring wet section to keep artificial caps outside the requested domain.
    const ids = new Set(selected.map(s => s.id));
    for (const s of selected)
      for (const id of [s.id - 1, s.id + 1]) {
        if (id >= 0 && id < this.sections.length && (this.source.widths[id] > 0 || this.source.widths[id + 1] > 0))
          ids.add(id);
      }
    const sorted = [...ids].sort((a, b) => a - b);
    // A wide request must fail explicitly instead of performing unbounded work.
    if (sorted.length > 128) return { reason: "region-budget", bounds: coverage };
    const key = sorted.join(",");
    const cached = this.shapes.get(key);
    if (cached) {
      if (!this.capsOutside(cached, coverage)) return { reason: "incomplete-coverage", bounds: coverage };
      return { ...cached, bounds: coverage, coverageBounds: { ...coverage } };
    }
    const segments: CubicRiverAxis["segments"][number][] = [];
    const rings: RiverPoint[][] = [];
    const references: (RiverBankReference | null)[][] = [];
    const caps: [number, number][] = [];
    let length = 0;
    let vertices = 0;
    let left: RiverPoint[] = [],
      right: RiverPoint[] = [];
    let leftRefs: RiverBankReference[] = [],
      rightRefs: RiverBankReference[] = [];
    let runStart = -1,
      runEnd = -1;
    const flush = () => {
      if (!left.length) return;
      const dx = left[0][0] - right[0][0],
        dy = left[0][1] - right[0][1];
      const tip = dx * dx + dy * dy <= 1e-18;
      const ring = [...left, ...right.toReversed()];
      const refs: (RiverBankReference | null)[] = [...leftRefs, null, ...rightRefs.toReversed(), null];
      if (tip) {
        ring.pop();
        refs.pop();
      }
      const index = rings.length;
      rings.push(ring);
      references.push(refs);
      if (runStart > 0 && !tip) caps.push([index, ring.length - 1]);
      if (runEnd < this.sections.length - 1) caps.push([index, left.length - 1]);
      left = [];
      right = [];
      leftRefs = [];
      rightRefs = [];
    };
    for (const id of sorted) {
      if (runEnd !== id - 1) {
        flush();
        if (segments.length) length += 1;
      }
      const patch = this.patch(id);
      yield;
      if (!("geometry" in patch)) return { reason: patch.reason, bounds: this.sections[id].bounds };
      vertices += patch.geometry.water.rings.reduce((n, ring) => n + ring.length, 0);
      if (vertices > 20000) return { reason: "region-budget", bounds: coverage };
      const axis = patch.geometry.axis as CubicRiverAxis;
      const l = patch.l;
      const r = patch.r;
      const lr = patch.lr.map(ref => ({ ...ref, arcStart: ref.arcStart + length, arcEnd: ref.arcEnd + length }));
      const rr = patch.rr.map(ref => ({ ...ref, arcStart: ref.arcStart + length, arcEnd: ref.arcEnd + length }));
      if (!left.length) {
        runStart = id;
        left = [...l];
        right = [...r];
      } else {
        const lastL = left[left.length - 1],
          lastR = right[right.length - 1];
        const dlx = lastL[0] - l[0][0],
          dly = lastL[1] - l[0][1];
        const drx = lastR[0] - r[0][0],
          dry = lastR[1] - r[0][1];
        if (dlx * dlx + dly * dly > 1e-12 || drx * drx + dry * dry > 1e-12)
          return { reason: "unstable-axis", bounds: this.sections[id].bounds };
        for (let k = 1; k < l.length; k++) left.push(l[k]);
        for (let k = 1; k < r.length; k++) right.push(r[k]);
      }
      for (let k = 0; k < lr.length; k++) leftRefs.push(lr[k]);
      for (let k = 0; k < rr.length; k++) rightRefs.push(rr[k]);
      segments.push(...axis.segments.map(segment => ({ ...segment, index: id, arcStart: segment.arcStart + length })));
      length += axis.length;
      runEnd = id;
    }
    flush();
    const water = { id: this.riverId, rings, bankReferences: references };
    if (!validWaterPolygon(water)) return { reason: "folded-banks", bounds: coverage };
    const geometry: PhysicalRiverGeometry = {
      axis: {
        kind: "cubicBezier",
        riverId: this.riverId,
        geometryVersion: this.version,
        length,
        segments,
        precision: this.settings.precision
      },
      water
    };
    for (const ring of rings) {
      Object.freeze(ring);
    }
    Object.freeze(rings);
    Object.freeze(references);
    Object.freeze(water);
    const result: RegionalRiverSuccess = {
      geometry,
      geometryVersion: this.version,
      metersPerMapUnit: this.source.scale,
      bounds: coverage,
      coverageBounds: { ...coverage },
      sourceSegments: sorted,
      artificialCaps: caps
    };
    if (!this.capsOutside(result, coverage)) return { reason: "incomplete-coverage", bounds: coverage };
    registerPhysicalWaterPartitions(
      water,
      sorted.map(id => (this.patches.get(id) as Extract<Patch, { geometry: unknown }>).geometry.water)
    );
    if (this.shapes.size >= 256) this.shapes.delete(this.shapes.keys().next().value!);
    this.shapes.set(key, result);
    return result;
  }
  private capsOutside(result: RegionalRiverSuccess, coverage: SpatialBounds) {
    for (const [r, i] of result.artificialCaps) {
      const ring = result.geometry.water.rings[r],
        a = ring[i],
        b = ring[(i + 1) % ring.length];
      if (
        Math.min(a[0], b[0]) <= coverage.maxX &&
        Math.max(a[0], b[0]) >= coverage.minX &&
        Math.min(a[1], b[1]) <= coverage.maxY &&
        Math.max(a[1], b[1]) >= coverage.minY
      )
        return false;
    }
    return true;
  }
}
const registry = new WeakMap<object, Map<number, { key: string; value: RegionalRiverGeometry | { reason: string } }>>();
export function regionalRiverGeometry(
  world: Readonly<WorldContext>,
  river: Readonly<River>,
  unit: string,
  settings: WorldRiverGeometrySettings
) {
  const source = prepareWorldRiverGeometry(world, river, unit, settings);
  const key = JSON.stringify([source, settings]);
  let entries = registry.get(world.pack);
  if (!entries) {
    entries = new Map();
    registry.set(world.pack, entries);
  }
  const cached = entries.get(river.i);
  if (cached?.key === key) return cached.value;
  const value: RegionalRiverGeometry | { reason: string } =
    "curves" in source && source.curves
      ? new RegionalRiverGeometry(river.i, source, settings)
      : { reason: source.reason ?? "invalid-source" };
  entries.set(river.i, { key, value });
  return value;
}
