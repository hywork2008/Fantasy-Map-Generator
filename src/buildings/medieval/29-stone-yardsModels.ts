import { type MedievalModel, ModelKit } from "./modelKit";

export const models: MedievalModel[] = [
  {
    author: "Codex GPT-6.1 Sol",
    id: "masons-stone-yard",
    name: "Stone yard and mason work shelter",
    task: 29,
    size: [15, 13, 6],
    note: "Rough and squared stone stocks, a hand dressing bench, mallets, chisels, stone chips and a sheltered working bay. No industrial sawing machinery.",
    create() {
      const k = new ModelKit("masons-stone-yard");
      k.hall(-3, -2, 7, 4, 3, 1.2, { open: true, roof: "wood" });
      for (let i = 0; i < 10; i++)
        k.sphere(
          "rough-stone-stock",
          [2.5 + (i % 3) * 0.9, 0.5 + Math.floor(i / 6) * 0.6, -2 + Math.floor(i / 3) * 0.9],
          [0.6, 0.5, 0.5],
          "stone"
        );
      for (let row = 0; row < 3; row++)
        for (let i = 0; i < 4 - row; i++)
          k.box("dressed-stone", [-4 + i * 1.1, 0.25 + row * 0.5, 2.3], [1, 0.5, 0.8], "stone");
      k.table(-3, -1, 2.5, 1, 0.85);
      k.box("stone-on-bench", [-3, 1.1, -1], [1.5, 0.4, 0.7], "stone");
      k.beam("masons-mallet-handle", [-1.6, 1.2, -0.6], [-1.6, 1.2, -1.3], 0.05, "wood", true);
      k.box("mallet-head", [-1.6, 1.2, -1.3], [0.35, 0.15, 0.2], "wood");
      for (let i = 0; i < 4; i++)
        k.beam("masons-chisel", [-3.8 + i * 0.3, 1.35, -0.7], [-3.8 + i * 0.3, 1.35, -1], 0.035, "iron", true);
      for (let i = 0; i < 15; i++)
        k.sphere("stone-chip", [-1 + (i % 5) * 0.3, 0.04, 1 + Math.floor(i / 5) * 0.3], [0.08, 0.04, 0.07], "stone");
      return k.finish();
    }
  }
];
