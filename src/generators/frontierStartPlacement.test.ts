import { describe, expect, it } from "vitest";
import type { PackedGraph } from "../types/PackedGraph";
import type { SettlementFoundationPlan } from "../types/settlementFoundation";
import { getPreferredDispersedSeaborneFoundationCells, selectFrontierStartCapitals } from "./frontierStartPlacement";

function buildPack(opts: {
  cellCount: number;
  featureOf: number[];
  features: Array<{ i: number; land: boolean; type: string; cells: number; group?: string }>;
  harbor?: number[];
  haven?: number[];
  havenFeature?: number[];
  river?: number[];
  coast?: number[];
  suitability?: number[];
}): PackedGraph {
  const cellCount = opts.cellCount;
  const f = new Uint16Array(opts.featureOf);
  const harbor = new Uint16Array(opts.harbor ?? Array.from({ length: cellCount }, () => 0));
  const haven = new Uint16Array(opts.haven ?? Array.from({ length: cellCount }, () => 0));
  const h = new Uint8Array(Array.from({ length: cellCount }, (_, i) => (opts.featureOf[i] === 9 ? 0 : 25)));
  const s = new Int16Array(opts.suitability ?? Array.from({ length: cellCount }, () => 10));
  const r = new Uint16Array(opts.river ?? Array.from({ length: cellCount }, () => 0));
  const t = new Int8Array(opts.coast ?? Array.from({ length: cellCount }, () => 0));
  const cells = {
    i: Array.from({ length: cellCount }, (_, i) => i),
    f,
    harbor,
    haven,
    h,
    s,
    r,
    t,
    c: Array.from({ length: cellCount }, (_, i) => [i - 1, i + 1].filter(cell => cell >= 0 && cell < cellCount)),
    p: Array.from({ length: cellCount }, (_, i) => [i * 10, 0] as [number, number])
  };
  const features: PackedGraph["features"] = [0 as unknown as PackedGraph["features"][number]];
  for (const feature of opts.features) {
    features[feature.i] = feature as PackedGraph["features"][number];
  }
  if (opts.havenFeature) {
    for (let i = 0; i < opts.havenFeature.length; i++) {
      if (opts.havenFeature[i]) {
        (cells.f as Uint16Array)[i] = cells.f[i];
      }
    }
    // Haven cells live at the haven index; stamp their water feature.
    for (let land = 0; land < cellCount; land++) {
      const havenCell = haven[land];
      if (havenCell && opts.havenFeature[land] != null) {
        f[havenCell] = opts.havenFeature[land];
      }
    }
  }
  return { cells, features } as unknown as PackedGraph;
}

const plan = (nodes: SettlementFoundationPlan["nodes"], regionCells: number[][]): SettlementFoundationPlan => ({
  regions: regionCells.map((cells, id) => ({
    id,
    kind: "coast" as const,
    center: cells[0],
    cells
  })),
  nodes,
  links: []
});

describe("selectFrontierStartCapitals", () => {
  it("selects only large-landmass ocean harbours for dispersed seaborne Foundation regions", () => {
    const featureOf = Array.from({ length: 86 }, (_, index) => (index === 80 ? 8 : index === 81 ? 2 : 1));
    const harbor = Array.from({ length: 86 }, () => 0);
    const haven = Array.from({ length: 86 }, () => 0);
    for (const cellId of [5, 20, 35, 50]) {
      harbor[cellId] = 1;
      haven[cellId] = 80;
    }
    harbor[81] = 1;
    haven[81] = 80;
    const pack = buildPack({
      cellCount: 86,
      featureOf,
      harbor,
      haven,
      havenFeature: Array.from({ length: 86 }, (_, index) => (haven[index] ? 8 : 0)),
      features: [
        { i: 1, land: true, type: "island", cells: 80 },
        { i: 2, land: true, type: "island", cells: 1 },
        { i: 8, land: false, type: "ocean", cells: 300 }
      ]
    });

    expect([...getPreferredDispersedSeaborneFoundationCells(pack, 1, 4)]).toEqual([5, 20, 35, 50]);
  });

  it("excludes a large-but-noncontinental island when continents can host every polity", () => {
    const cellCount = 290;
    const featureOf = Array.from({ length: cellCount }, (_, index) =>
      index < 90 ? 1 : index < 180 ? 2 : index < 287 ? 3 : 8
    );
    const harbor = Array.from({ length: cellCount }, () => 0);
    const haven = Array.from({ length: cellCount }, () => 0);
    for (const cellId of [5, 25, 95, 115, 185, 205]) {
      harbor[cellId] = 1;
      haven[cellId] = 287;
    }
    const pack = buildPack({
      cellCount,
      featureOf,
      harbor,
      haven,
      havenFeature: Array.from({ length: cellCount }, (_, index) => (haven[index] ? 8 : 0)),
      features: [
        { i: 1, land: true, type: "island", group: "continent", cells: 500 },
        { i: 2, land: true, type: "island", group: "continent", cells: 400 },
        { i: 3, land: true, type: "island", group: "island", cells: 107 },
        { i: 8, land: false, type: "ocean", cells: 400 }
      ]
    });

    expect([...getPreferredDispersedSeaborneFoundationCells(pack, 1, 4)]).toEqual([5, 25, 95, 115]);
  });

  it("never starts on a one-cell isle when a large landmass exists", () => {
    // cells 0-89: continent 1; cell 90: one-cell isle 2; cell 91: ocean haven for isle
    const featureOf = Array.from({ length: 92 }, (_, i) => (i === 90 ? 2 : i === 91 ? 8 : 1));
    const pack = buildPack({
      cellCount: 92,
      featureOf,
      features: [
        { i: 1, land: true, type: "island", cells: 90 },
        { i: 2, land: true, type: "island", cells: 1 },
        { i: 8, land: false, type: "ocean", cells: 200 }
      ]
    });
    const selected = selectFrontierStartCapitals({
      plan: plan(
        [
          { id: 0, regionId: 0, cell: 90, role: "center", score: 99 },
          { id: 1, regionId: 1, cell: 4, role: "center", score: 5 }
        ],
        [[90], [4, 5, 6]]
      ),
      pack,
      count: 1,
      startMode: "landOrigin",
      realmSize: 1
    });
    expect(selected.map(node => node.cell)).toEqual([4]);
  });

  it("snaps a seaborne capital from inland to the ocean harbor on the same landmass", () => {
    const featureOf = Array.from({ length: 85 }, () => 1);
    featureOf[80] = 8;
    const harbor = Array.from({ length: 85 }, () => 0);
    harbor[10] = 1;
    const haven = Array.from({ length: 85 }, () => 0);
    haven[10] = 80;
    const pack = buildPack({
      cellCount: 85,
      featureOf,
      harbor,
      haven,
      havenFeature: Array.from({ length: 85 }, (_, i) => (i === 10 ? 8 : 0)),
      features: [
        { i: 1, land: true, type: "island", cells: 84 },
        { i: 8, land: false, type: "ocean", cells: 200 }
      ]
    });
    const selected = selectFrontierStartCapitals({
      plan: plan(
        [{ id: 0, regionId: 0, cell: 3, role: "center", score: 20 }],
        [Array.from({ length: 20 }, (_, i) => i)]
      ),
      pack,
      count: 1,
      startMode: "seaborne",
      realmSize: 1
    });
    expect(selected.map(node => node.cell)).toEqual([10]);
  });

  it("does not snap multi-cell land-origin capitals to the coast", () => {
    const featureOf = Array.from({ length: 85 }, () => 1);
    featureOf[80] = 8;
    const harbor = Array.from({ length: 85 }, () => 0);
    harbor[10] = 1;
    const haven = Array.from({ length: 85 }, () => 0);
    haven[10] = 80;
    const pack = buildPack({
      cellCount: 85,
      featureOf,
      harbor,
      haven,
      havenFeature: Array.from({ length: 85 }, (_, i) => (i === 10 ? 8 : 0)),
      features: [
        { i: 1, land: true, type: "island", cells: 84 },
        { i: 8, land: false, type: "ocean", cells: 200 }
      ]
    });
    const selected = selectFrontierStartCapitals({
      plan: plan([{ id: 0, regionId: 0, cell: 3, role: "center", score: 20 }], [[3, 10]]),
      pack,
      count: 1,
      startMode: "landOrigin",
      realmSize: 30
    });
    expect(selected.map(node => node.cell)).toEqual([3]);
  });

  it("places a one-cell land-origin capital on a coastal river-mouth, not an inland high-score node", () => {
    const cellCount = 85;
    const featureOf = Array.from({ length: cellCount }, () => 1);
    featureOf[80] = 8;
    const river = Array.from({ length: cellCount }, () => 0);
    river[12] = 7;
    const harbor = Array.from({ length: cellCount }, () => 0);
    harbor[12] = 1;
    const haven = Array.from({ length: cellCount }, () => 0);
    haven[12] = 80;
    const coast = Array.from({ length: cellCount }, () => 0);
    coast[12] = 1;
    const pack = buildPack({
      cellCount,
      featureOf,
      river,
      harbor,
      haven,
      coast,
      havenFeature: Array.from({ length: cellCount }, (_, i) => (i === 12 ? 8 : 0)),
      features: [
        { i: 1, land: true, type: "island", cells: 84 },
        { i: 8, land: false, type: "ocean", cells: 200 }
      ]
    });
    const selected = selectFrontierStartCapitals({
      plan: plan([{ id: 0, regionId: 0, cell: 3, role: "center", score: 99 }], [[3, 12]]),
      pack,
      count: 1,
      startMode: "landOrigin",
      realmSize: 1
    });
    expect(selected.map(node => node.cell)).toEqual([12]);
  });

  it("places a large land-origin capital on a river, not a riverless high-score node or harbor", () => {
    const cellCount = 85;
    const featureOf = Array.from({ length: cellCount }, () => 1);
    featureOf[80] = 8;
    const river = Array.from({ length: cellCount }, () => 0);
    river[5] = 7;
    const harbor = Array.from({ length: cellCount }, () => 0);
    harbor[10] = 1;
    const haven = Array.from({ length: cellCount }, () => 0);
    haven[10] = 80;
    const coast = Array.from({ length: cellCount }, () => 0);
    coast[10] = 1;
    const pack = buildPack({
      cellCount,
      featureOf,
      river,
      harbor,
      haven,
      coast,
      havenFeature: Array.from({ length: cellCount }, (_, i) => (i === 10 ? 8 : 0)),
      features: [
        { i: 1, land: true, type: "island", cells: 84 },
        { i: 8, land: false, type: "ocean", cells: 200 }
      ]
    });
    const selected = selectFrontierStartCapitals({
      plan: plan([{ id: 0, regionId: 0, cell: 3, role: "center", score: 99 }], [[3, 5, 10]]),
      pack,
      count: 1,
      startMode: "landOrigin",
      realmSize: 30
    });
    expect(selected.map(node => node.cell)).toEqual([5]);
  });

  it("does not move a capital to a river outside its populated Foundation region", () => {
    const cellCount = 85;
    const featureOf = Array.from({ length: cellCount }, () => 1);
    const river = Array.from({ length: cellCount }, () => 0);
    // Cell 5 is a more attractive river, but it has no Foundation population.
    river[5] = 7;
    river[10] = 1;
    const pack = buildPack({
      cellCount,
      featureOf,
      river,
      features: [{ i: 1, land: true, type: "island", cells: cellCount }]
    });
    const selected = selectFrontierStartCapitals({
      plan: plan([{ id: 0, regionId: 0, cell: 3, role: "center", score: 20 }], [[3, 10]]),
      pack,
      count: 1,
      startMode: "landOrigin",
      realmSize: 30
    });

    expect(selected.map(node => node.cell)).toEqual([10]);
    expect(selected[0]?.regionId).toBe(0);
  });

  it("uses separate Foundation regions before placing a second dispersed river capital in one region", () => {
    const cellCount = 85;
    const featureOf = Array.from({ length: cellCount }, () => 1);
    const river = Array.from({ length: cellCount }, () => 0);
    // Region 0 has the two highest-quality river sites. Region 1 still gets
    // a capital first when the user asks for dispersed starting states.
    river[3] = 9;
    river[14] = 8;
    river[5] = 1;
    const pack = buildPack({
      cellCount,
      featureOf,
      river,
      features: [{ i: 1, land: true, type: "island", cells: cellCount }]
    });
    const selected = selectFrontierStartCapitals({
      plan: plan(
        [
          { id: 0, regionId: 0, cell: 3, role: "center", score: 20 },
          { id: 1, regionId: 1, cell: 5, role: "center", score: 10 }
        ],
        [[3, 14], [5]]
      ),
      pack,
      count: 2,
      startMode: "landOrigin",
      realmSize: 1,
      spacing: "dispersed"
    });

    expect(selected.map(node => node.cell).sort((a, b) => a - b)).toEqual([3, 5]);
    expect(new Set(selected.map(node => node.regionId)).size).toBe(2);
  });

  it("spaces two one-cell starts along the same island coast instead of the strip ends", () => {
    const cellCount = 90;
    const featureOf = Array.from({ length: cellCount }, () => 1);
    featureOf[85] = 8;
    const river = Array.from({ length: cellCount }, () => 0);
    const harbor = Array.from({ length: cellCount }, () => 0);
    const haven = Array.from({ length: cellCount }, () => 0);
    const coast = Array.from({ length: cellCount }, () => 0);
    const suitability = Array.from({ length: cellCount }, () => 4);
    // End cells are also river mouths but poorer, so Euclidean farthest-point
    // would still grab 0 and 19. Quality + coast hops should prefer 3 and 14.
    for (const cellId of [0, 3, 14, 19]) {
      river[cellId] = 1;
      harbor[cellId] = 1;
      haven[cellId] = 85;
      coast[cellId] = 1;
    }
    suitability[3] = 40;
    suitability[14] = 38;
    suitability[0] = 6;
    suitability[19] = 6;
    const pack = buildPack({
      cellCount,
      featureOf,
      river,
      harbor,
      haven,
      coast,
      suitability,
      havenFeature: Array.from({ length: cellCount }, (_, i) => ([0, 3, 14, 19].includes(i) ? 8 : 0)),
      features: [
        { i: 1, land: true, type: "island", cells: 85 },
        { i: 8, land: false, type: "ocean", cells: 200 }
      ]
    });
    const selected = selectFrontierStartCapitals({
      plan: plan(
        [
          { id: 0, regionId: 0, cell: 0, role: "center", score: 1 },
          { id: 1, regionId: 1, cell: 19, role: "center", score: 1 }
        ],
        [
          [0, 3],
          [14, 19]
        ]
      ),
      pack,
      count: 2,
      startMode: "landOrigin",
      realmSize: 1,
      spacing: "dispersed"
    });
    expect(selected.map(node => node.cell).sort((a, b) => a - b)).toEqual([3, 14]);
  });

  it("fills a continent before opening island homelands under dispersed spacing", () => {
    const cellCount = 130;
    const featureOf = Array.from({ length: cellCount }, (_, i) => {
      if (i === 125 || i === 126) return 8;
      if (i >= 100) return 3;
      if (i >= 80) return 2;
      return 1;
    });
    const river = Array.from({ length: cellCount }, () => 0);
    const harbor = Array.from({ length: cellCount }, () => 0);
    const haven = Array.from({ length: cellCount }, () => 0);
    const coast = Array.from({ length: cellCount }, () => 0);
    const suitability = Array.from({ length: cellCount }, () => 8);
    const mouths = [5, 20, 35, 50, 85, 110];
    for (const cellId of mouths) {
      river[cellId] = 1;
      harbor[cellId] = 1;
      haven[cellId] = cellId >= 100 ? 126 : 125;
      coast[cellId] = 1;
    }
    // Island mouths are richer so the old one-per-landmass pass would take them.
    suitability[85] = 90;
    suitability[110] = 90;
    suitability[5] = 40;
    suitability[20] = 38;
    suitability[35] = 36;
    suitability[50] = 34;
    const pack = buildPack({
      cellCount,
      featureOf,
      river,
      harbor,
      haven,
      coast,
      suitability,
      havenFeature: Array.from({ length: cellCount }, (_, i) => (mouths.includes(i) ? 8 : 0)),
      features: [
        { i: 1, land: true, type: "island", group: "continent", cells: 80 },
        { i: 2, land: true, type: "island", group: "island", cells: 20 },
        { i: 3, land: true, type: "island", group: "island", cells: 25 },
        { i: 8, land: false, type: "ocean", cells: 400 }
      ]
    });
    const selected = selectFrontierStartCapitals({
      plan: plan(
        mouths.map((cell, id) => ({ id, regionId: id, cell, role: "center", score: 1 })),
        mouths.map(cell => [cell])
      ),
      pack,
      count: 4,
      startMode: "landOrigin",
      realmSize: 1,
      spacing: "dispersed"
    });
    expect(selected.map(node => node.cell).sort((a, b) => a - b)).toEqual([5, 20, 35, 50]);
  });
});
