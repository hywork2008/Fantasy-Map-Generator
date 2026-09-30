import { snap } from "../geometry";
import type { GenerationSettings } from "../types";
import type { LayoutPlan, PlannedSpace } from "./types";

/** A jittered rectangular room lattice keeps route channels clear. A random
 * spanning tree supplies branches; extra lattice edges create exact loops.
 * Each route has a real rectangular floor and two room-door connections. */
export function planRoomCorridor(settings: GenerationSettings, random: () => number): LayoutPlan {
  const { roomCount: count, widthMeters: w, depthMeters: h } = settings;
  const cols = Math.min(count, Math.max(1, Math.ceil(Math.sqrt((count * w) / h))));
  const rows = Math.ceil(count / cols);
  const tw = w / cols;
  const th = h / rows;
  // Corridor sides face the surrounding solid/exterior, so they use outer walls.
  const corridor = settings.corridorWidthMeters + settings.outerWallMeters;
  const minimum = Math.max(settings.minRoomWidthMeters + settings.outerWallMeters, corridor + 1);
  const maximumW = tw - corridor - 1;
  const maximumH = th - corridor - 1;
  if (Math.min(maximumW, maximumH) < minimum)
    throw new Error("部屋数に対して敷地が狭すぎます。部屋数・通路幅を減らすか敷地を広げてください。");
  const spaces: PlannedSpace[] = [];
  const centers: Array<[number, number]> = [];
  for (let i = 0; i < count; i++) {
    const cx = snap(((i % cols) + 0.5) * tw);
    const cy = snap((Math.floor(i / cols) + 0.5) * th);
    const halfW = Math.floor((minimum + (maximumW - minimum) * (0.35 + 0.65 * random())) * 2) / 4;
    const halfH = Math.floor((minimum + (maximumH - minimum) * (0.35 + 0.65 * random())) * 2) / 4;
    spaces.push({
      id: `s-${i + 1}`,
      kind: "room",
      use: ["広間", "貯蔵室", "居室", "祭室"][Math.floor(random() * 4)],
      label: "",
      rect: [cx - halfW, cy - halfH, cx + halfW, cy + halfH]
    });
    centers.push([cx, cy]);
  }
  const edges: Array<{ a: number; b: number; weight: number }> = [];
  for (let i = 0; i < count; i++) {
    if (i % cols < cols - 1 && i + 1 < count) edges.push({ a: i, b: i + 1, weight: random() });
    if (i + cols < count) edges.push({ a: i, b: i + cols, weight: random() });
  }
  edges.sort((a, b) => a.weight - b.weight);
  const parents = Array.from({ length: count }, (_, i) => i);
  const find = (index: number): number => {
    while (parents[index] !== index) index = parents[index];
    return index;
  };
  const selected: typeof edges = [];
  const extra: typeof edges = [];
  for (const edge of edges) {
    const a = find(edge.a);
    const b = find(edge.b);
    if (a !== b) {
      parents[a] = b;
      selected.push(edge);
    } else extra.push(edge);
  }
  if (extra.length < settings.loopCount)
    throw new Error(`この部屋配置では周回路は最大 ${extra.length} 個です。周回路数を減らしてください。`);
  selected.push(...extra.slice(0, settings.loopCount));
  const plan: LayoutPlan = {
    spaces,
    connections: [],
    entranceSpaceId: "",
    entranceSide: settings.entranceSide,
    entranceWidth: settings.entranceWidthMeters
  };
  for (const edge of selected) {
    const a = spaces[edge.a];
    const b = spaces[edge.b];
    const [cx, cy] = centers[edge.a];
    const horizontal = Math.floor(edge.a / cols) === Math.floor(edge.b / cols);
    const half = corridor / 2;
    const rect: PlannedSpace["rect"] = horizontal
      ? [a.rect[2], snap(cy - half), b.rect[0], snap(cy + half)]
      : [snap(cx - half), a.rect[3], snap(cx + half), b.rect[1]];
    const id = `s-${spaces.length + 1}`;
    spaces.push({ id, kind: "corridor", use: "通路", label: "", rect });
    plan.connections.push({ a: a.id, b: id, kind: "door", width: settings.corridorWidthMeters });
    plan.connections.push({ a: b.id, b: id, kind: "door", width: settings.corridorWidthMeters });
  }
  const axis = settings.entranceSide === "north" || settings.entranceSide === "south" ? 1 : 0;
  const high = settings.entranceSide === "south" || settings.entranceSide === "east";
  const candidates = spaces
    .slice(0, count)
    .sort((a, b) => (high ? -1 : 1) * (a.rect[axis + (high ? 2 : 0)] - b.rect[axis + (high ? 2 : 0)]));
  plan.entranceSpaceId = candidates[0].id;
  return plan;
}
