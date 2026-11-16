import type { Point } from "../../../types/primitives";
import type { VectorCityDocument, VectorPath } from "../../../types/vector/document";
import type { VectorFabricDetachedLine } from "../../../types/vector/fabric";
import { fabricCellHash, fabricDistrictHash } from "../fabric/hash";
import { FABRIC_ENTRANCE_TOLERANCE_METERS } from "../fabric/houses";
import { fabricLine, isDetachedFabricLine, nearestFabricLine } from "../fabric/lines";
import { matchesVectorUrbanFingerprint } from "../generation/urbanState";
import { pathSegmentIds } from "../geometry/curves";
import { assertVectorDocument } from "../validation/document";
import { refreshUrbanLedger } from "./fabricHouses";
import { rebuildRoadGraph } from "./network";
import { curveSource } from "./paths";

/** Path id of fabric line `<owner>~<s|l><n>`. */
export const detachedLinePathId = (lineId: string) => `fabric-line:${lineId.replace("~", ":")}`;
export const isDetachedFabricLinePath = (path: VectorPath) => path.id.startsWith("fabric-line:");

const parse = (lineId: string) => {
  const match = /^(.+)~([sl])(0|[1-9]\d*)$/.exec(lineId);
  return match ? { owner: match[1], kind: match[2] as "s" | "l", index: Number(match[3]) } : undefined;
};

/** Moves fabric street or lane `lineId` to a manual road `VectorPath`, without regenerating anything. An end
 * the record joined to a road graph node is anchored at that node; an end on another fabric line is kept as a
 * join to that line. The record keeps the line (marked detached), so other lines' indices stay valid. */
export function detachFabricLine(
  source: VectorCityDocument,
  lineId: string
): { document: VectorCityDocument; pathId: string } {
  assertVectorDocument(source);
  const u = source.urban;
  if (!u || u.inputRevision !== source.revision || !matchesVectorUrbanFingerprint(source, u.adoptedFingerprint))
    throw new Error("dependency-stale");
  const ref = parse(lineId),
    line = fabricLine(source.fabric, lineId);
  if (!ref || !line || isDetachedFabricLine(source.fabric, lineId)) throw new Error("dependency-path-required");
  const doc = structuredClone(source),
    pathId = detachedLinePathId(lineId);
  if (Object.hasOwn(doc.paths, pathId)) throw new Error("dependency-path-required");
  const path: VectorPath = {
    id: pathId,
    revision: 0,
    role: "road",
    origin: "manual",
    editPolicy: "editable",
    source: curveSource(line.points, "polyline", false),
    width: { leftMeters: line.widthMeters / 2, rightMeters: line.widthMeters / 2, stations: [] }
  };
  doc.paths[pathId] = path;
  const segments = pathSegmentIds(path),
    district = ref.kind === "s" ? doc.fabric!.districts[ref.owner] : undefined,
    cell = ref.kind === "l" ? doc.fabric!.cells[ref.owner] : undefined,
    mouths = district?.mouths.filter(m => m.street === ref.index) ?? cell!.mouths.filter(m => m.lane === ref.index),
    joins: VectorFabricDetachedLine["joins"] = [];
  for (const end of [0, 1] as const) {
    const mouth = mouths.find(m => m.end === end);
    if (mouth && doc.connections.nodes[mouth.nodeId]) {
      doc.connections.nodes[mouth.nodeId].anchors.push({
        pathId,
        segmentId: end === 0 ? segments[0] : segments.at(-1)!,
        t: end
      });
      continue;
    }
    const p: Point = end === 0 ? line.points[0] : line.points.at(-1)!,
      hit = nearestFabricLine(doc.fabric, p, FABRIC_ENTRANCE_TOLERANCE_METERS * 5, lineId);
    if (hit) joins.push({ end, line: hit.id });
  }
  const entry: VectorFabricDetachedLine = { index: ref.index, pathId, joins };
  if (district) {
    district.detachedLines = [...(district.detachedLines ?? []), entry].sort((a, b) => a.index - b.index);
    const { hash: _hash, ...record } = district;
    district.hash = fabricDistrictHash(record);
  } else {
    cell!.detachedLines = [...(cell!.detachedLines ?? []), entry].sort((a, b) => a.index - b.index);
    const { hash: _hash, ...record } = cell!;
    cell!.hash = fabricCellHash(record);
  }
  // A road detached earlier that ended on this line now ends on this road; the join to the record goes.
  for (const r of [...Object.values(doc.fabric!.districts), ...Object.values(doc.fabric!.cells)]) {
    if (!r.detachedLines?.some(l => l.joins.some(j => j.line === lineId))) continue;
    for (const l of r.detachedLines) l.joins = l.joins.filter(j => j.line !== lineId);
    if ("cellIds" in r) {
      const { hash: _h, ...record } = r;
      r.hash = fabricDistrictHash(record);
    } else {
      const { hash: _h, ...record } = r;
      r.hash = fabricCellHash(record);
    }
  }
  rebuildRoadGraph(doc);
  // Fabric lines show from the lane stage on; the path that replaces one does too.
  for (const c of doc.urban!.checkpoints)
    if (["blocksAndLanes", "facilities", "housing"].includes(c.id)) c.pathIds.push(pathId);
  doc.revision++;
  refreshUrbanLedger(doc, []);
  assertVectorDocument(doc);
  return { document: doc, pathId };
}
