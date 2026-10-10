import { describe, expect, it } from "vitest";
import type { WorldContext } from "../context/worldContext";
import { MIN_NAVIGABLE_FLUX } from "../generators/river-generator";
import type { FractalizedShape } from "../renderers/coastline-fractal";
import type { Burg } from "../types/models";
import { dualPortHaven, dualPortShore } from "./dualPortShore";

function fixture() {
  const burg = { i: 1, cell: 1, x: 500, y: 500, port: 2 } as Burg;
  const world = {
    pack: {
      cells: {
        r: [0, 7, 0],
        fl: [0, MIN_NAVIGABLE_FLUX, 0],
        haven: [0, 2, 0],
        f: [0, 1, 2],
        p: [
          [0, 0],
          [500, 500],
          [500, -500]
        ]
      },
      features: [null, { i: 1, type: "island", vertices: [0, 1, 2, 3] }, { i: 2, type: "ocean" }]
    }
  } as unknown as WorldContext;
  const shape: FractalizedShape = {
    points: [
      [0, 0],
      [1000, 0],
      [1000, 1000],
      [0, 1000]
    ],
    origIndices: []
  };
  const shapes = new Map([[1, shape]]);
  return { world, burg, shape, shapes };
}

describe("dual-port coast survey", () => {
  it("targets an adjacent ocean and a navigable river, rather than a lake's downstream ocean", () => {
    const { world, burg } = fixture();
    expect(dualPortHaven(world, burg)).toBe(2);
    world.pack.features[2].type = "lake";
    expect(dualPortHaven(world, burg)).toBeNull();
    world.pack.features[2].type = "ocean";
    world.pack.cells.fl[1] = MIN_NAVIGABLE_FLUX - 1;
    expect(dualPortHaven(world, burg)).toBeNull();
    expect(dualPortHaven(world, { ...burg, port: 0 })).toBeNull();
  });

  it("keeps the river reservation near the coast without admitting a footprint across the sea", () => {
    const { world, burg, shapes } = fixture();
    const shore = dualPortShore(world, burg, 1, 100, 1000, shapes)!;
    expect(shore.accepts([500, 200])).toBe(true);
    expect(shore.accepts([500, 500])).toBe(false);
    expect(
      shore.supports([
        [400, 100],
        [600, 100],
        [600, 300],
        [400, 300]
      ])
    ).toBe(true);
    expect(
      shore.supports([
        [400, -100],
        [600, -100],
        [600, 100],
        [400, 100]
      ])
    ).toBe(false);
  });

  it("rejects a footprint whose edges cross a bay even when every corner is on land", () => {
    const { world, burg, shapes, shape } = fixture();
    shape.points = [
      [0, 0],
      [1000, 0],
      [1000, 1000],
      [600, 1000],
      [600, 200],
      [400, 200],
      [400, 1000],
      [0, 1000]
    ];
    const shore = dualPortShore(world, burg, 1, 100, 1000, shapes)!;
    expect(
      shore.supports([
        [300, 300],
        [700, 300],
        [700, 700],
        [300, 700]
      ])
    ).toBe(false);
  });

  it("leaves ordinary river towns out of coast surveying", () => {
    const { world, burg, shapes } = fixture();
    expect(dualPortShore(world, { ...burg, port: 0 }, 1, 100, 1000, shapes)).toBeNull();
  });
});
