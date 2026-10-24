// 3D masses for a bastioned town. Heights come from the saved plan.

import type { StructureMassing } from "../types/contracts/structureMassing";
import type { CityDocument, Point } from "../types/document";

const DRY: readonly [number, number, number] = [0.45, 0.38, 0.28];
const WET: readonly [number, number, number] = [0.31, 0.53, 0.66];
const EARTH: readonly [number, number, number] = [0.85, 0.83, 0.76];
const STONE: readonly [number, number, number] = [0.36, 0.32, 0.27];

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
  const out: StructureMassing[] = [];
  plan.bastions.forEach(bastion => {
    const crest = bastion.elevations.crest[0] ?? 5;
    out.push(
      mass({
        id: bastion.id,
        kind: "wall",
        footprint: bastion.platform,
        heightMeters: crest,
        color: STONE,
        parapet: "outer",
        parapetMeters: 1.2,
        parapetWidthMeters: 0.6
      })
    );
  });
  plan.curtains.forEach((curtain, index) => {
    const access = plan.accesses.find(item => item.role === "civic" && item.gateId === `gc:gate-${index}`);
    const pieces = access ? cutCurtain(curtain.rampart, access.bridge[0], access.widthMeters) : [curtain.rampart];
    const crest = curtain.elevations.crest[0] ?? 5;
    pieces.forEach((footprint, piece) => {
      out.push(
        mass({
          id: `${curtain.id}:${piece}`,
          kind: "wall",
          footprint,
          heightMeters: crest,
          color: STONE,
          parapet: "outer",
          parapetMeters: 1.2,
          parapetWidthMeters: 0.6
        })
      );
    });
  });
  for (const work of plan.outworks) {
    out.push(
      mass({
        id: work.id,
        kind: "wall",
        footprint: work.platform,
        heightMeters: work.elevations.crest[0] ?? 4.5,
        color: STONE,
        parapet: "outer",
        parapetMeters: 1.2,
        parapetWidthMeters: 0.5
      })
    );
  }
  for (const ditch of plan.ditches) {
    const outer = ditch.region[0]?.outer;
    const hole = ditch.region[0]?.holes[0];
    if (!outer || outer.length < 3) continue;
    out.push(
      mass({
        id: ditch.id,
        kind: "landmark",
        footprint: outer,
        holes: hole ? [hole] : undefined,
        heightMeters: 0.2,
        baseElevationMeters: ditch.bed[0] ?? -3,
        color: ditch.kind === "wet" ? WET : DRY,
        sections: [
          { footprint: outer, elevationsMeters: ditch.bed },
          ...(hole ? [{ footprint: hole, elevationsMeters: hole.map(() => ditch.bank[0] ?? 0) }] : [])
        ]
      })
    );
  }
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
  for (const access of plan.accesses) {
    out.push(
      mass({
        id: access.id,
        kind: "bridge",
        centerline: access.bridge,
        widthMeters: access.widthMeters,
        heightMeters: 0.4,
        baseElevationMeters: access.elevations[0] ?? 1.2,
        baseElevationsMeters: access.elevations,
        topElevationsMeters: access.elevations,
        color: [0.84, 0.81, 0.75]
      })
    );
  }
  return out;
}
