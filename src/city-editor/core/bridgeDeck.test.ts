import { describe, expect, it } from "vitest";
import { BRIDGE_BANK_SEAT, bridgeDecks, clipPolylineOutsideRivers, type RiverRibbon } from "./bridgeDeck";
import type { CityDocument, Point } from "./types";

const RIVER: RiverRibbon[] = [
  {
    points: [
      [0, -30],
      [0, 30]
    ],
    width: 10
  }
];

describe("clipPolylineOutsideRivers", () => {
  it("cuts a road at the river bank instead of carrying it across the channel", () => {
    const line: Point[] = [
      [-40, 0],
      [0, 0],
      [40, 0]
    ];
    const runs = clipPolylineOutsideRivers(line, RIVER);
    expect(runs).toHaveLength(2);
    expect(runs[0][0][0]).toBeCloseTo(-40);
    expect(runs[0].at(-1)![0]).toBeCloseTo(-5, 0);
    expect(runs[1][0][0]).toBeCloseTo(5, 0);
    expect(runs[1].at(-1)![0]).toBeCloseTo(40);
  });
});

describe("bridgeDecks", () => {
  it("spans the river width through the crossing and ignores the neighbouring street vertices", () => {
    const decks = bridgeDecks(crossingDocument());
    expect(decks).toHaveLength(1);
    expect(decks[0].groupId).toBe("gc:bridge-1");
    const [left, right] = decks[0].points;
    const length = Math.hypot(right[0] - left[0], right[1] - left[1]);
    expect(length).toBeCloseTo(10 + BRIDGE_BANK_SEAT);
    expect(Math.abs(left[1])).toBeLessThan(0.05);
    expect(Math.abs(right[1])).toBeLessThan(0.05);
    const span = (10 + BRIDGE_BANK_SEAT) / 2;
    expect(Math.min(left[0], right[0])).toBeCloseTo(-span);
    expect(Math.max(left[0], right[0])).toBeCloseTo(span);
  });
});

function crossingDocument(): CityDocument {
  return {
    format: "fmg-city-editor",
    version: 1,
    frame: { extentMeters: 200, cityRadiusMeters: 80, blockSizeMeters: 20 },
    mesh: {
      vertices: {
        s: { id: "s", point: [0, -30], locked: false },
        m: { id: "m", point: [0, 0], locked: false },
        n: { id: "n", point: [0, 30], locked: false },
        a: { id: "a", point: [-40, 0], locked: false },
        b: { id: "b", point: [40, 0], locked: false }
      },
      edges: {
        r1: { id: "r1", a: "s", b: "m", leftFace: null, rightFace: null, locked: false },
        r2: { id: "r2", a: "m", b: "n", leftFace: null, rightFace: null, locked: false },
        e1: { id: "e1", a: "a", b: "m", leftFace: null, rightFace: null, locked: false },
        e2: { id: "e2", a: "m", b: "b", leftFace: null, rightFace: null, locked: false }
      },
      faces: {}
    },
    featureGroups: [
      {
        id: "gc:river-1",
        kind: "river",
        name: "River",
        locked: false,
        style: { widthMeters: 10, color: "#85857d" },
        vertices: ["s", "m", "n"],
        source: null,
        mouth: null
      },
      {
        id: "gc:road-1",
        kind: "road",
        name: "Road",
        locked: false,
        style: { widthMeters: 6, color: "#735238" },
        segments: [
          { edgeId: "e1", forward: true },
          { edgeId: "e2", forward: true }
        ]
      },
      {
        id: "gc:bridge-1",
        kind: "road",
        name: "Bridge",
        locked: false,
        style: { widthMeters: 6, color: "#735238" },
        segments: [
          { edgeId: "e1", forward: true },
          { edgeId: "e2", forward: true }
        ]
      }
    ],
    gates: [],
    elements: []
  };
}
