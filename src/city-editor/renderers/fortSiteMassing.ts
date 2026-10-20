import { fortDefenseRuns, fortHeight } from "../generators/fortSiteGeometry";
import { corridor } from "../generators/parcelGeometry";
import type { StructureMassing } from "../types/contracts/structureMassing";
import type { CityDocument, Point } from "../types/document";

/** Absolute assembly levels are converted to the common local terrain datum exactly once. */
export function fortSiteStructures(document: CityDocument): StructureMassing[] {
  const site = document.fortSite;
  if (!site) return [];
  const out: StructureMassing[] = [];
  const solid = (
    id: string,
    kind: StructureMassing["kind"],
    footprint: Point[],
    base: number,
    height: number,
    material: StructureMassing["material"] = "wood",
    roof: StructureMassing["roof"] = "none"
  ) => {
    const part: StructureMassing = {
      id: `fort-site:${id}`,
      kind,
      footprint,
      baseElevationMeters: base - site.groundElevationMeters,
      heightMeters: height,
      material,
      roof,
      parapet: "none",
      parapetMeters: 0,
      parapetWidthMeters: 0,
      spire: false
    };
    if (kind === "wall" || kind === "gate" || kind === "bridge" || height < 0.5) {
      part.sections = [
        { footprint, elevationsMeters: footprint.map(() => base - site.groundElevationMeters) },
        { footprint, elevationsMeters: footprint.map(() => base + height - site.groundElevationMeters) }
      ];
    }
    out.push(part);
    return part;
  };
  for (const defense of site.defenses) {
    for (const run of fortDefenseRuns(site, defense)) {
      // Individual upright timbers follow the level of their own footing.
      for (let i = 0; i < run.length - 1; i++) {
        const a = run[i],
          b = run[i + 1],
          length = Math.hypot(b[0] - a[0], b[1] - a[1]),
          count = Math.ceil(length / 0.6);
        for (let j = 0; j < count; j++) {
          const t = (j + 0.5) / count,
            p: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
            w = defense.widthMeters / 2;
          solid(
            `${defense.id}:${out.length}`,
            "wall",
            [
              [p[0] - w, p[1] - w],
              [p[0] + w, p[1] - w],
              [p[0] + w, p[1] + w],
              [p[0] - w, p[1] + w]
            ],
            fortHeight(site, p),
            defense.heightMeters
          );
        }
      }
    }
  }
  for (const gate of site.gates) {
    const defense = site.defenses.find(d => d.id === gate.defenseId);
    if (!defense) continue;
    const p: Point = [
      defense.center[0] + Math.cos(gate.angleRadians) * defense.radiusMeters,
      defense.center[1] + Math.sin(gate.angleRadians) * defense.radiusMeters
    ];
    const tangent: Point = [-Math.sin(gate.angleRadians), Math.cos(gate.angleRadians)];
    const a: Point = [p[0] - (tangent[0] * gate.widthMeters) / 2, p[1] - (tangent[1] * gate.widthMeters) / 2],
      b: Point = [p[0] + (tangent[0] * gate.widthMeters) / 2, p[1] + (tangent[1] * gate.widthMeters) / 2];
    for (const [i, q] of [a, b].entries())
      solid(
        `${gate.id}:post-${i}`,
        "gate",
        corridor([q[0] - 0.3, q[1]], [q[0] + 0.3, q[1]], 0.6),
        fortHeight(site, p),
        gate.heightMeters
      );
    solid(`${gate.id}:lintel`, "gate", corridor(a, b, 0.6, 0.3), fortHeight(site, p) + gate.heightMeters - 0.6, 0.6);
  }
  for (const route of site.routes) {
    for (let i = 0; i < route.points.length - 1; i++) {
      const a = route.points[i],
        b = route.points[i + 1],
        za = route.elevationsMeters[i],
        zb = route.elevationsMeters[i + 1];
      if (route.kind === "stairs") {
        const steps = Math.ceil(Math.abs(zb - za) / 0.18);
        for (let j = 0; j < steps; j++) {
          const p = (t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
          const z = za + ((zb - za) * (j + 1)) / steps;
          const part = solid(
            `${route.id}:${j}`,
            "bridge",
            corridor(p(j / steps), p((j + 1) / steps), route.widthMeters),
            z - 0.2,
            0.2
          );
          // Keep a closed section so terrain grounding never lifts the staircase again.
          part.sections = [
            {
              footprint: part.footprint!,
              elevationsMeters: part.footprint!.map(() => z - 0.2 - site.groundElevationMeters)
            },
            { footprint: part.footprint!, elevationsMeters: part.footprint!.map(() => z - site.groundElevationMeters) }
          ];
        }
      } else if (route.kind === "bridge") {
        const ring = corridor(a, b, route.widthMeters),
          part = solid(route.id, "bridge", ring, Math.min(za, zb) - 0.25, 0.25);
        part.sections = [
          {
            footprint: ring,
            elevationsMeters: [za - 0.25, zb - 0.25, zb - 0.25, za - 0.25].map(z => z - site.groundElevationMeters)
          },
          { footprint: ring, elevationsMeters: [za, zb, zb, za].map(z => z - site.groundElevationMeters) }
        ];
        for (const sign of [-1, 1]) {
          const len = Math.hypot(b[0] - a[0], b[1] - a[1]),
            offset: Point = [
              (((-(b[1] - a[1]) / len) * route.widthMeters) / 2) * sign,
              ((((b[0] - a[0]) / len) * route.widthMeters) / 2) * sign
            ];
          const rail = solid(
            `${route.id}:rail-${sign}`,
            "bridge",
            corridor([a[0] + offset[0], a[1] + offset[1]], [b[0] + offset[0], b[1] + offset[1]], 0.14),
            Math.min(za, zb) + 0.85,
            0.15
          );
          rail.sections = [
            {
              footprint: rail.footprint!,
              elevationsMeters: [za + 0.85, zb + 0.85, zb + 0.85, za + 0.85].map(z => z - site.groundElevationMeters)
            },
            {
              footprint: rail.footprint!,
              elevationsMeters: [za + 1, zb + 1, zb + 1, za + 1].map(z => z - site.groundElevationMeters)
            }
          ];
        }
      } else {
        const level = (za + zb) / 2,
          part = solid(`${route.id}:${i}`, "landmark", corridor(a, b, route.widthMeters), level - 0.04, 0.08);
        part.color = [0.56, 0.46, 0.3];
      }
    }
  }
  const castle = document.castles?.find(c => c.id === site.castleId);
  for (const spec of site.buildings) {
    const part = castle?.parts.find(p => p.id === spec.partId);
    if (!part) continue;
    const at =
      part.role === "keep" ? site.groundElevationMeters + site.motte.heightMeters : site.bailey.elevationMeters;
    const body = solid(part.id, "landmark", part.footprint, at, spec.heightMeters, spec.material, spec.roof);
    if (spec.use === "keep") {
      body.parapet = "outer";
      body.parapetMeters = 1;
      body.parapetWidthMeters = 0.5;
      for (const [i, p] of part.footprint.entries()) {
        const w = 1.8;
        const tower = solid(
          `${part.id}:corner-${i}`,
          "tower",
          [
            [p[0] - w, p[1] - w],
            [p[0] + w, p[1] - w],
            [p[0] + w, p[1] + w],
            [p[0] - w, p[1] + w]
          ],
          at + spec.heightMeters,
          spec.cornerTowerHeightMeters ?? 0,
          "stone",
          "flat"
        );
        tower.parapet = "outer";
        tower.parapetMeters = 0.8;
        tower.parapetWidthMeters = 0.4;
      }
    }
  }
  return out;
}
