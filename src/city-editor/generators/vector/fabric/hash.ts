import type {
  VectorFabricCell,
  VectorFabricDetachedLine,
  VectorFabricDistrict,
  VectorFabricLines
} from "../../../types/vector/fabric";

function fnv64(text: string): string {
  let a = 0x811c9dc5,
    b = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b ^ code, 0x85ebca6b);
  }
  return `${(a >>> 0).toString(16).padStart(8, "0")}${(b >>> 0).toString(16).padStart(8, "0")}`;
}
const lines = (l: VectorFabricLines) => [l.widths, l.offsets, l.coords];
const detached = (d: VectorFabricDetachedLine[]) => d.map(l => [l.index, l.pathId, l.joins.map(j => [j.end, j.line])]);

/** Content hash in a fixed field order, so saved key order and the `hash` field itself never matter. */
export function fabricDistrictHash(d: Omit<VectorFabricDistrict, "hash">): string {
  const p = d.parameters;
  return fnv64(
    JSON.stringify([
      "district-v1",
      d.id,
      d.seed,
      [p.lotArea, p.laneWidthMeters, p.coverage, p.streetCellMeters, p.streetWidthMeters],
      d.origin,
      d.outline,
      d.boundaries.map(b => [b.feature, b.barrier, b.setback]),
      lines(d.streets),
      d.mouths.map(m => [m.street, m.end, m.nodeId]),
      d.cellIds,
      d.growthStage ?? null,
      ...(d.detachedLines ? [detached(d.detachedLines)] : [])
    ])
  );
}

export function fabricCellHash(c: Omit<VectorFabricCell, "hash">): string {
  const h = c.houses;
  return fnv64(
    JSON.stringify([
      "cell-v1",
      c.id,
      c.districtId,
      c.origin,
      c.ring,
      lines(c.lanes),
      c.attachments.map(a => [a.lane, a.end, a.street, a.t]),
      c.mouths.map(m => [m.lane, m.end, m.nodeId]),
      [h.offsets, h.coords, h.storeys, h.dwellings, h.entrances, h.draws],
      c.detached,
      c.inside ?? null,
      // Absent on records that never cleared a lot, so their hashes stay as they were.
      ...(c.cleared ? [c.cleared] : []),
      ...(c.detachedLines ? [detached(c.detachedLines)] : [])
    ])
  );
}
