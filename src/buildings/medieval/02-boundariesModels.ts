import { type MedievalModel, ModelKit } from "./modelKit";

export const models: MedievalModel[] = [
  {
    author: "Codex GPT-6.1 Sol",
    id: "timber-fence",
    name: "Timber rail fence",
    task: 2,
    size: [4.3, 0.4, 1.5],
    note: "Split oak posts and two continuous rails, for a garden or livestock boundary. Illustrative medieval European construction.",
    create() {
      const k = new ModelKit("timber-fence");
      k.fence([-2, 0], [2, 0], 1.4);
      return k.finish();
    }
  },
  {
    author: "Codex GPT-6.1 Sol",
    id: "wattle-fence",
    name: "Woven wattle fence",
    task: 2,
    size: [4.2, 0.3, 1.5],
    note: "Hazel or willow rods woven alternately around upright stakes; open weave and separate uprights.",
    create() {
      const k = new ModelKit("wattle-fence");
      k.fence([-2, 0], [2, 0], 1.35, true);
      return k.finish();
    }
  },
  {
    author: "Codex GPT-6.1 Sol",
    id: "simple-timber-gate",
    name: "Braced timber wicket gate",
    task: 2,
    size: [2.5, 0.5, 1.8],
    note: "Five spaced boards, ledges, a diagonal compression brace, iron strap hinges and a wooden latch. Gate shown closed.",
    create() {
      const k = new ModelKit("simple-timber-gate");
      for (const x of [-1.1, 1.1]) k.box("gate-post", [x, 0.85, 0], [0.18, 1.7, 0.18]);
      for (let i = 0; i < 5; i++) k.box("gate-board", [-0.8 + i * 0.4, 0.78, 0], [0.27, 1.3, 0.06], "wood");
      for (const y of [0.3, 1.2]) {
        k.box("gate-ledge", [0, y, -0.065], [2, 0.12, 0.09]);
        k.box("strap-hinge", [-0.83, y, 0.07], [0.55, 0.055, 0.04], "iron");
      }
      k.beam("gate-diagonal", [-0.95, 0.3, -0.09], [0.95, 1.2, -0.09], 0.1);
      k.box("wooden-latch", [0.92, 0.95, 0.1], [0.4, 0.07, 0.07], "dark");
      return k.finish();
    }
  }
];
