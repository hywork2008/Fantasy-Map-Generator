import { describe, expect, it } from "vitest";
import type { ApproachProfile } from "../../services/approachProfile";
import type { BurgSiteEconomy, GuildDomain, SiteGuild } from "../types/contracts/burgSiteEconomy";
import type { Cell, Point } from "../types/geometry";
import {
  type ApproachCommerceRoad,
  gateWardQuota,
  generationDescriptor,
  mainCommerceRoadIndex,
  marketFunnelDisks,
  marketStreetScore,
  marketStreetWidthMeters,
  merchantStreetScore,
  resolveApproachCommerce
} from "./approachCommerce";
import { nearestOnPolyline } from "./geom";
import { COBBLE_WIDTH_SCALE } from "./roadTraffic";
import { assignWards, type WardInputs } from "./wards";

function profile(partial: Partial<ApproachProfile> = {}): ApproachProfile {
  return {
    share: 0.2,
    throughShare: 0,
    inboundShare: 0.5,
    cargo: {},
    cargoValue: {},
    wagonsPerYear: 12,
    source: "ledger",
    ...partial
  };
}

function road(approachId: string, group: string, approachProfile?: ApproachProfile): ApproachCommerceRoad {
  return { approachId, group, ...(approachProfile ? { approachProfile } : {}) };
}

describe("approach commerce plan", () => {
  it("keeps a through-axis as the market street and ignores a busier dead-end gate", () => {
    const plan = resolveApproachCommerce({
      roads: [
        road("west", "roads", profile({ share: 0.3, throughShare: 0.8, axisPartner: "east", cargo: { grain: 0.1 } })),
        road(
          "east",
          "roads",
          profile({
            share: 0.34,
            throughShare: 0.75,
            axisPartner: "west",
            cargo: { grain: 0.55 },
            cargoValue: { luxury: 0.1 }
          })
        ),
        road("north", "roads", profile({ share: 0.36, throughShare: 0, cargo: { grain: 0.9 } }))
      ],
      importedRoads: [{ sourceIndex: 0 }, { sourceIndex: 1 }, { sourceIndex: 2 }],
      gates: [
        { point: [-80, 0], roadIndex: 0, water: false },
        { point: [90, 0], roadIndex: 1, water: false },
        { point: [0, 120], roadIndex: 2, water: false }
      ],
      plaza: [0, 0],
      port: false,
      extentMeters: 600
    });
    // East end-flow 0.34 * 0.25 beats west 0.3 * 0.2, so the axis is walked from the east gate.
    expect(plan?.gateIndexes).toEqual([1, 0]);
    expect(plan?.marketStreet).toEqual([
      [90, 0],
      [0, 0],
      [-80, 0]
    ]);
    expect(plan?.marketEnd).toBe("gate");
    expect(plan?.shares.find(share => share.gateIndex === 2)?.main).toBe(false);
  });

  it("returns the land main-gate road and skips a sea main gate", () => {
    const axis = [
      road("west", "roads", profile({ share: 0.3, throughShare: 0.8, axisPartner: "east" })),
      road("east", "roads", profile({ share: 0.34, throughShare: 0.75, axisPartner: "west" })),
      road("north", "roads", profile({ share: 0.36, throughShare: 0 }))
    ];
    // East is the busier end of the axis, so the quieter dead-end is not the inn's road.
    expect(mainCommerceRoadIndex(axis, false)).toBe(1);
    const gapped = [
      road("bare", "roads"),
      road("sea", "searoutes", profile({ share: 0.1 })),
      road("land", "roads", profile({ share: 0.4 }))
    ];
    expect(mainCommerceRoadIndex(gapped, false)).toBe(2);
    const sea = [road("inland", "roads", profile({ share: 0.2 })), road("sea", "searoutes", profile({ share: 0.55 }))];
    expect(mainCommerceRoadIndex(sea, true)).toBeNull();
    expect(mainCommerceRoadIndex(sea, false)).toBe(0);
    expect(mainCommerceRoadIndex([], false)).toBeNull();
  });

  it("treats the landing as the main gate when the sea share beats every land gate", () => {
    const landing: Point = [0, -40];
    const won = resolveApproachCommerce({
      roads: [
        road("inland", "roads", profile({ share: 0.2 })),
        road("sea", "searoutes", profile({ share: 0.55, cargoValue: { luxury: 0.4 }, cargo: { manufactured: 0.05 } }))
      ],
      importedRoads: [{ sourceIndex: 0 }],
      gates: [{ point: [70, 0], roadIndex: 0, water: false }],
      plaza: [0, 0],
      landing,
      port: true,
      extentMeters: 600
    });
    expect(won?.mainPoint).toEqual(landing);
    expect(won?.gateIndexes).toEqual([]);
    expect(won?.shares.find(share => share.main)?.gateIndex).toBe(-1);
    expect(won?.marketEnd).toBe("center");

    const lost = resolveApproachCommerce({
      roads: [road("inland", "roads", profile({ share: 0.4 })), road("sea", "searoutes", profile({ share: 0.25 }))],
      importedRoads: [{ sourceIndex: 0 }],
      gates: [{ point: [70, 0], roadIndex: 0, water: false }],
      plaza: [0, 0],
      landing,
      port: true,
      extentMeters: 600
    });
    expect(lost?.mainPoint).toEqual([70, 0]);
    expect(lost?.gateIndexes).toEqual([0]);
  });

  it("returns null without profiles, and when the only gate sits on the plaza", () => {
    expect(
      resolveApproachCommerce({
        roads: [road("west", "roads")],
        importedRoads: [{ sourceIndex: 0 }],
        gates: [{ point: [40, 0], roadIndex: 0, water: false }],
        plaza: [0, 0],
        port: false,
        extentMeters: 600
      })
    ).toBeNull();
    expect(
      resolveApproachCommerce({
        roads: [road("west", "roads", profile({ share: 0.5 }))],
        importedRoads: [{ sourceIndex: 0 }],
        gates: [{ point: [0, 0], roadIndex: 0, water: false }],
        plaza: [0, 0],
        port: false,
        extentMeters: 600
      })
    ).toBeNull();
  });

  it("uses cargo value for luxury and keeps a quiet gate out of the quota", () => {
    const slotsOnly = resolveApproachCommerce({
      roads: [road("west", "roads", profile({ share: 0.4, cargo: { luxury: 0.9 } }))],
      importedRoads: [{ sourceIndex: 0 }],
      gates: [{ point: [40, 0], roadIndex: 0, water: false }],
      plaza: [0, 0],
      port: false,
      extentMeters: 600
    });
    expect(slotsOnly?.marketEnd).toBe("street");
    expect(gateWardQuota(4, 0.04, false, 0.6)).toBe(0);
    expect(gateWardQuota(4, 0.05, false, 0.5)).toBe(1);
    expect(gateWardQuota(4, 0.01, true, 0.6)).toBe(1);
    expect(gateWardQuota(4, 0.3, false, 0.6)).toBe(2);
    expect(gateWardQuota(1, 0.2, false, 0.6)).toBe(1);
    expect(gateWardQuota(0, 0.9, true, 0.9)).toBe(0);
  });

  it("scores merchants by the street and pulls extra market cells toward the requested end", () => {
    const street: Point[] = [
      [0, 0],
      [100, 0]
    ];
    const onStreet = merchantStreetScore([40, 0], [0, 0], street);
    const nearCenter = merchantStreetScore([0, 30], [0, 0], street);
    expect(onStreet).toBeLessThan(nearCenter);
    expect(marketStreetScore([8, 2], street, "gate", [0, 0], [100, 0])).toBeLessThan(
      marketStreetScore([92, 2], street, "gate", [0, 0], [100, 0])
    );
    expect(marketStreetScore([92, 2], street, "center", [0, 0], [100, 0])).toBeLessThan(
      marketStreetScore([8, 2], street, "center", [0, 0], [100, 0])
    );
  });

  it("widens the market street one cobble step and opens a funnel inside the gate", () => {
    expect(marketStreetWidthMeters(4.5)).toBeCloseTo(4.5 * COBBLE_WIDTH_SCALE);
    const disks = marketFunnelDisks([0, 0], [200, 0], 600);
    expect(disks).toHaveLength(3);
    expect(disks[0].radius).toBeGreaterThan(disks[2].radius);
    for (const disk of disks) {
      expect(disk.center[0]).toBeGreaterThan(0);
      expect(disk.center[0]).toBeLessThan(200);
      expect(disk.center[1]).toBeCloseTo(0);
    }
    expect(marketFunnelDisks([0, 0], [5, 0], 600)).toEqual([]);
  });

  it("drops gate profiles unless commerce is on, and leaves approach traffic on its own switch", () => {
    const descriptor = {
      roads: [{ approachProfile: profile(), approachTraffic: { share: 0.4 } }, { approachId: "quiet" }]
    };
    expect(generationDescriptor({ descriptor, approachCommerce: "off" })).not.toBe(descriptor);
    const off = generationDescriptor({ descriptor, approachCommerce: "off" })!;
    expect(off.roads[0].approachProfile).toBeUndefined();
    expect(off.roads[0].approachTraffic).toBeUndefined();
    expect(descriptor.roads[0].approachProfile).toBeDefined();

    const on = generationDescriptor({ descriptor, approachCommerce: "on" })!;
    expect(on.roads[0].approachProfile).toBeDefined();
    expect(on.roads[0].approachTraffic).toBeUndefined();

    const traffic = generationDescriptor({ descriptor, approachCommerce: "off", approachGrowthSource: "traffic" })!;
    expect(traffic.roads[0].approachProfile).toBeUndefined();
    expect(traffic.roads[0].approachTraffic).toEqual({ share: 0.4 });

    const bare = { roads: [{ approachId: "west" }] };
    expect(generationDescriptor({ descriptor: bare })).toBe(bare);
  });
});

function square(id: number, centroid: Point): Cell {
  const [cx, cy] = centroid;
  const s = 10;
  return {
    id,
    site: centroid,
    centroid,
    polygon: [
      [cx - s, cy - s],
      [cx + s, cy - s],
      [cx + s, cy + s],
      [cx - s, cy + s]
    ],
    neighbors: [],
    onBorder: false
  };
}

/** A cell with one corner on `gate`, so the gate-touch test (vertices, not the centroid) hits. */
function cornerCell(id: number, gate: Point, width: number, height: number): Cell {
  const [gx, gy] = gate;
  const polygon: Point[] = [
    [gx, gy],
    [gx + width, gy],
    [gx + width, gy + height],
    [gx, gy + height]
  ];
  const centroid: Point = [gx + width / 2, gy + height / 2];
  return { id, site: centroid, centroid, polygon, neighbors: [], onBorder: false };
}

function wardInput(seed: string, cells: Cell[], extra: Partial<WardInputs> = {}): WardInputs {
  return {
    cells,
    urban: new Set(cells.map(cell => cell.id)),
    outskirts: new Set(),
    sea: new Set(),
    borders: [],
    gates: [],
    precincts: [{ kind: "plaza", cellIds: [0], anchor: [0, 0] }],
    geo: { bounds: [-1000, -1000, 1000, 1000], riverCentres: [], roadPaths: [] },
    params: { seed, cityRadiusMeters: 80, cellSizeMeters: 20, extentMeters: 600, nPatches: 1 },
    program: {
      walls: true,
      citadel: false,
      plaza: true,
      temple: false,
      port: false,
      shanty: false,
      capital: false
    },
    shoreline: null,
    waterPolygon: null,
    ...extra
  };
}

describe("assignWards approach commerce", () => {
  it("puts merchant wards closer to the market street than the center-only score", () => {
    const gap = merchantStreetGap("c1-street-0");
    expect(gap.on).toBe(0);
    expect(gap.on).toBeLessThan(gap.off);
  });

  it("gives gate wards by share, including the main gate and never a quiet gate", () => {
    const main = cornerCell(1, [500, 500], 20, 20);
    const busy = [20, 40, 60, 80].map((width, index) => cornerCell(2 + index, [0, 0], width, 20));
    const quiet = cornerCell(6, [-500, 500], 20, 20);
    const cells = [square(0, [250, 0]), main, ...busy, quiet, square(7, [250, 900])];
    const result = assignWards(
      wardInput("gate-share", cells, {
        gates: [
          { point: [500, 500], borderIndex: 0, water: false, roadIndex: 0 },
          { point: [0, 0], borderIndex: 1, water: false, roadIndex: 1 },
          { point: [-500, 500], borderIndex: 2, water: false, roadIndex: 2 }
        ],
        commerce: {
          roads: [
            road("main", "roads", profile({ share: 0.7, cargo: { grain: 0.4 } })),
            road("side", "roads", profile({ share: 0.3 })),
            road("lane", "roads", profile({ share: 0.02 }))
          ],
          importedRoads: [{ sourceIndex: 0 }, { sourceIndex: 1 }, { sourceIndex: 2 }],
          port: false,
          extentMeters: 600
        }
      })
    );
    const kind = new Map(result.wards.map(ward => [ward.cellId, ward.kind]));
    expect(kind.get(1)).toBe("gate");
    expect(kind.get(2)).toBe("gate");
    expect(kind.get(3)).toBe("gate");
    expect(kind.get(4)).not.toBe("gate");
    expect(kind.get(5)).not.toBe("gate");
    expect(kind.get(6)).not.toBe("gate");
    expect(result.approachCommerce?.gateIndexes).toEqual([0]);
  });

  it("keeps the previous wards when commerce is on but no gate has a profile", () => {
    const cells = [square(0, [0, 0]), square(1, [30, 0]), square(2, [0, 30]), square(3, [0, 200])];
    const base = wardInput("no-profile", cells, {
      gates: [{ point: [400, 0], borderIndex: 0, water: false, roadIndex: 0 }]
    });
    const withEmpty = assignWards({
      ...base,
      commerce: {
        roads: [road("west", "roads")],
        importedRoads: [{ sourceIndex: 0 }],
        port: false,
        extentMeters: 600
      }
    });
    expect(assignWards(base).wards).toEqual(withEmpty.wards);
    expect(withEmpty.approachCommerce).toBeUndefined();
  });
});

/** Mean distance from merchant cells to the market street. */
function merchantStreetGap(seed: string): { on: number; off: number } {
  const plaza = square(0, [0, 0]);
  const cemetery = square(1, [0, 900]);
  const fillers = Array.from({ length: 19 }, (_, index) => square(2 + index, [0, 200 + index * 20]));
  const near = [
    [0, 24],
    [0, -26],
    [-22, 10],
    [18, 22],
    [-18, -22],
    [16, -24],
    [-12, 28],
    [10, 32]
  ].map((point, index) => square(21 + index, point as Point));
  const streetCells = [55, 70, 85, 100, 115, 130, 145, 160].map((x, index) => square(29 + index, [x, 0]));
  const cells = [plaza, cemetery, ...fillers, ...near, ...streetCells];
  const gates = [{ point: [400, 0] as Point, borderIndex: 0, water: false, roadIndex: 0 }];
  const street: Point[] = [
    [400, 0],
    [0, 0]
  ];
  const mean = (kinds: Map<number, string>): number => {
    const merchants = cells.filter(cell => kinds.get(cell.id) === "merchant");
    return merchants.reduce((sum, cell) => sum + nearestOnPolyline(cell.centroid, street).dist, 0) / merchants.length;
  };
  const off = assignWards(wardInput(seed, cells, { gates }));
  const on = assignWards(
    wardInput(seed, cells, {
      gates,
      commerce: {
        roads: [road("east", "roads", profile({ share: 0.5, cargo: { grain: 0.1 } }))],
        importedRoads: [{ sourceIndex: 0 }],
        port: false,
        extentMeters: 600
      }
    })
  );
  return {
    off: mean(new Map(off.wards.map(ward => [ward.cellId, ward.kind]))),
    on: mean(new Map(on.wards.map(ward => [ward.cellId, ward.kind])))
  };
}

function guild(domain: GuildDomain, practitioners: number): SiteGuild {
  return { domain, status: "chapter", practitioners, prestige: 0.2, foundedYear: 1200 };
}

function craftEconomy(guilds: SiteGuild[]): BurgSiteEconomy {
  return {
    version: 1,
    year: 1300,
    commerce: { rank: 0, marketCenter: false, merchantHouse: null, mint: false, caravanArrivalRank: 0 },
    guilds,
    storage: [],
    facilities: [],
    tradePartners: []
  };
}

/** Absorbers for merchant, market, slum, patriciate, and administration, plus one far cemetery cell. */
function craftGrid(special: Cell[]): Cell[] {
  const plaza = square(0, [0, 0]);
  const near = [
    [18, 0],
    [0, 18],
    [-18, 0],
    [0, -18],
    [36, 16],
    [-16, 28]
  ].map((point, index) => square(1 + index, point as Point));
  const street = [50, 90, 130, 170, 210, 250].map((x, index) => square(10 + index, [x, 0]));
  const far = [800, 1000, 1200, 1400, 1600].map((y, index) => square(50 + index, [0, y]));
  const cemetery = square(90, [0, 4000]);
  return [plaza, ...near, ...street, ...far, cemetery, ...special];
}

function touch(a: Cell, b: Cell): void {
  a.neighbors.push(b.id);
  b.neighbors.push(a.id);
}

describe("assignWards craftsman cargo", () => {
  const east = { point: [400, 0] as Point, borderIndex: 0, water: false, roadIndex: 0 };
  const west = { point: [-400, 0] as Point, borderIndex: 1, water: false, roadIndex: 1 };
  const commerce = {
    roads: [
      road("east", "roads", profile({ share: 0.6, inboundShare: 0.8, cargo: { bulk: 0.5 } })),
      road("west", "roads", profile({ share: 0.3, inboundShare: 0.1, cargo: { bulk: 0.05, manufactured: 0.2 } }))
    ],
    importedRoads: [{ sourceIndex: 0 }, { sourceIndex: 1 }],
    port: false,
    extentMeters: 600
  };

  it("puts smiths by the bulk gate, cloth by the export gate, and clusters the same craft", () => {
    const smith = square(40, [340, 70]);
    const next = square(41, [340, 90]);
    const other = square(42, [300, 70]);
    const cloth = square(43, [-340, 40]);
    touch(smith, next);
    const cells = craftGrid([smith, next, other, cloth]);
    const result = assignWards(
      wardInput("c3-craft-0", cells, {
        gates: [east, west],
        economy: craftEconomy([guild("metallurgy", 10), guild("textiles", 10)]),
        commerce
      })
    );
    const order = result.assignmentOrder;
    const row = (id: number) => order.find(item => item.cellId === id);
    expect(row(smith.id)?.craftDomain).toBe("metallurgy");
    expect(row(next.id)?.craftDomain).toBe("metallurgy");
    expect(row(cloth.id)?.craftDomain).toBe("textiles");
    expect(order.find(item => item.craftDomain === "metallurgy")?.cellId).toBe(smith.id);
    expect(order.find(item => item.craftDomain === "textiles")?.cellId).toBe(cloth.id);
    expect(order.findIndex(item => item.cellId === next.id)).toBeLessThan(
      order.findIndex(item => item.cellId === other.id)
    );
  });

  it("keeps the previous wards when commerce is on but the craft gates have no profile", () => {
    const cells = craftGrid([square(40, [340, 70]), square(41, [300, 70])]);
    const economy = craftEconomy([guild("metallurgy", 10)]);
    const gates = [east];
    const base = wardInput("c3-craft-off", cells, { gates, economy });
    const on = assignWards({
      ...base,
      commerce: {
        roads: [road("east", "roads")],
        importedRoads: [{ sourceIndex: 0 }],
        port: false,
        extentMeters: 600
      }
    });
    expect(assignWards(base).wards).toEqual(on.wards);
    expect(on.approachCommerce).toBeUndefined();
  });

  it("seats tanners downstream, and leaves them random when the town has no river", () => {
    const downClose = square(30, [350, 10]);
    const upClose = square(31, [-180, 10]);
    const downFar = square(32, [350, 80]);
    const cells = craftGrid([downClose, upClose, downFar]);
    const gates = [{ point: [0, 500] as Point, borderIndex: 0, water: false, roadIndex: 0 }];
    const economy = craftEconomy([guild("leather", 12)]);
    const commerce = {
      roads: [road("north", "roads", profile({ share: 0.5, inboundShare: 0.5, cargo: { provisions: 0.4 } }))],
      importedRoads: [{ sourceIndex: 0 }],
      port: false,
      extentMeters: 600
    };
    const withRiver = assignWards(
      wardInput("c3-leather", cells, {
        gates,
        economy,
        commerce,
        rivers: [
          [
            [-200, 0],
            [400, 0]
          ]
        ]
      })
    );
    expect(withRiver.assignmentOrder.find(item => item.craftDomain === "leather")?.cellId).toBe(downClose.id);
    const dry = assignWards(wardInput("c3-leather", cells, { gates, economy, commerce }));
    expect(dry.assignmentOrder.find(item => item.craftDomain === "leather")?.cellId).not.toBe(downClose.id);
  });
});
