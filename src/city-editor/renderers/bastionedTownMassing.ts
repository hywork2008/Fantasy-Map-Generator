// 3D masses for a bastioned town. The plan stores absolute heights. The scene
// ground is the cell surface, and grounding adds that surface again, so a rampart
// keeps only its height above the bank.

import * as THREE from "three";
import { defenseRegionPieces } from "../generators/bastionedTown/ditchGeometry";
import { nearestOnPolyline, pointInPolygon } from "../generators/geom";
import { TOWN_WATER_COLOR } from "../generators/townWater";
import type { StructureMassing } from "../types/contracts/structureMassing";
import type { CityDocument, Point } from "../types/document";

const DRY: readonly [number, number, number] = [0.45, 0.38, 0.28];
// Vertex colors are linear. This is the town river mesh color, not a second blue.
const river = new THREE.Color(TOWN_WATER_COLOR.river);
const WET: readonly [number, number, number] = [river.r, river.g, river.b];
const EARTH: readonly [number, number, number] = [0.85, 0.83, 0.76];
const STONE: readonly [number, number, number] = [0.36, 0.32, 0.27];
/** Flat plans store this deck directly. A sloped plan stores the bank plus this deck. */
const DECK_CLEARANCE_METERS = 1.2;

function reliefFrame(document: CityDocument): { relief: boolean; datum: number } {
  let low = Infinity;
  let high = -Infinity;
  for (const face of Object.values(document.mesh.faces)) {
    if (face.properties.water !== "land" || !Number.isFinite(face.properties.elevation)) continue;
    low = Math.min(low, face.properties.elevation);
    high = Math.max(high, face.properties.elevation);
  }
  const relief = Number.isFinite(low) && high - low > 1e-6;
  return { relief, datum: relief ? low : 0 };
}

function mass(values: Partial<StructureMassing> & Pick<StructureMassing, "id" | "kind">): StructureMassing {
  return {
    material: "stone",
    baseElevationMeters: 0,
    roof: "none",
    parapet: "none",
    parapetMeters: 0,
    parapetWidthMeters: 0,
    spire: false,
    heightMeters: 0,
    ...values
  };
}

function onSegment(rampart: Point[], point: Point): boolean {
  if (rampart.length < 2) return false;
  const [a, b] = rampart;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length));
  return Math.hypot(point[0] - (a[0] + dx * t), point[1] - (a[1] + dy * t)) < 1;
}

function cutCurtain(rampart: Point[], gate: Point, width: number): Point[][] {
  if (rampart.length < 4) return [rampart];
  const [a, b, c, d] = rampart;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy) || 1;
  const t = Math.max(0, Math.min(1, ((gate[0] - a[0]) * dx + (gate[1] - a[1]) * dy) / (length * length)));
  const half = Math.min(0.45, width / 2 / length);
  const leftT = Math.max(0, t - half);
  const rightT = Math.min(1, t + half);
  const point = (u: number, start: Point, end: Point): Point => [
    start[0] + (end[0] - start[0]) * u,
    start[1] + (end[1] - start[1]) * u
  ];
  const left: Point[] = [a, point(leftT, a, b), point(leftT, d, c), d];
  const right: Point[] = [point(rightT, a, b), b, c, point(rightT, d, c)];
  return [left, right].filter(ring => Math.hypot(ring[1][0] - ring[0][0], ring[1][1] - ring[0][1]) > 0.4);
}

export function bastionedTownStructures(document: CityDocument): StructureMassing[] {
  const plan = document.bastionedTown;
  if (!plan) return [];
  const frame = reliefFrame(document);
  const out: StructureMassing[] = [];
  const aboveBank = (base: number, crest: number) => Math.max(0.2, crest - base);
  plan.bastions.forEach(bastion => {
    const base = bastion.elevations.base[0] ?? 0;
    const crest = bastion.elevations.crest[0] ?? base + 5;
    out.push(
      mass({
        id: bastion.id,
        kind: "wall",
        footprint: bastion.platform,
        baseElevationMeters: 0,
        heightMeters: aboveBank(base, crest),
        color: STONE,
        parapet: "outer",
        parapetMeters: 1.2,
        parapetWidthMeters: 0.6
      })
    );
  });
  plan.curtains.forEach(curtain => {
    if (curtain.closure === "sluice" || curtain.closure === "shore") return;
    const access = plan.accesses.find(
      item => item.role === "civic" && item.bridge[0] && onSegment(curtain.rampart, item.bridge[0])
    );
    const pieces = access ? cutCurtain(curtain.rampart, access.bridge[0], access.widthMeters) : [curtain.rampart];
    const base = curtain.elevations.base[0] ?? 0;
    const crest = curtain.elevations.crest[0] ?? base + 5;
    pieces.forEach((footprint, piece) => {
      out.push(
        mass({
          id: `${curtain.id}:${piece}`,
          kind: "wall",
          footprint,
          baseElevationMeters: 0,
          heightMeters: aboveBank(base, crest),
          color: STONE,
          parapet: "outer",
          parapetMeters: 1.2,
          parapetWidthMeters: 0.6
        })
      );
    });
  });
  for (const work of plan.outworks) {
    const base = work.elevations.base[0] ?? 0;
    const crest = work.elevations.crest[0] ?? base + 4.5;
    out.push(
      mass({
        id: work.id,
        kind: "wall",
        footprint: work.platform,
        baseElevationMeters: 0,
        heightMeters: aboveBank(base, crest),
        color: STONE,
        parapet: "outer",
        parapetMeters: 1.2,
        parapetWidthMeters: 0.5
      })
    );
  }
  for (const ditch of plan.ditches) {
    let cursor = 0;
    ditch.region.forEach((poly, index) => {
      const offset = cursor;
      cursor += poly.outer.length;
      const at = (point: Point, values: number[]) => {
        const hit = nearestOnPolyline(point, [...poly.outer, poly.outer[0]]);
        const i = hit.segIndex,
          j = (i + 1) % poly.outer.length;
        const a = poly.outer[i],
          b = poly.outer[j];
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const t = length ? Math.min(1, Math.hypot(hit.point[0] - a[0], hit.point[1] - a[1]) / length) : 0;
        return values[offset + i] * (1 - t) + values[offset + j] * t - frame.datum;
      };
      const surface = (id: string, footprint: Point[], levels: number[], color: readonly [number, number, number]) => {
        out.push(
          mass({
            id,
            kind: "landmark",
            footprint,
            color,
            baseElevationMeters: Math.min(...levels) - 0.05,
            heightMeters: 0.05,
            sections: [
              { footprint, elevationsMeters: levels.map(h => h - 0.05) },
              { footprint, elevationsMeters: levels }
            ]
          })
        );
      };
      defenseRegionPieces([poly]).forEach((footprint, piece) => {
        const id = index === 0 && piece === 0 ? ditch.id : `${ditch.id}:${index}:${piece}`;
        surface(
          ditch.kind === "wet" ? `${id}:bed` : id,
          footprint,
          footprint.map(p => at(p, ditch.bed)),
          DRY
        );
        if (ditch.kind === "wet")
          surface(
            id,
            footprint,
            footprint.map(() => ditch.waterLevel! - frame.datum),
            WET
          );
      });
      for (const [ringIndex, ring] of [poly.outer, ...poly.holes].entries()) {
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i],
            b = ring[(i + 1) % ring.length];
          const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (length < 1e-6) continue;
          let nx = -(b[1] - a[1]) / length,
            ny = (b[0] - a[0]) / length;
          const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          const probe: Point = [mid[0] + nx * 0.01, mid[1] + ny * 0.01];
          if (!pointInPolygon(probe, poly.outer) || poly.holes.some(h => pointInPolygon(probe, h))) {
            nx = -nx;
            ny = -ny;
          }
          const run = Math.min(1, length / 4);
          const footprint: Point[] = [a, b, [b[0] + nx * run, b[1] + ny * run], [a[0] + nx * run, a[1] + ny * run]];
          surface(
            `${ditch.id}:bank:${index}:${ringIndex}:${i}`,
            footprint,
            [at(a, ditch.bank), at(b, ditch.bank), at(b, ditch.bed), at(a, ditch.bed)],
            DRY
          );
        }
      }
    });
  }
  for (const work of plan.works ?? []) {
    out.push(
      mass({
        id: work.id,
        kind: "landmark",
        footprint: work.polygon,
        heightMeters: work.kind === "barracks" ? 4 : 3,
        color: [0.42, 0.33, 0.27]
      })
    );
  }
  // The glacis is open ground that falls gently outward. Flat ground has no
  // slope to show, so a shallow slab stands in for it. On relief the cells
  // already are that slope. One foundation across the star band would rise to
  // the highest point on the outer ring and leave a ridge around the rampart.
  if (!frame.relief) {
    for (const region of plan.glacis) {
      const outer = region[0]?.outer;
      const hole = region[0]?.holes[0];
      if (!outer) continue;
      out.push(
        mass({
          id: `${plan.id}:glacis`,
          kind: "landmark",
          footprint: outer,
          holes: hole ? [hole] : undefined,
          heightMeters: 0.15,
          color: EARTH
        })
      );
    }
  }
  for (const access of plan.accesses) {
    const stored = access.elevations[0] ?? DECK_CLEARANCE_METERS;
    out.push(
      mass({
        id: access.id,
        kind: "bridge",
        centerline: access.bridge,
        widthMeters: access.widthMeters,
        heightMeters: 0.4,
        baseElevationMeters: frame.relief ? DECK_CLEARANCE_METERS : stored,
        // A flat site has no cell surface to add. A sloped site grounds the deck on the banks.
        ...(frame.relief ? {} : { baseElevationsMeters: access.elevations, topElevationsMeters: access.elevations }),
        color: [0.84, 0.81, 0.75]
      })
    );
  }
  return out;
}
