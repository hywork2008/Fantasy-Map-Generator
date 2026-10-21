import { type MedievalModel, ModelKit } from "./modelKit";

export const models: MedievalModel[] = [
  {
    id: "fodder-trough",
    name: "Timber fodder manger",
    task: 5,
    size: [2.9, 1.2, 1.4],
    note: "Raised V-sided plank manger on trestles, with loose hay retained by a spaced rack.",
    create() {
      const k = new ModelKit("fodder-trough");
      for (const x of [-1, 1]) {
        for (const z of [-0.42, 0.42]) k.box("trestle-foot", [x, 0.025, z], [0.18, 0.05, 0.18]);
        k.beam("trestle-leg", [x, 0.05, -0.42], [x, 0.65, 0.12], 0.12);
        k.beam("trestle-leg", [x, 0.05, 0.42], [x, 0.65, -0.12], 0.12);
      }
      k.box("manger-bottom", [0, 0.55, 0], [2.6, 0.12, 0.35], "wood");
      for (const s of [-1, 1]) {
        const wall = k.box("sloping-manger-side", [0, 0.79, s * 0.3], [2.6, 0.5, 0.08], "wood");
        wall.rotation.x = s * 0.55;
      }
      for (const x of [-1.25, 1.25]) k.box("manger-end", [x, 0.8, 0], [0.08, 0.5, 0.75], "wood");
      for (let i = 0; i < 9; i++)
        k.beam("hayrack-upright", [-1.15 + i * 0.29, 0.85, -0.3], [-1.15 + i * 0.29, 1.25, -0.45], 0.04, "wood");
      k.box("hay", [0, 0.85, 0], [2.2, 0.15, 0.4], "straw");
      return k.finish();
    }
  },
  {
    id: "stone-water-trough",
    name: "Stone livestock water trough",
    task: 5,
    size: [3.1, 1.3, 0.9],
    note: "Hollow rectangular stone trough, separate base and rim, visible water, overflow notch and two supporting sleepers.",
    create() {
      const k = new ModelKit("stone-water-trough");
      for (const x of [-1, 1]) k.box("stone-sleeper", [x, 0.1, 0], [0.35, 0.2, 1.1], "stone");
      k.box("trough-bottom", [0, 0.25, 0], [2.8, 0.18, 1], "stone");
      for (const z of [-0.45, 0.45]) k.box("trough-side", [0, 0.52, z], [2.8, 0.55, 0.15], "stone");
      for (const x of [-1.32, 1.32]) k.box("trough-end", [x, 0.52, 0], [0.16, 0.55, 0.8], "stone");
      k.box("trough-water", [0, 0.6, 0], [2.46, 0.02, 0.72], "water");
      return k.finish();
    }
  }
];
