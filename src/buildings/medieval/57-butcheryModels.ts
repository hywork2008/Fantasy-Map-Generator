import { DEFAULT_AUTHOR } from "../authors";
import { variantId } from "../modelVariants";
import type { MedievalModel } from "./modelKit";
import { ModelKit } from "./modelKit";

const id = "trade-workshop.dedicated-butchery",
  family = `medieval.${id}`;
function create(quality: "low" | "high") {
  const high = quality === "high";
  const k = new ModelKit(`butchery-${quality}`);
  k.box("butchery-yard", [0, 0.06, 0], [16, 0.12, 13], "stone");
  k.box("butchery-hall", [-2, 1.75, -1], [8, 3.5, 7], "stone");
  for (const side of [-1, 1]) k.roof(-2 + side * 1.9, -1, 4.4, 7.8, 3.5, 1.2, "tile", true);
  k.box("open-front-counter", [-2, 1.1, 2.65], [4.8, 1.1, 0.55], "wood");
  k.box("cutting-block", [-3.1, 0.65, -0.3], [1.2, 0.65, 0.9], "oak");
  k.box("cutting-block", [-0.8, 0.65, -0.3], [1.2, 0.65, 0.9], "oak");
  for (const x of [-4.5, 0.4]) k.beam("meat-hook-rail", [x, 2.65, -3.4], [x, 2.65, 1.7], 0.08, "oak");
  for (const z of [-2.8, -1.7, -0.6, 0.5, 1.3]) {
    k.beam("butchery-hook", [-4.5, 2.6, z], [-4.5, 2.25, z], 0.035, "iron");
    k.beam("butchery-hook", [0.4, 2.6, z], [0.4, 2.25, z], 0.035, "iron");
  }
  k.box("covered-offal-bin", [4.9, 0.55, -2.5], [1.6, 1.1, 1.8], "wood");
  k.box("wash-trough", [5, 0.35, 1], [3, 0.7, 1], "stone");
  k.box("wash-water", [5, 0.72, 1], [2.7, 0.03, 0.7], "water");
  if (high) {
    for (const x of [-5.8, 1.8]) k.box("yard-boundary-post", [x, 1, 4.8], [0.15, 2, 0.15], "oak");
    for (let i = 0; i < 6; i++)
      k.box("front-mortar-course", [-5.9 + i * 1.55, 0.55 + (i % 2) * 0.42, 2.77], [0.018, 0.018, 0.01], "white");
  }
  return k.finish();
}
export const models: MedievalModel[] = [
  {
    id,
    task: 57,
    author: DEFAULT_AUTHOR,
    name: "Medieval butcher hall and washing yard",
    size: [16, 4.2, 13],
    note: "Street-front meat counter, hanging rails, cutting blocks, wash trough and separated covered offal storage. Static spatial study; slaughter supply, drainage, hygiene and throughput remain unverified.",
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
