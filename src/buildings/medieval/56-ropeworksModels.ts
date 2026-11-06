import { DEFAULT_AUTHOR } from "../authors";
import { variantId } from "../modelVariants";
import type { MedievalModel } from "./modelKit";
import { ModelKit } from "./modelKit";

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
    author: DEFAULT_AUTHOR,
    name: "Medieval ropewalk and hemp preparation yard",
    size: [6, 3.6, 54],
    note: "Long-rope workshop with a sheltered hemp preparation end and a straight outdoor twisting walk. Static equipment study; labor, rope output and period-specific rigging remain unverified.",
    create: () => create("low"),
    variants: (["low", "high"] as const).map(level => ({
      id: variantId(family, level, DEFAULT_AUTHOR),
      family,
      author: DEFAULT_AUTHOR,
      level,
      label: level === "low" ? "Low" : "High",
      create: () => create(level)
    }))
  }
];
