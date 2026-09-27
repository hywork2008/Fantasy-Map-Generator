import { describe, expect, it } from "vitest";
import {
  BRIDGE_BANK_SEAT,
  bridgeDecks,
  clipPolylineOutsideRivers,
  type RiverRibbon,
  roadRunsOutsideRivers
} from "./bridgeDeck";
import { nearestOnPolyline } from "./gen/geom";
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

describe("river crossing geometry regressions", () => {
  it("keeps the 171816 lower-gate road continuous on the same bank", () => {
    const ribbons: RiverRibbon[] = [
      {
        width: 11.121437726295115,
        points: [
          [23.276433130076338, 98.48596743988637],
          [61.6620597260741, 142.17709632007754],
          [96.50220800355746, 180.88901312429738],
          [128.90217456555786, 211.68776461897482]
        ]
      }
    ];
    const road: Point[] = [
      [139.43571902059745, 199.35368938167633],
      [61.6620597260741, 142.17709632007754],
      [56.98214805231527, 93.90972730800499]
    ];
    expect(clipPolylineOutsideRivers(road, ribbons)).toHaveLength(2);
    const runs = roadRunsOutsideRivers(road, ribbons, 3.5);
    expect(runs).toHaveLength(1);
    expect(runs[0][0]).toEqual(road[0]);
    expect(runs[0].at(-1)).toEqual(road.at(-1));
    expect(clipPolylineOutsideRivers(runs[0], ribbons)).toHaveLength(1);
    for (let i = 0; i + 1 < runs[0].length; i++) {
      for (let step = 0; step <= 20; step++) {
        const a = runs[0][i],
          b = runs[0][i + 1],
          t = step / 20;
        const point: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        expect(nearestOnPolyline(point, ribbons[0].points).dist).toBeGreaterThanOrEqual(ribbons[0].width / 2 - 1e-7);
      }
    }
  });

  it("leaves opposite-bank gaps for bridges", () => {
    expect(
      roadRunsOutsideRivers(
        [
          [-40, 0],
          [0, 0],
          [40, 0]
        ],
        RIVER,
        3.5
      )
    ).toHaveLength(2);
  });

  it("clips a crossing near a segment end even when its midpoint is dry", () => {
    const runs = clipPolylineOutsideRivers(
      [
        [-10, 0],
        [90, 0]
      ],
      RIVER
    );
    expect(runs).toHaveLength(2);
    expect(runs[0].at(-1)![0]).toBeCloseTo(-5);
    expect(runs[1][0][0]).toBeCloseTo(5);
  });

  it("clips both channels of a multiple crossing", () => {
    const ribbons = [
      ...RIVER,
      {
        points: [
          [30, -30],
          [30, 30]
        ] as Point[],
        width: 10
      }
    ];
    const runs = clipPolylineOutsideRivers(
      [
        [-20, 0],
        [70, 0]
      ],
      ribbons
    );
    expect(runs).toHaveLength(3);
    expect(runs[1]).toEqual([
      [5, 0],
      [25, 0]
    ]);
  });

  it("connects an edge crossing without a shared river vertex", () => {
    const doc = crossingDocument();
    doc.featureGroups = doc.featureGroups.filter(g => !g.id.startsWith("gc:bridge-"));
    const road = doc.featureGroups.find(g => g.kind === "road")!;
    if (road.kind !== "road") throw new Error("missing road");
    doc.mesh.edges.direct = { id: "direct", a: "a", b: "b", leftFace: null, rightFace: null, locked: false };
    road.segments = [{ edgeId: "direct", forward: true }];
    const decks = bridgeDecks(doc);
    expect(decks).toHaveLength(1);
    expect(decks[0].points).toEqual([
      [-5.7, 0],
      [5.7, 0]
    ]);
  });

  for (const [name, river, road] of [
    [
      "164151 road-1",
      [
        [192.60962897450122, 89.27722593078136],
        [157.6476628329347, 87.36990051896029],
        [113.89321714281203, 91.66080871713537]
      ],
      [
        [158.52685066878212, 128.01486827446945],
        [157.6476628329347, 87.36990051896029],
        [132.78098346440305, 84.16237448313031],
        [82.00678592042914, 68.74272347151158]
      ]
    ],
    [
      "164201 road-2",
      [
        [-81.25626800351912, 85.30881623142677],
        [-155.88421498331473, 76.08931250741512],
        [-195.1339991857751, 82.0713833559092]
      ],
      [
        [-154.99788277077613, 138.6580144799509],
        [-155.88421498331473, 76.08931250741512],
        [-142.0641106730596, 72.45018218905369],
        [-101.10025679025274, 55.600278033632065]
      ]
    ]
  ] as [string, Point[], Point[]][]) {
    it(`joins both banks in saved SVG ${name}`, () => {
      const doc = crossingDocument();
      doc.mesh.vertices = {};
      doc.mesh.edges = {};
      const ids = (prefix: string, points: Point[]) =>
        points.map((point, i) => {
          const id = `${prefix}${i}`;
          doc.mesh.vertices[id] = { id, point, locked: false };
          return id;
        });
      const riverIds = ids("r", river),
        roadIds = ids("p", road);
      const riverGroup = doc.featureGroups.find(g => g.kind === "river")!;
      if (riverGroup.kind !== "river") throw new Error("missing river");
      riverGroup.vertices = riverIds;
      riverGroup.style.widthMeters = name.startsWith("164151") ? 11.338355544971593 : 10.712130537082118;
      const roadGroup = doc.featureGroups.find(g => g.kind === "road")!;
      if (roadGroup.kind !== "road") throw new Error("missing road");
      roadGroup.segments = roadIds.slice(1).map((b, i) => {
        const id = `e${i}`;
        doc.mesh.edges[id] = { id, a: roadIds[i], b, leftFace: null, rightFace: null, locked: false };
        return { edgeId: id, forward: true };
      });
      doc.featureGroups = [riverGroup, roadGroup];
      const runs = clipPolylineOutsideRivers(road, [{ points: river, width: riverGroup.style.widthMeters }]);
      expect(runs).toHaveLength(2);
      const decks = bridgeDecks(doc);
      expect(decks).toHaveLength(1);
      // The bridge seats extend beyond both clipped bank endpoints.
      const bank = runs[0].at(-1)!;
      expect(Math.hypot(decks[0].points[0][0] - bank[0], decks[0].points[0][1] - bank[1])).toBeCloseTo(
        BRIDGE_BANK_SEAT / 2
      );
    });
  }
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
