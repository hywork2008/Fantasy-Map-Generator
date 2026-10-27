import { expect, it } from "vitest";
import type { Point } from "../../../types/document";
import type { Cell } from "../../../types/geometry";
import { classifyUrban } from "../../classifyUrban";
import { buildHexGrid } from "../../hexGrid";
import { plotArea } from "../../parcelGeometry";
import { urbanLandAreas } from "./landBudget";

const rectangle = (left: number, bottom: number, right: number, top: number): Point[] => [
  [left, bottom],
  [right, bottom],
  [right, top],
  [left, top]
];

it("counts overlapping surveyed water once and leaves a dry island available", () => {
  const cell: Cell = { id: 0, polygon: rectangle(0, 0, 100, 100), centroid: [50, 50], neighbors: [] };
  expect(urbanLandAreas([cell], [rectangle(0, 0, 60, 100), rectangle(40, 0, 80, 100)])!.get(0)).toBeCloseTo(2000);
  const surrounding = [
    rectangle(0, 0, 40, 100),
    rectangle(60, 0, 100, 100),
    rectangle(40, 0, 60, 40),
    rectangle(40, 60, 60, 100)
  ];
  expect(urbanLandAreas([cell], surrounding)!.get(0)).toBeCloseTo(400);
});

it("grows a connected inland core to its dry-area budget beside a wide channel", () => {
  const cells = buildHexGrid(1200, 35);
  const landArea = urbanLandAreas(cells, [rectangle(40, -600, 500, 600)])!;
  const radius = 180;
  const ctx = { sea: new Set<number>(), bank: new Map<number, number>(), landArea };
  const result = classifyUrban(cells, ctx, [], radius);
  const admitted = cells.filter(cell => result.urban.has(cell.id));
  const dryArea = admitted.reduce((sum, cell) => sum + landArea.get(cell.id)!, 0);
  const last = cells.find(cell => cell.id === result.stages.at(-1)!.cellId)!;
  expect(dryArea).toBeGreaterThanOrEqual(Math.PI * radius ** 2);
  expect(dryArea - landArea.get(last.id)!).toBeLessThan(Math.PI * radius ** 2);
  expect(admitted.every(cell => landArea.get(cell.id)! > 0.001)).toBe(true);
  const legacy = classifyUrban(
    cells,
    {
      sea: new Set(cells.filter(cell => landArea.get(cell.id)! < 0.001).map(cell => cell.id)),
      bank: new Map()
    },
    [],
    radius
  );
  const wetArea = (ids: Set<number>) =>
    cells.reduce((sum, cell) => sum + (ids.has(cell.id) ? plotArea(cell.polygon) - landArea.get(cell.id)! : 0), 0);
  expect(wetArea(result.urban)).toBeLessThan(wetArea(legacy.urban));
  const reached = new Set([result.stages[0].cellId]);
  for (const id of result.urban) {
    expect(
      id === result.stages[0].cellId || cells.find(cell => cell.id === id)!.neighbors.some(n => reached.has(n))
    ).toBe(true);
    reached.add(id);
  }
  expect(classifyUrban(cells, ctx, [], radius, null, null, 35, false).urban).toEqual(result.urban);
});
