import { describe, expect, it } from "vitest";
import fixture from "../../../data/fixtures/erente-20261009.json";
import obern from "../../../data/fixtures/obern-20261027.json";
import type { BurgSiteDescriptor } from "../../../types/contracts/burgSiteDescriptor";
import { defaultGenerationSettings } from "../../generation/settings";
import { defaultPopulationSettings } from "../../populationPlan";
import { evaluateAnchor } from "../geometry/curves";
import { samplePath } from "../geometry/sampling";
import { vectorInputFromEditor } from "./editorInput";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./pipeline";
import { vectorWallChoice } from "./wallShape";

function skeletonOf(json: unknown) {
  const raw = json as { descriptor?: BurgSiteDescriptor };
  const d = structuredClone(raw.descriptor ?? (json as BurgSiteDescriptor)),
    settings = {
      ...defaultGenerationSettings(),
      descriptor: d,
      population: defaultPopulationSettings(d.burg.population)
    },
    seed = d.burg.seed ?? String(d.burg.id),
    frame = { extentMeters: d.frame.extentMeters, cityRadiusMeters: d.frame.cityRadiusMeters, blockSizeMeters: 50 },
    input = vectorInputFromEditor({ settings, seed, frame, lotOccupancy: 1 }),
    wall = vectorWallChoice(settings, seed, input.context.historicalPeriod ?? "ageOfExploration", frame.extentMeters);
  return generateVectorSkeleton(input, { ...DEFAULT_VECTOR_GENERATION, seed, ...wall }).document;
}

describe("approach roads spread round the wall and cross it square (pre-acceptance U1)", () => {
  it("keeps FMG approaches from one side apart at their gates and lays each road square through its gate", () => {
    // Erente's three roads into the centre reach the wall within 49 degrees; they once took gates 13 degrees apart.
    const doc = skeletonOf(fixture),
      center = doc.site!.center,
      gates = Object.values(doc.connections.gates).filter(g => g.kind === "passage" && g.wallPathId === "auto-wall");
    expect(gates.length).toBe(3);
    const bearings = gates
      .map(g => {
        const p = evaluateAnchor(doc.paths[g.wallPathId], g.anchor);
        return (Math.atan2(p[1] - center[1], p[0] - center[0]) * 180) / Math.PI;
      })
      .sort((a, b) => a - b);
    bearings.forEach((b, i) => {
      expect((bearings[(i + 1) % bearings.length] - b + 360) % 360).toBeGreaterThan(35);
    });
    for (const g of gates) {
      const along = evaluateAnchor(doc.paths[g.wallPathId], g.anchor, true),
        road = doc.connections.nodes[g.nodeId].anchors.find(a => doc.paths[a.pathId].role === "road")!,
        across = evaluateAnchor(doc.paths[road.pathId], road, true),
        sine = Math.abs(along[0] * across[1] - along[1] * across[0]) / Math.hypot(...along) / Math.hypot(...across);
      // Square to the wall within 2 degrees.
      expect(sine).toBeGreaterThan(Math.cos((2 * Math.PI) / 180));
    }
  });
  it("bends the road to a rival's town sharply before its gate", () => {
    // Obern's road 327 leads to a rival; its gate road turns at least 60 degrees within 40 m outside the gate.
    const doc = skeletonOf(obern),
      center = doc.site!.center,
      gate = Object.values(doc.connections.gates).find(
        g =>
          doc.connections.nodes[g.nodeId].anchors.some(a => a.pathId.startsWith("auto-approach")) &&
          doc.connections.nodes[g.nodeId].anchors.some(a => {
            const p = doc.paths[a.pathId];
            return Object.values(doc.connections.nodes).some(
              n => n.anchors.some(b => b.pathId === p.id) && n.anchors.some(b => b.pathId === "fmg-road:327:5")
            );
          })
      )!;
    expect(gate).toBeDefined();
    const at = doc.connections.nodes[gate.nodeId].position,
      road = doc.connections.nodes[gate.nodeId].anchors.find(a => doc.paths[a.pathId].role === "road")!,
      line = samplePath(doc.paths[road.pathId])
        .map(s => s.point)
        .filter((p, i, all) => i === 0 || Math.hypot(p[0] - all[i - 1][0], p[1] - all[i - 1][1]) > 0.05);
    const turns = line.slice(1, -1).flatMap((p, i) => {
      const a = line[i],
        b = line[i + 2],
        u = [p[0] - a[0], p[1] - a[1]],
        v = [b[0] - p[0], b[1] - p[1]],
        cos = (u[0] * v[0] + u[1] * v[1]) / Math.hypot(u[0], u[1]) / Math.hypot(v[0], v[1]);
      const outside = Math.hypot(p[0] - center[0], p[1] - center[1]) > Math.hypot(at[0] - center[0], at[1] - center[1]);
      return outside && Math.hypot(p[0] - at[0], p[1] - at[1]) < 40
        ? [(Math.acos(Math.min(1, cos)) * 180) / Math.PI]
        : [];
    });
    expect(Math.max(...turns)).toBeGreaterThan(60);
  });
  it("lays the road square through the gates of straight-sided walls, ends near the wall included", () => {
    // Bastioned s2 and polygon s3 once kept roads 49 and 19 degrees off square: each road ended just inside the
    // wall, where a civic feature is reached from its end.
    for (const [shape, seed] of [
      ["bastioned", "s2"],
      ["polygon", "s3"]
    ] as const) {
      const settings = {
          ...defaultGenerationSettings(),
          population: defaultPopulationSettings(3000),
          historicalPeriod: "ageOfExploration" as const,
          buildingPattern: "medieval" as const,
          wallShape: shape,
          wallSides: 6
        },
        input = vectorInputFromEditor({
          settings,
          seed,
          frame: { extentMeters: 1200, cityRadiusMeters: 396, blockSizeMeters: 50 },
          lotOccupancy: 1
        }),
        doc = generateVectorSkeleton(input, {
          ...DEFAULT_VECTOR_GENERATION,
          seed,
          ...vectorWallChoice(settings, seed, "ageOfExploration")
        }).document;
      for (const g of Object.values(doc.connections.gates).filter(g => g.kind === "passage")) {
        const along = evaluateAnchor(doc.paths[g.wallPathId], g.anchor, true),
          at = doc.connections.nodes[g.nodeId].position;
        for (const a of doc.connections.nodes[g.nodeId].anchors) {
          const road = doc.paths[a.pathId];
          if (road.role !== "road") continue;
          const line = samplePath(road).map(q => q.point);
          // Every piece of the gate's road within 8 m of the gate runs square to the wall, within 2 degrees.
          for (let i = 1; i < line.length; i++) {
            const v = [line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]],
              mid = [(line[i][0] + line[i - 1][0]) / 2, (line[i][1] + line[i - 1][1]) / 2],
              length = Math.hypot(v[0], v[1]);
            if (length < 0.3 || Math.hypot(mid[0] - at[0], mid[1] - at[1]) > 8) continue;
            const sine = Math.abs(along[0] * v[1] - along[1] * v[0]) / Math.hypot(...along) / length;
            expect(sine, `${shape} ${seed} ${road.id}`).toBeGreaterThan(Math.cos((2 * Math.PI) / 180));
          }
        }
      }
    }
  });
});
