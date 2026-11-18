import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { compactModel } from "../compactModel";
import type { Position } from "./modelKit";
import { TradeKit, type TradeQuality } from "./opusTradeKit";

import { OPUS_ROPEWALK } from "./opusTradeProfiles";

export { OPUS_ROPEWALK };

const HALF_W = OPUS_ROPEWALK.width / 2,
  HALF_D = OPUS_ROPEWALK.depth / 2;
/** The hemp house: walls x ±HOUSE_X, z HOUSE_BACK (toward the walk) to HOUSE_FRONT (the road). */
const HOUSE_X = 2.5,
  HOUSE_BACK = 21,
  HOUSE_FRONT = 26.4,
  HOUSE_EAVE = 2.4,
  HOUSE_PITCH = 45;
/** The pentice over the wheel and the tackle-board, from the house's back wall out to its posts. */
const PENTICE_TO = 18.4;
/** The two lanes of the walk: yarn is spun on the left, strands laid into rope on the right (seen from the head). */
const SPIN_X = -1.25,
  LAY_X = 1.25;
/** Heads of the stakes that carry the yarns off the ground down the walk, and their height. */
const STAKES = [15, 8.4, 1.8, -4.8, -11.4, -18] as const,
  STAKE_Y = 1.25;
/** Where the spinners have walked back to, and the yarns are made fast on a stake for now. */
const SPUN_TO = -4.8;
/** The laying top on its sledge, and the traveller sledge at the foot of the walk. */
const TOP_Z = -9,
  SLEDGE_Z = -23.2;

function hempHouse(k: TradeKit) {
  const x0 = -HOUSE_X,
    x1 = HOUSE_X,
    z0 = HOUSE_BACK,
    z1 = HOUSE_FRONT,
    door = OPUS_ROPEWALK.entrance.clearWidth / 2;
  k.box("house-floor", [0, 0.04, (z0 + z1) / 2], [x1 - x0, 0.08, z1 - z0], "earth");
  // Boarded walls on a stone sill; a door on the road, a wide opening onto the walk for the hemp and the wheel.
  for (const x of [x0 + 0.09, x1 - 0.09]) {
    k.box("sill-wall", [x, 0.15, (z0 + z1) / 2], [0.3, 0.3, z1 - z0], "stone");
    k.wall("boarded-wall", "z", z0, z1, x, 0.3, HOUSE_EAVE, [], "wood");
  }
  k.wall("boarded-wall", "x", x0, x1, z1 - 0.09, 0, HOUSE_EAVE, [{ a: -door, b: door, y0: -1, y1: 2.1 }], "wood");
  k.wall("boarded-wall", "x", x0, x1, z0 + 0.09, 0, HOUSE_EAVE, [{ a: -1.6, b: 1.6, y0: -1, y1: 2.1 }], "wood");
  k.doorLeaf(-door, door, z1, 2.1, 1.1);
  const roof = k.pitchedRoof({
    ridge: "z",
    along: [z0, z1],
    across: [x0, x1],
    eave: HOUSE_EAVE,
    pitch: HOUSE_PITCH,
    eaveOverhang: 0.3,
    gableOverhang: 0.25
  });
  for (const z of [z0 + 0.09, z1 - 0.09]) {
    k.gable("z", z, 0, HOUSE_X, HOUSE_EAVE, roof.rise, "wood");
    k.gableFrame("z", z, z > (z0 + z1) / 2 ? 1 : -1, 0, HOUSE_X, HOUSE_EAVE, roof.rise);
  }
  // Inside: bales of dressed hemp along one wall, the hackling bench under the light of the walk's opening, the tow
  // combed out of the hemp heaped beside it.
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < (i < 2 ? 2 : 1); j++)
      k.box("hemp-bale", [x1 - 0.65, 0.35 + j * 0.62, z1 - 0.9 - i * 1.15], [0.95, 0.6, 1.05], "straw");
  k.box("hackling-bench", [x0 + 0.55, 0.62, z0 + 1.6], [0.45, 0.08, 2.2], "oak");
  for (const z of [z0 + 0.7, z0 + 2.5]) k.box("bench-leg", [x0 + 0.55, 0.29, z], [0.4, 0.58, 0.1], "oak");
  for (const z of [z0 + 1.1, z0 + 2.1]) {
    k.box("hackle-board", [x0 + 0.55, 0.7, z], [0.3, 0.06, 0.4], "oak");
    if (k.high)
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 3; j++)
          k.beam(
            "hackle-tooth",
            [x0 + 0.45 + j * 0.1, 0.73, z - 0.15 + i * 0.1],
            [x0 + 0.45 + j * 0.1, 0.86, z - 0.15 + i * 0.1],
            0.012,
            "iron"
          );
  }
  k.heap("tow-heap", x0 + 1.25, z0 + 3.4, 0.45, 0.3, 0.4, "straw");
  if (k.high) {
    // Hanks of hackled hemp hung to hand on a pole.
    k.beam("hank-pole", [x0 + 0.25, 1.75, z0 + 3.3], [x0 + 0.25, 1.75, z1 - 0.5], 0.06, "wood", true);
    for (let i = 0; i < 5; i++) k.box("hemp-hank", [x0 + 0.25, 1.4, z0 + 3.6 + i * 0.32], [0.07, 0.65, 0.12], "straw");
  }
}

/** The slight roof over the head of the walk, on two posts, sloping from the house's back wall. */
function pentice(k: TradeKit) {
  k.leanTo("pentice-roof", "x", -HOUSE_X - 0.2, HOUSE_X + 0.2, HOUSE_BACK, PENTICE_TO - 0.2, HOUSE_EAVE, 2.05);
  for (const x of [-HOUSE_X + 0.1, HOUSE_X - 0.1]) {
    k.box("pentice-post", [x, 1.0, PENTICE_TO], [0.18, 2.0, 0.18], "oak");
    if (k.high) k.beam("pentice-brace", [x, 1.55, PENTICE_TO], [x, 1.98, PENTICE_TO + 0.55], 0.1, "oak");
  }
  k.box("pentice-plate", [0, 2.02, PENTICE_TO], [2 * HOUSE_X, 0.16, 0.18], "oak");
}

/** Whirl hook ends on the spinning lane: four yarns are spun at once. */
const whirls = [SPIN_X - 0.45, SPIN_X - 0.15, SPIN_X + 0.15, SPIN_X + 0.45];
const WHIRL_Y = 1.25,
  WHIRL_Z = 19.05;

/**
 * The spinning wheel at the head of the spinning lane: a great wheel in its standards, turned by a crank, and the
 * whirl head before it whose hooks the band turns; the spinners hook their hemp on and walk backwards down the walk.
 */
function spinningWheel(k: TradeKit) {
  const z = 20.15,
    y = 1.05,
    r = 0.85;
  for (const dx of [-0.2, 0.2]) {
    k.beam("wheel-standard", [SPIN_X + dx, 0.07, z - 0.45], [SPIN_X + dx, y + 0.1, z], 0.1, "oak");
    k.beam("wheel-standard", [SPIN_X + dx, 0.07, z + 0.45], [SPIN_X + dx, y + 0.1, z], 0.1, "oak");
  }
  k.box("wheel-sole", [SPIN_X, 0.05, z], [0.55, 0.1, 1.1], "oak");
  k.ring("great-wheel-rim", [SPIN_X, y, z], r, 0.045, "wood", true).rotation.y = Math.PI / 2;
  k.cylinder("wheel-axle", [SPIN_X, y, z], 0.06, 0.6, "iron").rotation.z = Math.PI / 2;
  for (let i = 0; i < (k.high ? 8 : 4); i++) {
    const a = (i * Math.PI) / (k.high ? 8 : 4);
    k.beam(
      "wheel-spoke",
      [SPIN_X, y - Math.sin(a) * r, z - Math.cos(a) * r],
      [SPIN_X, y + Math.sin(a) * r, z + Math.cos(a) * r],
      0.045,
      "wood"
    );
  }
  k.beam("wheel-crank", [SPIN_X + 0.3, y, z], [SPIN_X + 0.3, y + 0.35, z], 0.05, "iron");
  k.beam("crank-handle", [SPIN_X + 0.3, y + 0.35, z], [SPIN_X + 0.55, y + 0.35, z], 0.05, "wood", true);
  // The whirl head: a board on two posts, the whirls through it, their hooks toward the walk.
  for (const x of [SPIN_X - 0.75, SPIN_X + 0.75])
    k.box("whirl-head-post", [x, 0.75, WHIRL_Z + 0.1], [0.14, 1.5, 0.14], "oak");
  k.box("whirl-head-board", [SPIN_X, WHIRL_Y, WHIRL_Z + 0.1], [1.65, 0.3, 0.08], "oak");
  for (const x of whirls) {
    k.cylinder("whirl", [x, WHIRL_Y, WHIRL_Z + 0.25], 0.06, 0.22, "wood", 0.06, k.high ? 10 : 6).rotation.x =
      Math.PI / 2;
    k.beam("whirl-hook", [x, WHIRL_Y, WHIRL_Z + 0.05], [x, WHIRL_Y, WHIRL_Z - 0.12], 0.025, "iron");
  }
  if (k.high) {
    // The band from the rim round the whirls.
    k.beam("wheel-band", [SPIN_X, y + r, z], [SPIN_X - 0.45, WHIRL_Y + 0.06, WHIRL_Z + 0.36], 0.02, "cloth");
    k.beam("wheel-band", [SPIN_X, y - r, z], [SPIN_X + 0.45, WHIRL_Y - 0.06, WHIRL_Z + 0.36], 0.02, "cloth");
  }
}

/** Hooks of the tackle-board on the laying lane: three strands are laid into a rope. */
const heavers = [LAY_X - 0.3, LAY_X, LAY_X + 0.3];
const BOARD_Y = 1.1,
  BOARD_Z = 19.05;

/** The tackle-board (breast-board) at the head of the laying lane: an oak plank on strong braced posts, the strands'
 * hooks through it turned by iron cranks (heavers). */
function tackleBoard(k: TradeKit) {
  for (const x of [LAY_X - 0.8, LAY_X + 0.8]) {
    k.box("tackle-post", [x, 0.8, BOARD_Z], [0.2, 1.6, 0.2], "oak");
    k.beam("tackle-strut", [x, 1.2, BOARD_Z + 0.05], [x, 0.09, BOARD_Z + 1.0], 0.13, "oak");
  }
  k.box("breast-board", [LAY_X, BOARD_Y, BOARD_Z], [1.9, 0.36, 0.12], "oak");
  for (const x of heavers) {
    k.beam("heaver-hook", [x, BOARD_Y, BOARD_Z - 0.06], [x, BOARD_Y, BOARD_Z - 0.25], 0.03, "iron");
    k.beam("heaver-crank", [x, BOARD_Y, BOARD_Z + 0.06], [x, BOARD_Y, BOARD_Z + 0.3], 0.03, "iron");
    k.beam("heaver-arm", [x, BOARD_Y, BOARD_Z + 0.3], [x, BOARD_Y + 0.28, BOARD_Z + 0.3], 0.03, "iron");
  }
}

/** The stakes down the walk: a post with a cross-head over both lanes, pegs in it parting the yarns and strands. */
function stakes(k: TradeKit) {
  for (const z of STAKES) {
    k.box("stake-post", [0, STAKE_Y / 2, z], [0.14, STAKE_Y, 0.14], "oak");
    k.box("stake-head", [0, STAKE_Y + 0.04, z], [3.6, 0.08, 0.1], "oak");
    if (k.high)
      for (const x of [...whirls, ...heavers].flatMap(x => [x - 0.08, x + 0.08]))
        k.beam("stake-peg", [x, STAKE_Y + 0.08, z], [x, STAKE_Y + 0.22, z], 0.02, "wood");
  }
}

/** A line laid over the stakes from `from` (z) down to `to` (z), at lane position `x`. */
function overStakes(k: TradeKit, name: string, x: number, y0: number, from: number, to: number, width: number) {
  const points: Position[] = [[x, y0, from]];
  for (const z of STAKES) if (z < from && z > to) points.push([x, STAKE_Y + 0.1, z]);
  points.push([x, STAKE_Y + 0.1, to]);
  for (let i = 1; i < points.length; i++) k.beam(name, points[i - 1], points[i], width, "straw", k.high);
}

/** The work in hand: yarns spun down the spinning lane, strands being laid into rope down the laying lane. */
function work(k: TradeKit) {
  for (const x of k.high ? whirls : [whirls[0], whirls[3]])
    overStakes(k, "spun-yarn", x, WHIRL_Y, WHIRL_Z - 0.12, SPUN_TO, 0.012);
  // The strands run from the heavers to the top, which the layer holds back as the rope closes behind it.
  for (const x of heavers) overStakes(k, "rope-strand", x, BOARD_Y, BOARD_Z - 0.25, TOP_Z + 0.4, 0.03);
  k.cylinder("laying-top", [LAY_X, STAKE_Y + 0.1, TOP_Z + 0.15], 0.17, 0.4, "wood", 0.07, k.high ? 12 : 6).rotation.x =
    -Math.PI / 2;
  if (k.high)
    for (const a of [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3])
      k.beam(
        "top-score",
        [LAY_X + Math.cos(a) * 0.16, STAKE_Y + 0.1 + Math.sin(a) * 0.16, TOP_Z + 0.35],
        [LAY_X + Math.cos(a) * 0.07, STAKE_Y + 0.1 + Math.sin(a) * 0.07, TOP_Z - 0.05],
        0.02,
        "dark"
      );
  k.beam("top-staff", [LAY_X, STAKE_Y + 0.1, TOP_Z], [LAY_X + 0.9, 0.95, TOP_Z - 0.6], 0.05, "wood", true);
  // The top's own small sledge, on which it rides down the walk.
  k.box("top-sledge", [LAY_X, 0.12, TOP_Z - 0.4], [0.9, 0.12, 1.3], "oak");
  for (const x of [LAY_X - 0.35, LAY_X + 0.35]) {
    k.box("sledge-runner", [x, 0.05, TOP_Z - 0.4], [0.1, 0.1, 1.5], "oak");
    // The frame the top rests in, at the height of the strands.
    k.box("top-frame", [x, (0.18 + STAKE_Y) / 2, TOP_Z + 0.15], [0.1, STAKE_Y - 0.18, 0.1], "oak");
  }
  k.box("top-frame-bar", [LAY_X, STAKE_Y - 0.06, TOP_Z + 0.15], [0.8, 0.1, 0.1], "oak");
  // The laid rope from the top to the traveller at the foot.
  overStakes(k, "laid-rope", LAY_X, STAKE_Y + 0.1, TOP_Z - 0.05, SLEDGE_Z + 0.9, 0.06);
  k.beam("laid-rope", [LAY_X, STAKE_Y + 0.1, SLEDGE_Z + 0.9], [LAY_X, 0.85, SLEDGE_Z + 0.45], 0.06, "straw", k.high);
}

/** The traveller at the foot of the laying lane: a sledge with its own breast-board and one turning hook, held back
 * by stones as the rope shortens in the laying. The yarn reel stands beside the spinning lane. */
function foot(k: TradeKit) {
  for (const x of [LAY_X - 0.55, LAY_X + 0.55])
    k.box("traveller-runner", [x, 0.09, SLEDGE_Z - 0.3], [0.16, 0.18, 2.2], "oak");
  k.box("traveller-bed", [LAY_X, 0.24, SLEDGE_Z - 0.4], [1.3, 0.12, 1.8], "oak");
  k.box("traveller-board", [LAY_X, 0.65, SLEDGE_Z + 0.4], [1.2, 0.7, 0.14], "oak");
  for (const x of [LAY_X - 0.5, LAY_X + 0.5])
    k.beam("traveller-strut", [x, 0.95, SLEDGE_Z + 0.35], [x, 0.3, SLEDGE_Z - 0.4], 0.1, "oak");
  k.beam("traveller-hook", [LAY_X, 0.85, SLEDGE_Z + 0.48], [LAY_X, 0.85, SLEDGE_Z + 0.62], 0.035, "iron");
  for (const [dx, dz] of [
    [-0.3, -0.7],
    [0.3, -0.75],
    [0, -1.1]
  ] as const)
    k.box("weight-stone", [LAY_X + dx, 0.48, SLEDGE_Z + dz], [0.45, 0.36, 0.35], "stone");
  // The reel the finished yarn is wound off onto, in its frame.
  const rz = SLEDGE_Z + 0.4,
    ry = 0.95;
  for (const z of [rz - 0.55, rz + 0.55]) {
    k.beam("reel-standard", [SPIN_X, 0.06, z - 0.3], [SPIN_X, ry, z], 0.09, "oak");
    k.beam("reel-standard", [SPIN_X, 0.06, z + 0.3], [SPIN_X, ry, z], 0.09, "oak");
  }
  k.beam("reel-axle", [SPIN_X, ry, rz - 0.6], [SPIN_X, ry, rz + 0.6], 0.06, "wood", true);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 4;
    k.beam(
      "reel-arm",
      [SPIN_X - Math.cos(a) * 0.55, ry - Math.sin(a) * 0.55, rz],
      [SPIN_X + Math.cos(a) * 0.55, ry + Math.sin(a) * 0.55, rz],
      0.05,
      "wood"
    );
  }
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    k.beam(
      "reel-bar",
      [SPIN_X + Math.cos(a) * 0.55, ry + Math.sin(a) * 0.55, rz - 0.45],
      [SPIN_X + Math.cos(a) * 0.55, ry + Math.sin(a) * 0.55, rz + 0.45],
      0.04,
      i % 2 && k.high ? "straw" : "wood"
    );
  }
}

/** The ground: a beaten walk between rails fencing it off its fields (the walk is an enclosed slip of ground). */
function ground(k: TradeKit) {
  k.box("walk-ground", [0, 0.02, -2.6], [2 * HALF_W - 0.4, 0.04, 2 * HALF_D - 5.6], "earth");
  for (const x of [-HALF_W + 0.12, HALF_W - 0.12]) {
    // From the foot of the walk to the hemp house.
    const from = -HALF_D + 0.12,
      to = HOUSE_BACK;
    for (const y of k.high ? [0.45, 0.95] : [0.8])
      k.box("fence-rail", [x, y, (from + to) / 2], [0.07, 0.08, to - from], "wood");
    for (let z = -HALF_D + 0.12; z <= HOUSE_BACK - 2.6; z += 4.4)
      k.box("fence-post", [x, 0.55, z], [0.12, 1.1, 0.12], "oak");
  }
  // The foot of the walk is fenced across.
  k.box("fence-rail", [0, 0.8, -HALF_D + 0.12], [2 * HALF_W - 0.24, 0.08, 0.07], "wood");
}

/** The Opus ropewalk at Low or High. Low and High share every envelope, post and line position. */
export function createOpusRopewalk(quality: TradeQuality): CityStructureMeshes {
  const k = new TradeKit(`opus-ropewalk-${quality}`, quality === "high");
  ground(k);
  hempHouse(k);
  pentice(k);
  spinningWheel(k);
  tackleBoard(k);
  stakes(k);
  work(k);
  foot(k);
  return compactModel(k.finish());
}
