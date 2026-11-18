import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { compactModel } from "../compactModel";
import type { EnclosedGuildRole } from "./enclosedGuildTrades";
import type { Surface } from "./modelKit";
import {
  OPUS_GUILD_HOUSE_STUBE,
  type OpusGuildHouseSpec,
  opusGuildHouseLayout,
  opusGuildHouseSpecKey
} from "./opusGuildHouseProfiles";
import { TradeKit, type TradeQuality, WALL_THICKNESS, type WallOpening } from "./opusTradeKit";
import {
  archHead,
  archRise,
  groundShell,
  PLINTH,
  raiseStreetHouse,
  streetDoor,
  streetHouseColors,
  upperStorey
} from "./opusWorkhome";

export * from "./opusGuildHouseProfiles";

/** The portal is a little taller than a house door; its arch springs under the first floor. */
const PORTAL_HEIGHT = 2.45;
const GROUND_SILL = 1.2;
const GROUND_HEAD = 2.1;

/**
 * The guild's device on its hanging sign (Zunftzeichen), drawn flat on the board: the trade's tool or ware, as the
 * enclosed halls' emblems (enclosedGuildTrades.ts) show them.
 */
function guildDevice(k: TradeKit, role: EnclosedGuildRole, x: number, y: number, z: number) {
  const at = (dy: number, dz: number): [number, number, number] => [x + 0.03, y + dy, z + dz];
  switch (role) {
    case "textiles":
      for (const r of [0.5, -0.5]) k.box("device-shears", at(0, 0), [0.02, 0.05, 0.36], "iron").rotation.x = r;
      break;
    case "leather":
      k.box("device-hide", at(0, 0), [0.02, 0.26, 0.3], "leather");
      break;
    case "baking":
      k.box("device-loaf", at(0, 0), [0.02, 0.14, 0.32], "straw");
      break;
    case "brewing":
      k.box("device-tankard", at(0, -0.03), [0.02, 0.24, 0.2], "wood");
      k.box("device-tankard-handle", at(0, 0.11), [0.02, 0.14, 0.06], "wood");
      break;
    case "victualling":
      k.box("device-cleaver", at(0.02, 0.04), [0.02, 0.14, 0.24], "iron");
      k.box("device-cleaver-handle", at(-0.01, -0.14), [0.02, 0.05, 0.14], "wood");
      break;
    case "woodworking":
      k.box("device-square", at(0, -0.08), [0.02, 0.28, 0.05], "straw");
      k.box("device-square-foot", at(-0.12, 0.03), [0.02, 0.05, 0.24], "straw");
      break;
    case "metallurgy":
      k.box("device-anvil", at(0.07, 0), [0.02, 0.08, 0.34], "iron");
      k.box("device-anvil-waist", at(-0.03, 0), [0.02, 0.12, 0.12], "iron");
      k.box("device-anvil-base", at(-0.12, 0), [0.02, 0.06, 0.26], "iron");
      break;
    case "glassware-pottery":
      k.cylinder("device-jug", at(0, 0), 0.1, 0.26, "earth", 0.06, 6).rotation.z = Math.PI / 2;
      break;
    case "masonry":
      k.box("device-ashlar", at(0, 0), [0.02, 0.2, 0.32], "stone");
      break;
    case "book-trades":
      k.box("device-book", at(0, 0), [0.02, 0.22, 0.3], "leather");
      k.box("device-book-clasp", at(0, 0.14), [0.025, 0.05, 0.04], "brass");
      break;
  }
}

/**
 * The Opus guild house of a spec (plan §6.1 W5b): a street house with a stone ground storey, its portal and barred
 * windows, the guild's Stube above it lit by a row of close-set windows, and the guild's sign. No interior is built.
 */
export function createOpusGuildHouse(input: OpusGuildHouseSpec, quality: TradeQuality): CityStructureMeshes {
  const l = opusGuildHouseLayout(input),
    spec = l.spec,
    k = new TradeKit(`opus-guild-house-${spec.role}-${quality}`, quality === "high", streetHouseColors(l)),
    t = WALL_THICKNESS,
    stone = l.stoneGround;
  const groundSurface: Surface = stone ? "stone" : "plaster";
  // A stone portal is arched, its crown a little over the square head; a timber one keeps its lintel.
  const portalTop = stone ? PORTAL_HEIGHT + 0.25 : PORTAL_HEIGHT;
  const front: WallOpening[] = [
    { a: l.door.a, b: l.door.b, y0: -1, y1: portalTop },
    ...l.groundWindows.map(u => ({ a: u - 0.35, b: u + 0.35, y0: GROUND_SILL, y1: GROUND_HEAD }))
  ];
  groundShell(k, l, front, groundSurface);
  if (stone) archHead(k, l.door, portalTop - archRise(l.door), l.z1);
  else if (l.finish === "frame") k.framing("x", l.x0, l.x1, l.z1, 1, PLINTH, l.ground, front);
  streetDoor(k, l, portalTop);
  for (const u of l.groundWindows) {
    k.box(
      "ground-window",
      [u, (GROUND_SILL + GROUND_HEAD) / 2, l.z1 - t / 2],
      [0.7, GROUND_HEAD - GROUND_SILL, 0.04],
      "dark"
    );
    // Iron bars: the ground storey held the guild's chest and its stores.
    for (const dx of k.high ? [-0.2, 0, 0.2] : [0])
      k.box(
        "window-bar",
        [u + dx, (GROUND_SILL + GROUND_HEAD) / 2, l.z1 + 0.02],
        [0.03, GROUND_HEAD - GROUND_SILL, 0.03],
        "iron"
      );
    if (stone) k.box("window-sill", [u, GROUND_SILL - 0.05, l.z1 + 0.04], [0.86, 0.1, 0.12], "stone");
  }
  // The Stube: its row of windows across the front; a third storey has the house's own windows.
  const stube = OPUS_GUILD_HOUSE_STUBE;
  raiseStreetHouse(k, l, l.heights, (i, y0, y1, frontFace) =>
    upperStorey(
      k,
      l,
      y0,
      y1,
      frontFace,
      "plaster",
      i === 0
        ? {
            at: l.stubeWindows,
            w: stube.pane,
            h: stube.height,
            centre: stube.sill + stube.height / 2,
            cut: stube.pane,
            from: stube.sill,
            to: stube.sill + stube.height,
            shutters: false
          }
        : undefined
    )
  );
  // The guild's sign hangs beside the portal, under the Stube.
  const x = spec.mirror ? l.door.a - 0.35 : l.door.b + 0.35;
  k.signBracket(x, l.z1, l.ground - 0.15, (cx, cy, cz) => guildDevice(k, spec.role, cx, cy, cz));
  return compactModel(k.finish());
}

const heights = new Map<string, number>();
/** Height of a guild house's model from its base (the same at Low and High), as CE saves it. */
export function opusGuildHouseHeight(spec: OpusGuildHouseSpec): number {
  const key = opusGuildHouseSpecKey(spec);
  let result = heights.get(key);
  if (result === undefined) {
    const model = createOpusGuildHouse(spec, "low");
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
