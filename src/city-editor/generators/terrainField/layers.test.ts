import { describe, expect, it } from "vitest";
import { renderTerrainFieldOverlay } from "../../renderers/terrainFieldSvg";
import type { Point } from "../../types/document";
import { clipEscarpmentTriangles } from "../cellPlateClip";
import { createGridDocument } from "../document";
import { pointInPolygon, polygonCentroid } from "../geom";
import { facePoints } from "../mesh";
import { riverRibbonRing } from "../riverRibbonRing";
import { gradeRoads } from "../roadGrading";
import { cityTerrain } from "../terrainElevation";
import { validateTerrainLayer } from "../terrainValidation";
import { refreshRiverCorridors, repairRiverBeds } from "./corridor";
import { editFaceElevation } from "./pads";
import { createCliffFortressStudy, createTerraceRiverStudy } from "./study";

describe("terrain layers", () => {
  it("refreshes changed widths and depths while preserving unchanged corridors and banks", () => {
    const document = createTerraceRiverStudy();
    const river = document.featureGroups.find(group => group.kind === "river")!;
    if (river.kind !== "river") throw new Error("Missing river");
    river.style.widthMeters = 6;
    refreshRiverCorridors(document);
    const corridor = document.terrain!.features.find(feature => feature.kind === "riverCorridor")!;
    if (corridor.kind !== "riverCorridor") throw new Error("Missing corridor");
    corridor.bank = { kind: "slope", runMeters: 9 };
    refreshRiverCorridors(document);
    expect(document.terrain!.features.find(feature => feature.kind === "riverCorridor")).toBe(corridor);
    expect(corridor.bank).toEqual({ kind: "slope", runMeters: 9 });
    river.style.widthMeters = 12;
    refreshRiverCorridors(document);
    const next = document.terrain!.features.find(feature => feature.kind === "riverCorridor")!;
    expect(next).not.toBe(corridor);
    if (next.kind !== "riverCorridor") throw new Error("Missing corridor");
    expect(next.widthsMeters.every(width => width === 12)).toBe(true);
    expect(next.depthMeters).toBe(1.4);
    // Wider rivers also replace the saved bed when their depth increases.
    river.style.widthMeters = 20;
    refreshRiverCorridors(document);
    const deep = document.terrain!.features.find(feature => feature.kind === "riverCorridor")!;
    if (deep.kind !== "riverCorridor") throw new Error("Missing corridor");
    expect(deep.depthMeters).toBe(2);
    expect(deep.bedMeters[0]).toBeCloseTo(next.bedMeters[0] - 0.6);
  });

  it("returns water at every vertex of the mitered river ribbon", () => {
    const document = createTerraceRiverStudy();
    const terrain = cityTerrain(document, { renderSpacing: 8 });
    for (const corridor of document.terrain!.features) {
      if (corridor.kind !== "riverCorridor") continue;
      const ring = riverRibbonRing(corridor.centerline, corridor.widthsMeters[0]);
      expect(ring).not.toBeNull();
      for (const point of ring!) expect(terrain.waterAt!(point)).not.toBeNull();
    }
  });

  it("keeps a river descending and level across its width, under pads of different heights", () => {
    const document = createTerraceRiverStudy();
    const terrain = cityTerrain(document, { renderSpacing: 8 });
    const corridor = document.terrain?.features.find(feature => feature.kind === "riverCorridor");
    expect(corridor?.kind).toBe("riverCorridor");
    if (corridor?.kind !== "riverCorridor" || !terrain.waterAt) return;
    const mid = Math.floor(corridor.centerline.length / 2);
    const at = corridor.centerline[mid];
    const next = corridor.centerline[Math.min(corridor.centerline.length - 1, mid + 1)];
    const dx = next[0] - at[0];
    const dy = next[1] - at[1];
    const length = Math.hypot(dx, dy) || 1;
    const normal: Point = [-dy / length, dx / length];
    const offset = corridor.widthsMeters[mid] / 4;
    const left: Point = [at[0] + normal[0] * offset, at[1] + normal[1] * offset];
    const right: Point = [at[0] - normal[0] * offset, at[1] - normal[1] * offset];
    const surface = corridor.bedMeters[mid] + corridor.depthMeters - terrain.datumMeters;
    expect(terrain.waterAt(at)).toBeCloseTo(surface, 4);
    expect(terrain.waterAt(left)).toBeCloseTo(terrain.waterAt(right)!, 4);
    expect(terrain.waterAt(corridor.centerline.at(-1)!)!).toBeLessThan(terrain.waterAt(corridor.centerline[0])!);
    const pads =
      document.terrain?.features.filter(feature => feature.kind === "platform" && feature.role === "pad") ?? [];
    expect(new Set(pads.map(pad => (pad.kind === "platform" ? pad.levelMeters : 0))).size).toBeGreaterThanOrEqual(3);
    for (const pad of pads) {
      if (pad.kind !== "platform" || pad.summit.kind !== "polygon") continue;
      const local = pad.levelMeters - terrain.datumMeters;
      expect(terrain.foundationAt(pad.summit.points)).toBeCloseTo(local, 1);
      expect(terrain.heightAt(polygonCentroid(pad.summit.points))).toBeCloseTo(local, 1);
      expect(pointInPolygon(at, pad.summit.points)).toBe(false);
    }
    const raised = structuredClone(document);
    const moved = raised.terrain?.features.find(feature => feature.kind === "platform" && feature.role === "pad");
    if (moved?.kind === "platform") moved.levelMeters = 80;
    const again = cityTerrain(raised, { renderSpacing: 8 });
    expect(again.waterAt?.(at)).toBeCloseTo(terrain.waterAt(at)!, 4);
    expect(again.heightAt(at)).toBeCloseTo(terrain.heightAt(at), 2);
    expect(corridor.bank.kind).toBe("quay");
    expect(renderTerrainFieldOverlay(document).querySelectorAll(".ce-quay").length).toBe(2);
  });

  it("lays a pad on the dry part of a cell and leaves the derived elevation", () => {
    const document = createTerraceRiverStudy();
    const corridor = document.terrain?.features.find(feature => feature.kind === "riverCorridor");
    if (corridor?.kind !== "riverCorridor") return;
    const at = corridor.centerline[Math.floor(corridor.centerline.length / 2)];
    const face = Object.values(document.mesh.faces).find(item => pointInPolygon(at, facePoints(document.mesh, item)));
    expect(face).toBeTruthy();
    if (!face) return;
    const before = face.properties.elevation;
    const edited = editFaceElevation(document, face.id, 30);
    expect(edited.mesh.faces[face.id].properties.elevation).toBe(before);
    const pad = edited.terrain?.features.find(
      feature => feature.kind === "platform" && feature.id === `pad:${face.id}`
    );
    expect(pad?.kind).toBe("platform");
    if (pad?.kind === "platform" && pad.summit.kind === "polygon")
      expect(pointInPolygon(at, pad.summit.points)).toBe(false);
  });

  it("repairs a rising bed and still accepts the corridor", () => {
    const document = createTerraceRiverStudy();
    const corridor = document.terrain?.features.find(feature => feature.kind === "riverCorridor");
    if (corridor?.kind !== "riverCorridor") return;
    corridor.bedMeters[corridor.bedMeters.length - 1] = corridor.bedMeters[0] + 4;
    repairRiverBeds(document);
    for (let index = 1; index < corridor.bedMeters.length; index++)
      expect(corridor.bedMeters[index]).toBeLessThanOrEqual(corridor.bedMeters[index - 1] + 1e-6);
    expect(validateTerrainLayer(document)).toEqual([]);
  });

  it("cuts a cell-plate wall back from a river polygon", () => {
    const wet: Point[] = [
      [8, -1],
      [12, -1],
      [12, 4],
      [8, 4]
    ];
    const pieces = clipEscarpmentTriangles(
      [
        [
          [0, 0],
          [10, 0],
          [10, 10]
        ]
      ],
      [wet]
    );
    expect(pieces.length).toBeGreaterThan(0);
    for (const piece of pieces) expect(pointInPolygon(polygonCentroid(piece), wet)).toBe(false);
  });

  it("turns a retaining step taller than 3 m into stairs", () => {
    const graded = gradeRoads(
      [
        {
          centerline: [
            [0, 0],
            [0, 40]
          ],
          widthMeters: 4,
          surface: "earth",
          gradeClass: "cart"
        }
      ],
      point => (point[1] < 20 ? 0 : 5),
      () => null,
      () => false,
      () => null,
      false,
      3
    );
    expect(graded.stairs.some(flight => Math.abs(flight.elevations[0] - flight.elevations.at(-1)!) > 3)).toBe(true);
  });

  it("leaves a document without a height field on cell elevations", () => {
    const document = createGridDocument({ size: "micro", grid: "hex", hexSizeMeters: 30, seed: "layers-cells" });
    const terrain = cityTerrain(document);
    expect(terrain.field).toBeUndefined();
    expect(terrain.waterAt).toBeUndefined();
    expect(createCliffFortressStudy().terrain?.features.some(feature => feature.kind === "platform")).toBe(true);
  });
});
