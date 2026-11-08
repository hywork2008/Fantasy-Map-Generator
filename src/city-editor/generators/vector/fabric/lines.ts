import RBush from "rbush";
import type { Point } from "../../../types/primitives";
import type { VectorFabric } from "../../../types/vector/fabric";
import { nearestOnPolyline } from "../../geom";
import { unpackLine } from "./pack";

/** Street `index` of a district record. */
export const fabricStreetId = (districtId: string, index: number) => `${districtId}~s${index}`;
/** Lane `index` of a street-block record. */
export const fabricLaneId = (cellId: string, index: number) => `${cellId}~l${index}`;

/** Centreline and width of a fabric street or lane, or undefined when the record no longer has it. */
export function fabricLine(
  fabric: Readonly<VectorFabric> | undefined,
  id: string
): { points: Point[]; widthMeters: number } | undefined {
  const match = /^(.+)~([sl])(0|[1-9]\d*)$/.exec(id);
  if (!fabric || !match) return undefined;
  const [, owner, kind, n] = match,
    index = Number(n),
    record =
      kind === "s"
        ? Object.hasOwn(fabric.districts, owner)
          ? { origin: fabric.districts[owner].origin, lines: fabric.districts[owner].streets }
          : undefined
        : Object.hasOwn(fabric.cells, owner)
          ? { origin: fabric.cells[owner].origin, lines: fabric.cells[owner].lanes }
          : undefined;
  if (!record || index >= record.lines.widths.length) return undefined;
  return { points: unpackLine(record.lines, index, record.origin), widthMeters: record.lines.widths[index] };
}

interface LineItem {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  id: string;
  points: Point[];
  widthMeters: number;
}
const indices = new WeakMap<object, RBush<LineItem>>();

/** Every street and lane in one R-tree; built once per fabric object. */
function lineIndex(fabric: Readonly<VectorFabric>): RBush<LineItem> {
  let index = indices.get(fabric);
  if (index) return index;
  const items: LineItem[] = [];
  const add = (id: string, points: Point[], widthMeters: number) =>
    items.push({
      minX: Math.min(...points.map(p => p[0])),
      minY: Math.min(...points.map(p => p[1])),
      maxX: Math.max(...points.map(p => p[0])),
      maxY: Math.max(...points.map(p => p[1])),
      id,
      points,
      widthMeters
    });
  for (const d of Object.values(fabric.districts))
    for (let i = 0; i < d.streets.widths.length; i++)
      add(fabricStreetId(d.id, i), unpackLine(d.streets, i, d.origin), d.streets.widths[i]);
  for (const c of Object.values(fabric.cells))
    for (let i = 0; i < c.lanes.widths.length; i++)
      add(fabricLaneId(c.id, i), unpackLine(c.lanes, i, c.origin), c.lanes.widths[i]);
  index = new RBush<LineItem>();
  index.load(items);
  indices.set(fabric, index);
  return index;
}

/** Fabric lines whose bounding boxes come within `reach` of the box. */
export function fabricLinesNear(
  fabric: Readonly<VectorFabric>,
  box: { minX: number; minY: number; maxX: number; maxY: number },
  reach = 0
): { id: string; points: Point[]; widthMeters: number }[] {
  return lineIndex(fabric)
    .search({ minX: box.minX - reach, minY: box.minY - reach, maxX: box.maxX + reach, maxY: box.maxY + reach })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The fabric line closest to `p` within `reach` metres, with the closest point on its centreline. */
export function nearestFabricLine(
  fabric: Readonly<VectorFabric> | undefined,
  p: Point,
  reach: number
): { id: string; point: Point; distance: number } | undefined {
  if (!fabric) return undefined;
  let best: { id: string; point: Point; distance: number } | undefined;
  for (const line of fabricLinesNear(fabric, { minX: p[0], minY: p[1], maxX: p[0], maxY: p[1] }, reach)) {
    const hit = nearestOnPolyline(p, line.points);
    if (hit.dist <= reach && (!best || hit.dist < best.distance))
      best = { id: line.id, point: hit.point, distance: hit.dist };
  }
  return best;
}
