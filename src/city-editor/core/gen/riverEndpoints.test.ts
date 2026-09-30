import { describe, expect, it } from "vitest";
import { createGridDocument } from "../document";
import { defaultGenerationSettings, generateCityOnDocument, generateStageOnDocument } from "../generate";
import { edgeBetween, validate } from "../mesh";
import type { EdgeGraph } from "./edgeGraph";
import { pointInPolygon } from "./geom";
import { makeRng } from "./prng";
import { walkRiver } from "./riverPath";
import type { Point } from "./types";

describe("generated river endpoints", () => {
  it("keeps every emitted coastal river connected to the map edge or sea in stage ②", () => {
    const input = createGridDocument({ size: "tiny", grid: "evolution", seed: "coastal-river-grid" });
    const settings = defaultGenerationSettings();
    settings.config = { ...settings.config, coast: "bay", rivers: ["toCoast", "meander"] };
    let checked = 0;
    for (const seed of ["coastal-a", "coastal-b", "coastal-c"]) {
      const city = generateStageOnDocument(input, settings, seed, 2)!;
      for (const river of city.featureGroups.filter(group => group.kind === "river")) {
        checked++;
        for (const id of [river.vertices[0], river.vertices.at(-1)!]) {
          const point = city.mesh.vertices[id].point;
          const atEdge = Math.max(Math.abs(point[0]), Math.abs(point[1])) >= city.frame.extentMeters / 2 - 0.001;
          const atSea = Object.values(city.mesh.edges).some(
            edge =>
              (edge.a === id || edge.b === id) &&
              [edge.leftFace, edge.rightFace].some(
                faceId => faceId && city.mesh.faces[faceId]?.properties.water === "sea"
              )
          );
          expect(atEdge || atSea, `${seed}: river ends inland at ${point}`).toBe(true);
        }
        for (let i = 1; i < river.vertices.length; i++)
          expect(edgeBetween(city.mesh, river.vertices[i - 1], river.vertices[i])).toBeTruthy();
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it.each([false, true])("resolves the mesh path when the walk arrives short of its goal (sea=%s)", sea => {
    const points: Point[] = [-300, -250, -100, 0, 100, 250, 300].map(x => [x, 0]);
    const graph: EdgeGraph = {
      points,
      adjacency: points.map((p, i) =>
        [i - 1, i + 1]
          .filter(to => to >= 0 && to < points.length)
          .map(to => ({ to, w: Math.abs(points[to][0] - p[0]) }))
      )
    };
    const water: Point[] | null = sea
      ? [
          [200, -300],
          [300, -300],
          [300, 300],
          [200, 300]
        ]
      : null;
    const shoreline: Point[] | null = sea
      ? [
          [200, -300],
          [200, 300]
        ]
      : null;
    const river = walkRiver(
      graph,
      [
        [-250, 0],
        [300, 0]
      ],
      [12, 12],
      water,
      shoreline,
      100,
      300,
      makeRng("ends")
    );
    expect(river.fallback).toBe(false);
    expect(river.resolvedEdgePoints[0]).toEqual([-300, 0]);
    if (water) expect(pointInPolygon(river.resolvedEdgePoints.at(-1)!, water)).toBe(true);
    else expect(river.resolvedEdgePoints.at(-1)).toEqual([300, 0]);
    for (let i = 1; i < river.resolvedEdgePoints.length; i++) {
      const a = points.findIndex(p => p[0] === river.resolvedEdgePoints[i - 1][0]);
      const b = points.findIndex(p => p[0] === river.resolvedEdgePoints[i][0]);
      expect(graph.adjacency[a].some(edge => edge.to === b)).toBe(true);
    }
  });

  it("reaches both map edges for the shared 1ysj3rr city", () => {
    const input = createGridDocument({
      size: "tiny",
      grid: "evolution",
      seed: "8avd3v",
      patchParams: { nPatches: 15, relaxCount: 4, relaxPasses: 3 }
    });
    const settings = defaultGenerationSettings();
    settings.config = {
      ...settings.config,
      coast: "none",
      rivers: ["through"],
      relief: false,
      features: { walls: true, plaza: true, temple: true, citadel: false, port: false, shanty: true },
      wall: { envelope: "auto", coast: "auto", line: "auto" },
      layout: "organic"
    };
    settings.layout = "organic";
    settings.walledAreaShare = 1;
    settings.streets = { farNode: "descriptorEnd", avoidSea: true, foldSmoothing: true };
    const city = generateCityOnDocument(input, settings, "1ysj3rr")!;
    expect(city).not.toBeNull();
    expect(city.generationSeed).toBe("1ysj3rr");
    const river = city.featureGroups.find(group => group.id === "gc:river-0");
    expect(river?.kind).toBe("river");
    if (river?.kind !== "river") return;
    expect(river.vertices).toContain("v156");
    for (const id of [river.vertices[0], river.vertices.at(-1)!]) {
      const point = city.mesh.vertices[id].point;
      expect(Math.max(Math.abs(point[0]), Math.abs(point[1])), `${id}: ${point}`).toBeCloseTo(
        city.frame.extentMeters / 2,
        5
      );
    }
    for (let i = 1; i < river.vertices.length; i++)
      expect(edgeBetween(city.mesh, river.vertices[i - 1], river.vertices[i])).toBeTruthy();
    expect(new Set(river.vertices).size).toBe(river.vertices.length);
    expect(validate(city)).toEqual([]);
  });
});
