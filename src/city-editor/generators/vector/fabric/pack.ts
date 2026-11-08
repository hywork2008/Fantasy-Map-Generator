import type { Point } from "../../../types/primitives";
import type { VectorFabricCell, VectorFabricLines } from "../../../types/vector/fabric";

/** Saved fabric coordinates are integer centimetres relative to a record origin. */
export const FABRIC_QUANTUM_METERS = 0.01;

export function packPoints(points: Point[], origin: Point): number[] {
  return points.flatMap(p => [
    Math.round((p[0] - origin[0]) / FABRIC_QUANTUM_METERS),
    Math.round((p[1] - origin[1]) / FABRIC_QUANTUM_METERS)
  ]);
}

export function unpackPoints(coords: number[], origin: Point, from = 0, to = coords.length / 2): Point[] {
  const points: Point[] = [];
  for (let i = from; i < to; i++)
    points.push([
      origin[0] + coords[2 * i] * FABRIC_QUANTUM_METERS,
      origin[1] + coords[2 * i + 1] * FABRIC_QUANTUM_METERS
    ]);
  return points;
}

export function packLines(lines: { points: Point[]; widthMeters: number }[], origin: Point): VectorFabricLines {
  const packed: VectorFabricLines = { widths: [], offsets: [], coords: [] };
  for (const line of lines) {
    packed.widths.push(line.widthMeters);
    packed.offsets.push(packed.coords.length / 2);
    packed.coords.push(...packPoints(line.points, origin));
  }
  return packed;
}

export function unpackLine(lines: VectorFabricLines, index: number, origin: Point): Point[] {
  const end = index + 1 < lines.offsets.length ? lines.offsets[index + 1] : lines.coords.length / 2;
  return unpackPoints(lines.coords, origin, lines.offsets[index], end);
}

export function cellHouseCount(cell: VectorFabricCell): number {
  return cell.houses.offsets.length;
}

/** Ring of house `index` in metres. */
export function cellHouseRing(cell: VectorFabricCell, index: number): Point[] {
  const end = index + 1 < cell.houses.offsets.length ? cell.houses.offsets[index + 1] : cell.houses.coords.length / 2;
  return unpackPoints(cell.houses.coords, cell.origin, cell.houses.offsets[index], end);
}

/** Logical id of a generated house: stable until its street block is rebuilt. */
export const fabricHouseId = (cellId: string, index: number) => `${cellId}#${index}`;
