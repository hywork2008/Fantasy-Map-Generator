import { describe, expect, it } from "vitest";
import type { WorldContext } from "../context/worldContext";
import { SettlementGeometrySession } from "./settlementGeometrySession";

function fixture() {
  return {
    distanceScale: 1,
    graphWidth: 100,
    graphHeight: 100,
    pack: {
      cells: {
        p: [
          [20, 20],
          [20, 24],
          [20, 28]
        ],
        v: [
          [0, 1, 2, 3],
          [4, 5, 6, 7]
        ],
        h: [25, 25, 25],
        fl: [20, 20, 20],
        state: [1, 1]
      },
      vertices: {
        p: [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [50, 50],
          [60, 50],
          [60, 60],
          [50, 60]
        ]
      },
      rivers: [{ i: 7, cells: [0, 1, 2], widthFactor: 0, sourceWidth: 0.4 }]
    }
  } as unknown as WorldContext;
}
describe("generation geometry sessions", () => {
  it("reuses geometry after policy changes and invalidates only edited source geometry", () => {
    const world = fixture(),
      session = new SettlementGeometrySession();
    session.prepare(world, "km");
    const source = session.source(7);
    const ring = session.terrain(world, { minX: 0, minY: 0, maxX: 9000, maxY: 9000 })[0].ring;
    world.pack.cells.state[0] = 2;
    session.prepare(world, "km");
    expect(session.terrainBuilds).toBe(1);
    expect(session.riverIndexBuilds).toBe(1);
    expect(session.source(7)).toBe(source);
    expect(session.terrain(world, { minX: 0, minY: 0, maxX: 9000, maxY: 9000 })[0].ring).toBe(ring);
    world.pack.rivers[0].sourceWidth = 0.8;
    session.prepare(world, "km");
    expect(session.source(7)).not.toBe(source);
    expect(session.terrainBuilds).toBe(1);
    world.pack.vertices.p[0][0] = 1;
    session.prepare(world, "km");
    expect(session.terrainBuilds).toBe(2);
    session.prepare(world, "mi");
    expect(session.terrainBuilds).toBe(3);
  });
  it("can restart an interrupted preparation without publishing a partial cache", () => {
    const world = fixture(),
      session = new SettlementGeometrySession();
    const steps = session.prepareSteps(world, "km");
    expect(steps.next().done).toBe(false);
    steps.return(undefined);
    session.prepare(world, "km");
    expect(session.terrain(world, { minX: 0, minY: 0, maxX: 9000, maxY: 9000 })).toHaveLength(1);
    expect(session.source(7)).toBeDefined();
  });
  it("queries only intersecting cell polygons, including cells enclosing the query", () => {
    const world = fixture(),
      session = new SettlementGeometrySession();
    session.prepare(world, "km");
    expect(session.terrain(world, { minX: 1000, minY: 1000, maxX: 2000, maxY: 2000 }).map(t => t.id)).toEqual([0]);
    expect(session.terrain(world, { minX: 30000, minY: 30000, maxX: 40000, maxY: 40000 })).toEqual([]);
  });
});
