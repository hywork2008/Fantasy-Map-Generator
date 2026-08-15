import { describe, expect, it } from "vitest";
import type { PackedGraph } from "../types/PackedGraph";
import type { SettlementFoundationPlan } from "../types/settlementFoundation";
import { selectFrontierStartCapitals } from "./frontierStartPlacement";

function buildPack(opts: {
  cellCount: number;
  featureOf: number[];
  features: Array<{ i: number; land: boolean; type: string; cells: number }>;
  harbor?: number[];
  haven?: number[];
  havenFeature?: number[];
}): PackedGraph {
  const cellCount = opts.cellCount;
  const f = new Uint16Array(opts.featureOf);
  const harbor = new Uint16Array(opts.harbor ?? Array.from({ length: cellCount }, () => 0));
  const haven = new Uint16Array(opts.haven ?? Array.from({ length: cellCount }, () => 0));
  const h = new Uint8Array(Array.from({ length: cellCount }, (_, i) => (opts.featureOf[i] === 9 ? 0 : 25)));
  const s = new Int16Array(Array.from({ length: cellCount }, () => 10));
  const cells = {
    i: Array.from({ length: cellCount }, (_, i) => i),
    f,
    harbor,
    haven,
    h,
    s,
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

  it("does not snap land-origin capitals to the coast", () => {
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
      realmSize: 1
    });
    expect(selected.map(node => node.cell)).toEqual([3]);
  });
});
