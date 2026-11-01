import { DEFAULT_AUTHOR } from "../authors";
import { createMedievalContainerModel } from "../props/medievalContainers";
import {
  checkedHarborCraneDimensions,
  DEFAULT_HARBOR_CRANE_DIMENSIONS,
  HARBOR_CRANE_PROFILES,
  type HarborCraneDimensions
} from "./harborCraneDimensions";
import { assembleHarborCraneParts, createHighHarborCrane, harborCranePartFactories } from "./harborCraneParts";
import { type MedievalModel, ModelKit } from "./modelKit";
import { registerHighVariants } from "./qualityVariants";

export type { HarborCraneDimensions } from "./harborCraneDimensions";

/** Rebuild the jib, mast and tackle from construction dimensions; never stretch the machine. */
export function createHarborCrane(treadwheel: boolean, dimensions?: HarborCraneDimensions) {
  const {
    reach,
    pulleyHeight: top,
    hookHeight: hook,
    showCargo
  } = checkedHarborCraneDimensions(dimensions ?? { ...DEFAULT_HARBOR_CRANE_DIMENSIONS, showCargo: true });
  const mastTop = top + 0.65;
  const k = new ModelKit(treadwheel ? "treadwheel-crane" : "hand-winch-crane");
  k.box("crane-foundation", [-0.6, 0.12, 0], [6.2, 0.24, 4], "stone");
  k.box("crane-mast", [0, (mastTop + 0.1) / 2, 0], [0.38, mastTop + 0.1, 0.38]);
  for (const z of [-1.5, 1.5]) {
    k.box("crane-sleeper", [-0.6, 0.33, z], [5.5, 0.18, 0.3]);
    k.beam("mast-diagonal", [-2.8, 0.4, z], [0, top - 0.25, 0], 0.2);
  }
  k.beam("lifting-jib", [0, mastTop, 0], [reach + 0.15, top + 0.05, 0], 0.28);
  k.beam("jib-brace", [0, top * 0.6, 0], [reach * 0.735, top + 0.2, 0], 0.2);
  k.ring("jib-pulley", [reach, top, 0], 0.23, 0.06, "wood", true);
  k.beam("hoist-rope", [reach, top - 0.05, 0], [reach, hook, 0], 0.028, "cloth", true);
  k.tube(
    "cargo-hook",
    [
      [reach, hook, 0],
      [reach - 0.2, hook - 0.22, 0],
      [reach, hook - 0.33, 0],
      [reach + 0.13, hook - 0.2, 0]
    ],
    0.04,
    "iron"
  );
  if (treadwheel) {
    for (const z of [-0.7, 0.7]) {
      k.ring("treadwheel-rim", [-1.8, 2.8, z], 1.65, 0.12, "wood", true);
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6;
        k.beam("treadwheel-spoke", [-1.8, 2.8, z], [-1.8 + Math.cos(a) * 1.58, 2.8 + Math.sin(a) * 1.58, z], 0.11);
      }
    }
    for (let i = 0; i < 32; i++) {
      const a = (i * Math.PI) / 16;
      k.beam(
        "wheel-tread",
        [-1.8 + Math.cos(a) * 1.6, 2.8 + Math.sin(a) * 1.6, -0.75],
        [-1.8 + Math.cos(a) * 1.6, 2.8 + Math.sin(a) * 1.6, 0.75],
        0.18,
        "wood"
      );
    }
    k.beam("treadwheel-axle", [-1.8, 2.8, -1], [-1.8, 2.8, 1], 0.26, "oak", true);
    for (const z of [-1, 1]) k.box("axle-bearing-post", [-1.8, 1.55, z], [0.25, 2.6, 0.25]);
  } else {
    k.beam("winch-drum", [-1.6, 1.6, -0.65], [-1.6, 1.6, 0.65], 0.5, "wood", true);
    for (const z of [-0.8, 0.8]) {
      k.box("winch-upright", [-1.6, 0.95, z], [0.18, 1.5, 0.18]);
      k.beam("winch-crank", [-1.6, 1.6, z], [-1.6, 2.1, z], 0.07, "iron");
      k.beam("crank-grip", [-1.6, 2.1, z], [-1.6, 2.1, z + Math.sign(z) * 0.3], 0.08, "wood", true);
    }
  }
  k.beam("rope-to-jib", [-1.8, treadwheel ? 2.8 : 1.6, 0], [0, mastTop - 0.1, 0], 0.025, "cloth", true);
  k.beam("jib-running-rope", [0, mastTop - 0.1, 0], [reach, top + 0.15, 0], 0.025, "cloth", true);
  if (showCargo) k.attach(createMedievalContainerModel("crate", "closed"), [reach - 0.05, 0, 0]);
  return k.finish();
}
export const models: MedievalModel[] = [
  {
    author: "Codex GPT-6.1 Sol",
    id: "harbor-treadwheel-crane",
    name: "Timber harbor treadwheel crane",
    task: 35,
    size: [15, 7, 10],
    note: "Human-powered timber treadwheel, paired rims and treads, bearing posts, braced rotating mast, lifting jib, pulley, rope and cargo hook. An illustrative late medieval European harbor crane.",
    create: () => createHarborCrane(true)
  },
  {
    author: "Codex GPT-6.1 Sol",
    id: "harbor-winch-crane",
    name: "Hand-winch loading crane",
    task: 35,
    size: [15, 7, 10],
    note: "Smaller hand-winch harbor crane with drum, twin cranks, braced mast and lifting tackle. A regional alternative to a treadwheel; no quay is included.",
    create: () => createHarborCrane(false)
  }
];

registerHighVariants(models, {
  "harbor-treadwheel-crane": () => createHighHarborCrane(true),
  "harbor-winch-crane": () => createHighHarborCrane(false)
});
for (const model of models) {
  model.partPresets = [
    { id: "study", name: "Compact study" },
    { id: "ce-quay", name: "CE cargo-quay dimensions" }
  ];
  model.parts = (variantId, preset) => {
    const treadwheel = model.id === "harbor-treadwheel-crane";
    const dimensions =
      preset === "ce-quay"
        ? { ...HARBOR_CRANE_PROFILES[treadwheel ? "treadwheel" : "derrick"], showCargo: false }
        : undefined;
    return model.variants?.find(v => v.id === variantId)?.level === "high"
      ? harborCranePartFactories(treadwheel, dimensions)
      : [
          {
            id: `${model.id}:legacy`,
            role: "legacy-assembly",
            quality: "low",
            author: DEFAULT_AUTHOR,
            create: () => createHarborCrane(treadwheel, dimensions)
          }
        ];
  };
  model.assembleParts = parts => assembleHarborCraneParts(model.id, parts);
}
