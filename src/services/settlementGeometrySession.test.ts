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
  it("retains indexes after metadata and unrelated-cell edits; rebuilds only the edited river source", () => {
    const world = fixture(),
      session = new SettlementGeometrySession();
    world.pack.rivers.push({ ...world.pack.rivers[0], i: 8 });
    session.prepare(world, "km");
    const first = session.source(7),
      second = session.source(8);
    Object.assign(world.pack.rivers[0], { name: "New name", parent: 8, basin: 8, type: "Creek" });
    world.pack.cells.p.push([99, 99]);
    session.prepare(world, "km");
    expect(session.riverIndexBuilds).toBe(1);
    expect(session.source(7)).toBe(first);
    world.pack.rivers[0].sourceWidth *= 2;
    session.prepare(world, "km");
    expect(session.riverIndexBuilds).toBe(2);
    expect(session.terrainBuilds).toBe(1);
    expect(session.source(7)).not.toBe(first);
    expect(session.source(8)).toBe(second);
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
  it("keeps the committed indexes, scale and sources when a rebuild is interrupted", () => {
    const world = fixture(),
      session = new SettlementGeometrySession();
    world.pack.rivers.push({ ...world.pack.rivers[0], i: 8 });
    session.prepare(world, "km");
    const source = session.source(7),
      otherSource = session.source(8);
    const bounds = { minX: 0, minY: 0, maxX: 9000, maxY: 9000 };
    const ring = session.terrain(world, bounds)[0].ring;
    world.pack.rivers[0].sourceWidth = 0.8;
    const steps = session.prepareSteps(world, "mi");
    expect(steps.next().done).toBe(false); // terrain
    expect(steps.next().done).toBe(false); // first river
    steps.return(undefined);
    expect(session.terrainBuilds).toBe(1);
    expect(session.riverIndexBuilds).toBe(1);
    expect(session.source(7)).toBe(source);
    expect(session.source(8)).toBe(otherSource);
    expect(session.terrain(world, bounds)[0].ring).toBe(ring);
    // This ring is first materialized after cancellation: it still uses km.
    expect(session.terrain(world, { minX: 50000, minY: 50000, maxX: 60000, maxY: 60000 })[0].ring[0]).toEqual([
      50000, 50000
    ]);
    session.prepare(world, "mi");
    expect(session.terrainBuilds).toBe(2);
    expect(session.riverIndexBuilds).toBe(2);
    expect(session.source(7)).not.toBe(source);
    expect(session.source(8)).not.toBe(otherSource);
  });
  it("invalidates the whole session on an identical pack replacement", () => {
    const world = fixture(),
      session = new SettlementGeometrySession();
    session.prepare(world, "km");
    const source = session.source(7);
    const bounds = { minX: 0, minY: 0, maxX: 9000, maxY: 9000 };
    const ring = session.terrain(world, bounds)[0].ring;
    world.pack = structuredClone(world.pack);
    session.prepare(world, "km");
    expect(session.terrainBuilds).toBe(2);
    expect(session.riverIndexBuilds).toBe(2);
    expect(session.source(7)).not.toBe(source);
    expect(session.terrain(world, bounds)[0].ring).not.toBe(ring);
    expect(session.terrain(world, bounds)[0].ring).toEqual(ring);
  });
  it("queries only intersecting cell polygons, including cells enclosing the query", () => {
    const world = fixture(),
      session = new SettlementGeometrySession();
    session.prepare(world, "km");
    expect(session.terrain(world, { minX: 1000, minY: 1000, maxX: 2000, maxY: 2000 }).map(t => t.id)).toEqual([0]);
    expect(session.terrain(world, { minX: 30000, minY: 30000, maxX: 40000, maxY: 40000 })).toEqual([]);
  });
});
