import { type MedievalModel, ModelKit } from "./modelKit";

export const models: MedievalModel[] = [
  {
    author: "Codex GPT-6.1 Sol",
    id: "farm-barn",
    name: "Timber farm barn",
    task: 3,
    size: [11, 10, 7],
    note: "Timber-framed barn with broad double doors, weatherboard walls, a shingled roof, hay bales and stacked grain sheaves. Illustrative northern European form.",
    create() {
      const k = new ModelKit("farm-barn");
      k.hall(0, -1, 9, 6, 3.6, 2, { wall: "wood", roof: "wood", door: 3 });
      for (let i = 0; i < 4; i++) {
        k.sphere("hay-bundle", [-3 + i * 0.7, 0.4, 3.2], [0.32, 0.4, 0.3], "straw");
        k.ring("bundle-binding", [-3 + i * 0.7, 0.42, 3.2], 0.3, 0.025, "cloth");
      }
      k.box("stacked-planks", [2.5, 0.22, 3.3], [2, 0.44, 0.8], "wood");
      return k.finish();
    }
  },
  {
    author: "Codex GPT-6.1 Sol",
    id: "threshing-barn",
    name: "Threshing barn and work floor",
    task: 3,
    size: [15, 13, 8],
    note: "Large double-door threshing barn. Planked threshing apron, sheaves, separated grain and a hand flail; a working space rather than a granary.",
    create() {
      const k = new ModelKit("threshing-barn");
      k.hall(0, -1, 12, 8, 4, 2.5, { wall: "wood", roof: "thatch", door: 3.5 });
      k.box("threshing-floor", [0, 0.065, 4.5], [7, 0.13, 2.8], "wood");
      for (let i = 0; i < 10; i++)
        k.beam("unthreshed-sheaf", [-2 + i * 0.18, 0.15, 4], [-2.2 + i * 0.18, 0.65, 4.8], 0.12, "straw", true);
      k.sphere("grain-pile", [1.2, 0.23, 4.5], [0.7, 0.1, 0.5], "straw");
      k.beam("flail-handle", [-0.5, 0.2, 4.5], [0.8, 0.2, 5.1], 0.055, "wood", true);
      k.beam("flail-beater", [0.8, 0.2, 5.1], [1.4, 0.2, 4.7], 0.08, "wood", true);
      return k.finish();
    }
  },
  {
    author: "Codex GPT-6.1 Sol",
    id: "hay-shelter",
    name: "Open hay shelter",
    task: 3,
    size: [8, 8, 6],
    note: "Open-sided braced timber shelter with a raised drying deck and loose hay protected by a steep thatched roof.",
    create() {
      const k = new ModelKit("hay-shelter");
      k.hall(0, 0, 6, 5, 3, 2, { open: true, roof: "thatch" });
      k.box("raised-drying-deck", [0, 0.38, 0], [5.6, 0.18, 4.6], "wood");
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 2; j++) k.sphere("loose-hay", [-1.7 + i * 1.7, 1.15, -1 + j * 2], [1, 0.7, 1.1], "straw");
      return k.finish();
    }
  }
];
