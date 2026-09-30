import { snap } from "../geometry";
import type { GenerationSettings, Point } from "../types";
import type { LayoutPlan, PlannedSpace } from "./types";

function cuts(lo: number, hi: number, minimum: number, random: () => number, symmetric: boolean): number[] {
  let count = Math.max(1, Math.floor((hi - lo) / (minimum * (1.25 + random() * 0.5))));
  if (symmetric) {
    // An axis halfway between grid points must pass through a room, not a wall.
    if (count % 2 === 0 && !Number.isInteger(((lo + hi) / 2) * 4)) count--;
    const left = [lo];
    for (let i = 1; i <= Math.floor((count - 1) / 2); i++) left.push(snap(lo + ((hi - lo) * i) / count));
    return [...left, ...(count % 2 === 0 ? [(lo + hi) / 2] : []), ...left.map(value => lo + hi - value).reverse()];
  }
  const values = [lo];
  for (let i = 1; i < count; i++) {
    const variation = (random() - 0.5) * minimum * 0.2;
    values.push(snap(lo + ((hi - lo) * i) / count + variation));
  }
  values.push(hi);
  return values;
}

/** Rectangular courtyard, an inner room band, a covered circulation ring,
 * and an outer service band. The entrance interrupts both southern bands. */
export function planCaravanserai(settings: GenerationSettings, random: () => number): LayoutPlan {
  const sideways = settings.entranceSide === "east" || settings.entranceSide === "west";
  const w = sideways ? settings.depthMeters : settings.widthMeters;
  const h = sideways ? settings.widthMeters : settings.depthMeters;
  const cw = sideways ? settings.courtyardDepthMeters : settings.courtyardWidthMeters;
  const ch = sideways ? settings.courtyardWidthMeters : settings.courtyardDepthMeters;
  const roomDepth = settings.roomBandDepthMeters;
  const passage = settings.corridorWidthMeters + settings.partitionWallMeters;
  const x0 = (w - cw) / 2;
  const x1 = w - x0;
  const y0 = (h - ch) / 2;
  const y1 = h - y0;
  const ix0 = x0 - roomDepth;
  const ix1 = x1 + roomDepth;
  const iy0 = y0 - roomDepth;
  const iy1 = y1 + roomDepth;
  const cx0 = ix0 - passage;
  const cx1 = ix1 + passage;
  const cy0 = iy0 - passage;
  const cy1 = iy1 + passage;
  if (Math.min(cx0, cy0) < settings.minRoomWidthMeters + settings.outerWallMeters) {
    throw new Error("中庭と部屋帯が大きすぎます。外周を広げるか、中庭・部屋帯を小さくしてください。");
  }
  const gateWidth = settings.entranceWidthMeters + settings.partitionWallMeters;
  const gl = Math.floor(((w - gateWidth) / 2) * 4) / 4;
  const gr = w - gl;
  const spaces: PlannedSpace[] = [];
  const plan: LayoutPlan = {
    spaces,
    connections: [],
    entranceSpaceId: "",
    entranceSide: settings.entranceSide,
    entranceWidth: settings.entranceWidthMeters
  };
  const add = (kind: PlannedSpace["kind"], use: string, rect: PlannedSpace["rect"], label = ""): string => {
    const id = `s-${spaces.length + 1}`;
    spaces.push({ id, kind, use, rect, label });
    return id;
  };
  const court = add("courtyard", "中庭", [x0, y0, x1, y1], "中庭");
  const north = add("corridor", "回廊", [cx0, cy0, cx1, iy0]);
  const south = add("corridor", "回廊", [cx0, iy1, cx1, cy1]);
  const west = add("corridor", "回廊", [cx0, iy0, ix0, iy1]);
  const east = add("corridor", "回廊", [ix1, iy0, cx1, iy1]);
  for (const [a, b] of [
    [north, west],
    [north, east],
    [south, west],
    [south, east]
  ]) {
    plan.connections.push({ a, b, kind: "open", width: settings.corridorWidthMeters });
  }
  const vestibule = add("corridor", "入口前室", [gl, y1, gr, iy1]);
  const gatehouse = add("corridor", "入口棟", [gl, cy1, gr, h], "主入口");
  plan.entranceSpaceId = gatehouse;
  for (const [a, b] of [
    [court, vestibule],
    [vestibule, south],
    [south, gatehouse]
  ]) {
    plan.connections.push({ a, b, kind: "open", width: settings.entranceWidthMeters });
  }
  const room = (rect: PlannedSpace["rect"], corridor: string, use: string, courtyardDoor: boolean) => {
    const id = add("room", use, rect);
    plan.connections.push({ a: id, b: corridor, kind: "door", width: 1.25 });
    if (courtyardDoor) plan.connections.push({ a: id, b: court, kind: "door", width: 1.25 });
  };
  const minimum = settings.minRoomWidthMeters + settings.partitionWallMeters;
  const innerCuts = cuts(ix0, ix1, minimum, random, settings.symmetric);
  for (let i = 0; i < innerCuts.length - 1; i++) {
    const a = innerCuts[i];
    const b = innerCuts[i + 1];
    room([a, iy0, b, y0], north, "客室", Math.min(b, x1) - Math.max(a, x0) >= 2);
  }
  const sideCuts = cuts(y0, y1, minimum, random, settings.symmetric);
  for (let i = 0; i < sideCuts.length - 1; i++) {
    const a = sideCuts[i];
    const b = sideCuts[i + 1];
    room([ix0, a, x0, b], west, "客室", true);
    room([x1, a, ix1, b], east, "客室", true);
  }
  const innerLeft = cuts(ix0, gl, minimum, random, settings.symmetric);
  const innerRight = settings.symmetric ? innerLeft.map(x => w - x).reverse() : cuts(gr, ix1, minimum, random, false);
  for (const row of [innerLeft, innerRight]) {
    for (let i = 0; i < row.length - 1; i++) {
      const a = row[i];
      const b = row[i + 1];
      room([a, y1, b, iy1], south, "客室", Math.min(b, x1) - Math.max(a, x0) >= 2);
    }
  }
  const outerTop = [0, ...cuts(x0, x1, minimum * 1.5, random, settings.symmetric), w];
  for (let i = 0; i < outerTop.length - 1; i++)
    room([outerTop[i], 0, outerTop[i + 1], cy0], north, i % 2 ? "倉庫" : "厩", false);
  const outerLeft = [0, ...cuts(x0, gl, minimum * 1.5, random, settings.symmetric)];
  const outerRight = settings.symmetric
    ? outerLeft.map(x => w - x).reverse()
    : [...cuts(gr, x1, minimum * 1.5, random, false), w];
  for (const row of [outerLeft, outerRight]) {
    for (let i = 0; i < row.length - 1; i++) room([row[i], cy1, row[i + 1], h], south, "管理室", false);
  }
  const outerSides = cuts(cy0, cy1, minimum * 1.5, random, settings.symmetric);
  for (let i = 0; i < outerSides.length - 1; i++) {
    room([0, outerSides[i], cx0, outerSides[i + 1]], west, "倉庫", false);
    room([cx1, outerSides[i], w, outerSides[i + 1]], east, "厩", false);
  }
  const transform = ([x, y]: Point): Point => {
    if (settings.entranceSide === "north") return [w - x, h - y];
    if (settings.entranceSide === "east") return [y, w - x];
    if (settings.entranceSide === "west") return [h - y, x];
    return [x, y];
  };
  if (settings.fixtures) {
    const x = w / 2;
    const y = h / 2;
    plan.fixture = {
      spaceId: court,
      footprint: [
        [x - 1, y - 1],
        [x + 1, y - 1],
        [x + 1, y + 1],
        [x - 1, y + 1]
      ].map(p => transform(p as Point))
    };
    // Transforming a reflection is not used: all entrance transforms are rotations.
  }
  for (const space of spaces) {
    const [a, b, c, d] = space.rect;
    const points = [transform([a, b]), transform([c, d])];
    space.rect = [
      Math.min(points[0][0], points[1][0]),
      Math.min(points[0][1], points[1][1]),
      Math.max(points[0][0], points[1][0]),
      Math.max(points[0][1], points[1][1])
    ];
  }
  return plan;
}
