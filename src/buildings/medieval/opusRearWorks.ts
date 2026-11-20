import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { BUILDING_PALETTES, type BuildingPaletteId } from "../appearance/palette";
import { compactModel } from "../compactModel";
import { REGIONAL_HOUSE_STYLES } from "../houses/regionalHouseStyles";
import type { Surface } from "./modelKit";
import {
  type OpusRearWorksLayout,
  type OpusRearWorksSpec,
  opusRearWorksLayout,
  opusRearWorksSpecKey
} from "./opusRearWorksProfiles";
import { TradeKit, type TradeQuality } from "./opusTradeKit";

export * from "./opusRearWorksProfiles";

const WALL = 0.3;
const hex = (palette: BuildingPaletteId, shade: number) =>
  Number.parseInt(BUILDING_PALETTES[palette][shade].slice(1), 16);

/** The shed in its street's materials: stone where the houses build in stone, else framed and plastered or boarded. */
function shedSurface(l: OpusRearWorksLayout): Surface {
  const style = REGIONAL_HOUSE_STYLES[l.spec.culture];
  return style.boarding ? "wood" : style.frame ? "plaster" : "stone";
}

function colors(l: OpusRearWorksLayout): Partial<Record<Surface, number>> {
  const style = REGIONAL_HOUSE_STYLES[l.spec.culture],
    s = l.spec.shade;
  return {
    plaster: hex(style.wall, s),
    tile: hex(style.roof, s),
    stone: hex(style.plinth, s),
    ...(style.frame ? { oak: hex(style.frame, s) } : {})
  };
}

/**
 * The shed across the back of the plot: back and end walls of `surface`, an open front on posts (or a closed front
 * with its door), a pitched roof with its ridge across the plot. Returns its ridge height.
 */
function shed(k: TradeKit, l: OpusRearWorksLayout, surface: Surface, closed: boolean) {
  const { x0, x1, z0, z1, eave } = l;
  k.box("shed-floor", [(x0 + x1) / 2, 0.03, (z0 + z1) / 2], [x1 - x0, 0.06, z1 - z0], "earth");
  k.wall("shed-back-wall", "x", x0, x1, z0 + WALL / 2, 0, eave, [], surface, WALL);
  for (const x of [x0 + WALL / 2, x1 - WALL / 2])
    k.wall("shed-end-wall", "z", z0 + WALL, z1, x, 0, eave, [], surface, WALL);
  if (closed) {
    const door = l.side < 0 ? { a: x0 + 0.35, b: x0 + 1.25 } : { a: x1 - 1.25, b: x1 - 0.35 };
    k.wall("shed-front-wall", "x", x0, x1, z1 - WALL / 2, 0, eave, [{ ...door, y0: -1, y1: 2.0 }], surface, WALL);
    k.doorLeaf(door.a, door.b, z1, 2.0, 0.9);
  } else {
    const posts = Math.max(2, Math.round((x1 - x0) / 2.6) + 1);
    for (let i = 0; i < posts; i++) {
      const x = x0 + 0.12 + ((x1 - x0 - 0.24) * i) / (posts - 1);
      k.box("shed-post", [x, eave / 2, z1 - 0.12], [0.22, eave, 0.22], "oak");
      if (k.high && i < posts - 1)
        k.beam("shed-brace", [x, eave - 0.6, z1 - 0.12], [x + 0.5, eave - 0.1, z1 - 0.12], 0.1, "oak");
    }
    k.box("shed-plate", [(x0 + x1) / 2, eave - 0.1, z1 - 0.12], [x1 - x0, 0.2, 0.22], "oak");
  }
  const roof = k.pitchedRoof({
    ridge: "x",
    along: [x0, x1],
    across: [z0, z1],
    eave,
    pitch: l.pitch,
    eaveOverhang: 0.25,
    gableOverhang: 0.15,
    courses: REGIONAL_HOUSE_STYLES[l.spec.culture].cover !== "thatch"
  });
  for (const x of [x0 + WALL / 2, x1 - WALL / 2])
    k.gable("x", x, (z0 + z1) / 2, (z1 - z0) / 2, eave, roof.rise, surface);
  return eave + roof.rise;
}

/** The shed's inner room: walls' inner faces, the hearth side and the other. */
function room(l: OpusRearWorksLayout) {
  const a = l.x0 + WALL + 0.05,
    b = l.x1 - WALL - 0.05,
    back = l.z0 + WALL + 0.05,
    front = l.z1 - 0.3;
  return { a, b, back, front, hearth: l.side < 0 ? a : b, far: l.side < 0 ? b : a, s: l.side };
}

/** Bread ovens: domed brick ovens on a plinth at the back, 1.8–2.7 m across in a commercial bakery (Warrens Yards,
 * Bury St Edmunds), two in a wide bakehouse (Mill Cotton); a kneading trough and faggots for the firing. */
function baking(k: TradeKit, l: OpusRearWorksLayout, ridge: number) {
  const r = room(l),
    span = r.b - r.a,
    depth = r.front - r.back,
    big = Math.max(1.2, Math.min(2.7, span - 0.5, depth - 1.4)),
    small = span - big >= 1.6 ? Math.min(1.4, span - big - 0.3) : 0,
    oven = (name: string, x: number, d: number) => {
      const z = r.back + d / 2 + 0.1;
      k.box(`${name}-plinth`, [x, 0.4, z], [d + 0.2, 0.8, d + 0.2], "brick");
      const dome = k.add(
        `${name}-dome`,
        new THREE.SphereGeometry(d / 2, k.high ? 14 : 8, k.high ? 7 : 4, 0, Math.PI * 2, 0, Math.PI / 2),
        "brick"
      );
      dome.scale.set(1, 0.7, 1);
      dome.position.set(x, 0.8, z);
      k.box(`${name}-mouth`, [x, 1.0, z + d / 2 + 0.06], [Math.min(0.5, d * 0.35), 0.34, 0.06], "dark");
      return z;
    };
  const bigX = r.hearth - r.s * (big / 2 + 0.1),
    bigZ = oven("bread-oven", bigX, big);
  if (small) oven("small-oven", bigX - r.s * (big / 2 + 0.2 + small / 2), small);
  k.chimneyStack(bigX, bigZ - big / 2 + 0.15, ridge + 0.4, 0.45, 0.4, "brick");
  // The kneading trough under the window side, the peel against the wall; faggots for the next firing in the yard.
  if (span - big > 1.1) k.box("kneading-trough", [r.far + r.s * 0.5, 0.75, r.front - 0.5], [0.7, 0.3, 1.2], "wood");
  else k.box("kneading-trough", [(r.a + r.b) / 2, 0.75, l.z1 + 0.6], [1.2, 0.3, 0.6], "wood");
  if (k.high)
    k.beam("oven-peel", [r.far + r.s * 0.12, 0.1, r.back + 0.2], [r.far + r.s * 0.12, 2.0, r.back + 0.6], 0.05, "wood");
  k.woodStack(
    l.side * -Math.max(0, (l.x1 - l.x0) / 2 - 0.8),
    (l.z1 + l.yard) / 2,
    Math.min(1.6, l.x1 - l.x0 - 0.6),
    0.9,
    "x"
  );
}

/** A cutler's forge and grinding: hearth, hood and stack, bellows, anvil and quench tub in the shed; the grindstone
 * in its trough in the yard. */
function cutlery(k: TradeKit, l: OpusRearWorksLayout, ridge: number) {
  const r = room(l),
    hx = r.hearth - r.s * 0.6,
    hz = r.back + 0.5;
  k.box("forge-hearth", [hx, 0.4, hz], [1.1, 0.8, 0.9], "brick");
  if (k.high) k.box("forge-fire", [hx, 0.82, hz + 0.1], [0.4, 0.04, 0.3], "ember");
  k.box("forge-hood", [hx, 1.9, hz - 0.1], [1.0, 0.8, 0.7], "plaster");
  k.chimneyStack(hx, hz - 0.15, ridge + 0.4, 0.5, 0.45, "brick");
  if (r.b - r.a > 2.4) k.bellows(hx - r.s * 1.0, hz, 0.75, r.s > 0);
  k.anvil(hx, hz + 1.3);
  k.tub(hx - r.s * 0.9, hz + 1.4, 0.25, 0.45, "water");
  // Grinding in the yard: the stone turns in its water trough on a crank.
  const gx = -l.side * Math.max(0, (l.x1 - l.x0) / 2 - 0.9),
    gz = (l.z1 + l.yard) / 2;
  k.box("grind-trough", [gx, 0.3, gz], [1.0, 0.35, 0.5], "wood");
  k.wheelOnEdge("grindstone", gx, 0.7, gz, 0.4, 0.14, "stone");
  if (k.high) k.beam("grind-crank", [gx + 0.3, 0.7, gz], [gx + 0.45, 0.95, gz], 0.04, "iron");
  if (l.x1 - l.x0 > 3) k.woodStack(gx + l.side * 1.3, (l.z1 + l.yard) / 2, 0.8, 0.35, "x");
}

/** Pewterer's and brazier's casting: a brick furnace with its crucible and bellows, stone moulds and ingots on a
 * bench, cast ware set out to cool; charcoal and a quench tub in the yard. */
function metalwares(k: TradeKit, l: OpusRearWorksLayout, ridge: number) {
  const r = room(l),
    fx = r.hearth - r.s * 0.55,
    fz = r.back + 0.55;
  k.box("casting-furnace", [fx, 0.5, fz], [0.9, 1.0, 0.9], "brick");
  k.cylinder("crucible", [fx, 1.1, fz], 0.2, 0.25, "iron", 0.25, k.high ? 12 : 6);
  if (k.high) k.cylinder("melt", [fx, 1.23, fz], 0.18, 0.02, "pewter", 0.18, 12);
  k.chimneyStack(fx, fz - 0.2, ridge + 0.4, 0.45, 0.4, "brick");
  if (r.b - r.a > 2.4) k.bellows(fx - r.s * 0.95, fz, 0.75, r.s > 0);
  const bx = (r.a + r.b) / 2 + r.s * -0.2,
    bz = r.front - 0.6,
    bw = Math.min(2.2, r.b - r.a - 0.4);
  k.trestleTable(bx, bz, bw, 0.6, 0.85);
  const count = k.high ? 5 : 3;
  for (let i = 0; i < count; i++) {
    const x = bx - bw / 2 + 0.25 + ((bw - 0.5) * i) / Math.max(1, count - 1);
    if (i % 2) k.box("stone-mould", [x, 0.92, bz], [0.3, 0.12, 0.24], "stone");
    else k.cylinder("cast-flagon", [x, 1.0, bz], 0.07, 0.28, "pewter", 0.05, k.high ? 10 : 6);
  }
  const cx = -l.side * Math.max(0, (l.x1 - l.x0) / 2 - 0.8);
  k.heap("charcoal", cx, (l.z1 + l.yard) / 2, 0.6, 0.45, 0.5, "dark");
  k.tub(cx + l.side * 1.1, (l.z1 + l.yard) / 2, 0.25, 0.45, "water");
}

/** A glazier's shop: leaded panels laid out on a whitened table, came on a rack, a small stove for the lead; glass
 * crates and cullet in the yard (the glass itself came from the forest glasshouses). */
function glazing(k: TradeKit, l: OpusRearWorksLayout, ridge: number) {
  const r = room(l),
    tw = Math.min(2.4, r.b - r.a - 0.6),
    tx = (r.a + r.b) / 2 - r.s * 0.2,
    tz = r.front - 0.8;
  k.trestleTable(tx, tz, tw, 1.0, 0.9, "white");
  const panels = k.high ? 3 : 2;
  for (let i = 0; i < panels; i++) {
    const x = tx - tw / 2 + 0.4 + ((tw - 0.8) * i) / Math.max(1, panels - 1);
    k.box("leaded-panel", [x, 0.915, tz], [0.5, 0.01, 0.7], "water");
    if (k.high) for (const dz of [-0.17, 0.17]) k.box("lead-came", [x, 0.925, tz + dz], [0.5, 0.012, 0.02], "dark");
  }
  const sx = r.hearth - r.s * 0.45,
    sz = r.back + 0.45;
  k.box("lead-stove", [sx, 0.45, sz], [0.7, 0.9, 0.6], "brick");
  k.chimneyStack(sx, sz - 0.1, ridge + 0.4, 0.35, 0.3, "brick");
  k.box("came-rack", [r.far - r.s * 0.15, 1.4, (r.back + r.front) / 2], [0.1, 1.2, 1.4], "oak");
  const cx = -l.side * Math.max(0, (l.x1 - l.x0) / 2 - 0.8),
    cz = (l.z1 + l.yard) / 2;
  k.box("glass-crate", [cx, 0.3, cz], [0.7, 0.6, 0.5], "wood");
  if (k.high) k.box("glass-crate", [cx + l.side * 0.8, 0.25, cz], [0.6, 0.5, 0.45], "wood");
  if (l.x1 - l.x0 > 3.4) k.heap("cullet", cx + l.side * 1.6, cz, 0.35, 0.2, 0.3, "water");
}

/** A tallow chandler's rendering shed: the copper on its hearth under hood and stack, a dipping frame with rows of
 * setting candles; tallow barrels in the yard. */
function chandlery(k: TradeKit, l: OpusRearWorksLayout, ridge: number) {
  const r = room(l),
    hx = r.hearth - r.s * 0.6,
    hz = r.back + 0.5;
  k.box("rendering-hearth", [hx, 0.35, hz], [1.1, 0.7, 0.9], "brick");
  k.vessel("tallow-copper", [hx, 0.7, hz], 0.38, 0.45, "copper");
  k.cylinder("tallow", [hx, 1.1, hz], 0.32, 0.02, "fat", 0.32, k.high ? 12 : 6);
  k.box("rendering-hood", [hx, 1.95, hz - 0.1], [1.0, 0.7, 0.7], "plaster");
  k.chimneyStack(hx, hz - 0.15, ridge + 0.4, 0.5, 0.45, "brick");
  // Wicks hang from broach rods laid across two trestles.
  const fx = (r.a + r.b) / 2 - r.s * 0.4,
    fw = Math.min(1.8, r.b - r.a - 1.4),
    fz = r.front - 0.7;
  if (fw > 0.6) {
    for (const x of [fx - fw / 2, fx + fw / 2]) k.box("dipping-trestle", [x, 0.8, fz], [0.1, 1.6, 0.5], "oak");
    for (const dz of k.high ? [-0.15, 0, 0.15] : [0]) {
      k.beam("candle-broach", [fx - fw / 2, 1.6, fz + dz], [fx + fw / 2, 1.6, fz + dz], 0.03, "wood", true);
      const n = k.high ? 8 : 3;
      for (let i = 0; i < n; i++)
        k.cylinder(
          "setting-candle",
          [fx - fw / 2 + 0.15 + ((fw - 0.3) * i) / (n - 1), 1.42, fz + dz],
          0.015,
          0.3,
          "fat",
          0.015,
          5
        );
    }
  }
  const bx = -l.side * Math.max(0, (l.x1 - l.x0) / 2 - 0.7),
    bz = (l.z1 + l.yard) / 2;
  k.barrel(bx, bz);
  if (k.high) k.barrel(bx + l.side * 0.75, bz);
}

/** A fishmonger's curing shed behind a Fish Row shop: herring barrels stacked at the back, the salt bin, the gutting
 * table and a rack of stockfish; brine and water tubs in the yard. */
function fishmongery(k: TradeKit, l: OpusRearWorksLayout) {
  const r = room(l),
    bz = r.back + 0.35;
  // Herring tuns laid on their sides along the back wall, a second tier on the first where the shed is wide.
  const tuns = Math.max(1, Math.min(k.high ? 4 : 3, Math.floor((r.b - r.a - 1.4) / 0.68)));
  for (let i = 0; i < tuns; i++) k.barrel(r.hearth - r.s * (0.35 + i * 0.68), bz, 0.32, 0.8, 0, Math.PI / 2);
  if (k.high && tuns > 1) k.barrel(r.hearth - r.s * 0.69, bz, 0.32, 0.8, 0.6, Math.PI / 2);
  const sx = r.far + r.s * 0.45,
    sz = r.back + 0.5;
  k.box("salt-bin", [sx, 0.4, sz], [0.8, 0.8, 0.7], "wood");
  k.box("salt", [sx, 0.81, sz], [0.68, 0.04, 0.58], "white");
  const tw = Math.min(2.0, r.b - r.a - 0.6),
    tx = (r.a + r.b) / 2,
    tz = r.front - 0.55;
  k.trestleTable(tx, tz, tw, 0.7, 0.85);
  for (let i = 0; i < (k.high ? 5 : 2); i++)
    k.blob(
      "gutted-fish",
      [tx - tw / 2 + 0.3 + ((tw - 0.6) * i) / (k.high ? 4 : 1), 0.89, tz],
      [0.07, 0.03, 0.15],
      "fish"
    );
  // Stockfish hung on a pole under the eaves, along the shed's front.
  const pw = Math.min(2.4, r.b - r.a - 0.4);
  k.beam("rack-pole", [tx - pw / 2, 2.2, l.z1 - 0.4], [tx + pw / 2, 2.2, l.z1 - 0.4], 0.06, "wood", true);
  for (let i = 0; i < (k.high ? 8 : 3); i++)
    k.box(
      "stockfish",
      [tx - pw / 2 + 0.2 + ((pw - 0.4) * i) / (k.high ? 7 : 2), 1.88, l.z1 - 0.4],
      [0.12, 0.6, 0.02],
      "fish"
    );
  const yx = -l.side * Math.max(0, (l.x1 - l.x0) / 2 - 0.7),
    yz = (l.z1 + l.yard) / 2;
  k.tub(yx, yz, 0.3, 0.45, "water");
  if (l.x1 - l.x0 > 3.4) k.barrel(yx + l.side * 0.8, yz);
}

/** A butcher's slaughter shed behind a Butcher Row shop, as in York's Shambles: a beam and windlass with sides of beef
 * hung to dress, the chopping blocks, the scalding trough; offal tubs and the water tub in the yard. */
function butchery(k: TradeKit, l: OpusRearWorksLayout) {
  const r = room(l),
    hz = r.back + 0.7,
    span = r.b - r.a;
  k.beam("hanging-beam", [r.a, 2.35, hz], [r.b, 2.35, hz], 0.16, "oak", true);
  const sides = span > 3.4 ? 2 : 1;
  for (let i = 0; i < sides; i++) {
    const x = r.hearth - r.s * (0.5 + i * 0.8);
    k.beam("gambrel", [x - 0.22, 2.2, hz], [x + 0.22, 2.2, hz], 0.04, "iron");
    k.sphere("beef-side", [x, 1.4, hz], [0.27, 0.78, 0.13], "meat");
    if (k.high) k.sphere("beef-fat-cover", [x, 1.48, hz + 0.05], [0.24, 0.66, 0.1], "fat");
  }
  k.beam("windlass-roller", [r.far + r.s * 0.2, 0.95, hz], [r.far + r.s * 0.9, 0.95, hz], 0.2, "wood", true);
  k.block(r.far + r.s * 0.6, r.front - 0.6, 0.38, 0.8);
  if (span > 2.8) k.block(r.hearth - r.s * 0.6, r.front - 0.5, 0.34, 0.78);
  if (span > 3.4) {
    const tx = (r.a + r.b) / 2;
    k.box("scalding-trough", [tx, 0.4, r.front - 0.55], [Math.min(1.6, span - 2.2), 0.5, 0.65], "wood");
    k.box("scalding-water", [tx, 0.6, r.front - 0.55], [Math.min(1.4, span - 2.4), 0.03, 0.5], "water");
  }
  if (k.high) {
    k.box("blood-gutter", [(r.a + r.b) / 2, 0.08, r.front], [span, 0.012, 0.16], "dark");
    k.box("cleaver", [r.far + r.s * 0.6, 0.82, r.front - 0.55], [0.32, 0.02, 0.12], "iron");
  }
  const yx = -l.side * Math.max(0, (l.x1 - l.x0) / 2 - 0.7),
    yz = (l.z1 + l.yard) / 2;
  k.tub(yx, yz, 0.34, 0.6, "meat");
  if (l.x1 - l.x0 > 3.4) k.tub(yx + l.side * 0.85, yz, 0.28, 0.45, "water");
}

const FITTINGS = { baking, cutlery, metalwares, glazing, chandlery, fishmongery, butchery } as const;

/** The Opus rear works of a spec (docs/plan/ce-town-trade-rear-works.md §5.2): the trade's shed and yard only. */
export function createOpusRearWorks(input: OpusRearWorksSpec, quality: TradeQuality): CityStructureMeshes {
  const l = opusRearWorksLayout(input),
    k = new TradeKit(`opus-rear-works-${l.spec.trade}-${quality}`, quality === "high", colors(l));
  // A bakehouse is closed against the weather and the fire risk; the other trades work in an open-fronted shed.
  const ridge = shed(k, l, shedSurface(l), l.spec.trade === "baking");
  k.box("yard-ground", [0, 0.02, (l.z1 + l.yard) / 2], [l.x1 - l.x0 + 0.5, 0.04, l.yard - l.z1], "earth");
  FITTINGS[l.spec.trade](k, l, ridge);
  return compactModel(k.finish());
}

const heights = new Map<string, number>();
/** Height of a rear works' model from its base (the same at Low and High), as CE saves it. */
export function opusRearWorksHeight(spec: OpusRearWorksSpec): number {
  const key = opusRearWorksSpecKey(spec);
  let result = heights.get(key);
  if (result === undefined) {
    const model = createOpusRearWorks(spec, "low");
    try {
      const box = new THREE.Box3().setFromObject(model.group, true);
      result = box.max.y - box.min.y;
    } finally {
      model.dispose();
    }
    heights.set(key, result);
  }
  return result;
}
