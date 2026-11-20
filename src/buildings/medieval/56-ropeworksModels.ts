import { DEFAULT_AUTHOR } from "../authors";
import { variantId } from "../modelVariants";
import type { MedievalModel } from "./modelKit";
import { ModelKit } from "./modelKit";
import { createOpusRopewalk, OPUS_ROPEWALK } from "./opusRopewalk";
import { OPUS_ROPEWALK_LENGTHS, opusRopewalkModelId } from "./opusTradeProfiles";

const OPUS = "Claude Opus 5.5" as const;

const id = "trade-workshop.dedicated-ropewalk",
  family = `medieval.${id}`;
function create(quality: "low" | "high") {
  const high = quality === "high";
  const k = new ModelKit(`ropewalk-${quality}`);
  k.box("ropewalk-work-yard", [0, 0.05, 0], [6, 0.1, 54], "earth");
  k.box("rope-makers-shed", [-1.5, 1.5, -23], [5, 3, 7], "wood");
  k.roof(-1.5, -23, 5.8, 7.8, 3.1, 1, "tile", true);
  for (const x of [-2.8, -0.2]) {
    k.box("ropewalk-post", [x, 1.45, 0], [0.18, 2.9, 0.18], "wood");
    k.box("ropewalk-post", [x, 1.45, 23], [0.18, 2.9, 0.18], "wood");
    k.beam("ropewalk-rail", [x, 2.75, 0], [x, 2.75, 23], 0.12, "wood");
  }
  for (const z of [1.5, 6, 10.5, 15, 19.5]) {
    k.box("rope-twisting-frame", [-1.5, 1.25, z], [2.5, 0.12, 0.12], "wood");
    for (const x of [-2.6, -1.5, -0.4]) {
      k.box("twisting-spindle", [x, 1.05, z], [0.12, 1.8, 0.12], "wood");
      k.cylinder("spindle-handle", [x, 1.95, z], 0.35, 0.06, "wood");
    }
    if (high) k.beam("laid-rope", [-2.6, 0.18, z], [-0.4, 0.18, z], 0.035, "straw");
  }
  k.box("hemp-fiber-rack", [1.8, 0.8, -23], [1.1, 1.6, 3], "wood");
  for (let i = 0; i < 8; i++)
    k.beam(
      "hemp-hank",
      [1.3, 1 + (i % 4) * 0.12, -24 + Math.floor(i / 4)],
      [2.3, 1 + (i % 4) * 0.12, -24 + Math.floor(i / 4)],
      0.035,
      "straw"
    );
  if (high) for (const z of [0, 23]) k.box("end-frame-crossbar", [-1.5, 2.8, z], [2.9, 0.12, 0.12], "oak");
  return k.finish();
}
export const models: MedievalModel[] = [
  {
    id,
    task: 56,
    author: OPUS,
    name: "Medieval ropewalk and hemp preparation yard",
    size: [OPUS_ROPEWALK.width, OPUS_ROPEWALK.depth, 5.3],
    placementEnvelope: [OPUS_ROPEWALK.width, OPUS_ROPEWALK.depth],
    note: "Opus: a hand ropewalk on the edge of town, after the rope-makers' trade as written down from the late Middle Ages to the 19th century (docs/plan/opus-ropewalk.md). At the head, by the road, a boarded hemp house with bales of hemp, a hackling bench with its hackles and the combed-out tow; behind it a slight pentice over the great spinning wheel with its whirl head and over the tackle-board with its heavers. Down the fenced walk, stakes carry four yarns being spun and three strands being laid behind the grooved top on its sledge; at the foot the traveller sledge held back by stones and the yarn reel. The walk is shortened to the CE plot: real walks ran some 180 to 300 m. Low keeps every post, line and opening; High adds hackle teeth, pegs, the wheel band, frames and the rest of the yarns. The earlier Codex study remains selectable.",
    create: () => createOpusRopewalk("low"),
    variants: [
      ...(["low", "high"] as const).map(level => ({
        id: variantId(family, level, DEFAULT_AUTHOR),
        family,
        author: DEFAULT_AUTHOR,
        level,
        label: level === "low" ? "Low" : "High",
        create: () => create(level)
      })),
      ...(["low", "high"] as const).map(level => ({
        id: variantId(family, level, OPUS),
        family,
        author: OPUS,
        level,
        label: level === "low" ? "Low" : "High",
        create: () => createOpusRopewalk(level)
      }))
    ]
  },
  // The same walk built longer for CE (docs/plan/ce-outskirts-workshop-sizes.md §8.9): head and foot alike, more
  // stakes and fence between them.
  ...OPUS_ROPEWALK_LENGTHS.filter(length => length !== OPUS_ROPEWALK.depth).map((length): MedievalModel => {
    const longId = opusRopewalkModelId(length),
      longFamily = `medieval.${longId}`;
    return {
      id: longId,
      task: 56,
      author: OPUS,
      name: `Medieval ropewalk and hemp preparation yard (${length} m)`,
      size: [OPUS_ROPEWALK.width, length, 5.3],
      placementEnvelope: [OPUS_ROPEWALK.width, length],
      note: `Opus: the hand ropewalk of the 54 m model with its walk run out to ${length} m, for towns whose roads out of the gates or wall sides have the room (docs/plan/ce-outskirts-workshop-sizes.md §8.9). Hemp house, pentice, wheel, tackle-board, traveller and reel are the same; stakes stand every 6.6 m between them, the spinners at the middle stake.`,
      create: () => createOpusRopewalk("low", length),
      variants: (["low", "high"] as const).map(level => ({
        id: variantId(longFamily, level, OPUS),
        family: longFamily,
        author: OPUS,
        level,
        label: level === "low" ? "Low" : "High",
        create: () => createOpusRopewalk(level, length)
      }))
    };
  })
];
