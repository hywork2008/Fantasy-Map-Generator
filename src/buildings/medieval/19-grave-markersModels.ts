import { type MedievalModel, ModelKit } from "./modelKit";

export const models: MedievalModel[] = [
  {
    author: "Codex GPT-6.1 Sol",
    id: "plain-stone-grave-marker",
    name: "Plain stone grave marker",
    task: 19,
    size: [1.4, 1.9, 1.8],
    note: "Simple uninscribed stone marker on a low grave mound; no modern standardized cemetery lettering.",
    create() {
      const k = new ModelKit("plain-stone-grave-marker");
      k.box("grave-mound", [0, 0.05, 0.2], [0.9, 0.1, 1.6], "earth");
      k.box("stone-marker-base", [0, 0.12, -0.5], [0.7, 0.24, 0.4], "stone");
      k.box("upright-marker", [0, 0.8, -0.5], [0.6, 1.35, 0.16], "stone");
      k.sphere("rounded-marker-top", [0, 1.45, -0.5], [0.3, 0.2, 0.08], "stone");
      return k.finish();
    }
  },
  {
    author: "Codex GPT-6.1 Sol",
    id: "wooden-grave-cross",
    name: "Wooden grave cross",
    task: 19,
    size: [1.4, 2, 2],
    note: "Rough timber cross and a small unadorned earthen grave. A simple regional Christian churchyard marker.",
    create() {
      const k = new ModelKit("wooden-grave-cross");
      k.box("earthen-grave", [0, 0.06, 0.25], [0.8, 0.12, 1.6], "earth");
      k.box("cross-upright", [0, 0.9, -0.5], [0.13, 1.8, 0.11], "wood");
      k.box("cross-arm", [0, 1.4, -0.5], [0.9, 0.12, 0.11], "wood");
      k.cylinder("cross-peg", [0, 1.4, -0.43], 0.035, 0.07, "oak");
      return k.finish();
    }
  },
  {
    author: "Codex GPT-6.1 Sol",
    id: "churchyard-slabs",
    name: "Churchyard ledger slabs and markers",
    task: 19,
    size: [7, 6, 2],
    note: "Small churchyard ensemble with low ledger slabs, a footstone and simple upright markers; varying forms avoid a uniform modern burial grid.",
    create() {
      const k = new ModelKit("churchyard-slabs");
      for (let i = 0; i < 3; i++) {
        k.box("ledger-slab", [-2 + i * 2, 0.1, 0], [1.2, 0.2, 2.1], "stone");
        k.box("headstone", [-2 + i * 2, 0.7, -1], [0.65, 1.4, 0.18], "stone");
        k.box("footstone", [-2 + i * 2, 0.2, 1], [0.45, 0.4, 0.15], "stone");
        k.beam("incised-cross-long", [-2 + i * 2, 0.205, -0.4], [-2 + i * 2, 0.205, 0.4], 0.025, "dark");
        k.beam("incised-cross-arm", [-2.25 + i * 2, 0.205, 0], [-1.75 + i * 2, 0.205, 0], 0.025, "dark");
      }
      return k.finish();
    }
  }
];
