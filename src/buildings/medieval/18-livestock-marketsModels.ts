import { type MedievalModel, ModelKit } from "./modelKit";

export const models: MedievalModel[] = [
  {
    author: "Codex GPT-6.1 Sol",
    id: "livestock-market-pens",
    name: "Divided livestock market pens",
    task: 18,
    size: [15, 12, 4],
    note: "Four timber sale pens with an open central buyers' passage, separate hinged gates, shelter and a shared water trough. No livestock figures are included.",
    create() {
      const k = new ModelKit("livestock-market-pens");
      k.fence([-6, -4], [6, -4], 1.5);
      k.fence([-6, -4], [-6, 4], 1.5);
      k.fence([6, -4], [6, 4], 1.5);
      for (const x of [-6, -1.2, 1.2, 6]) k.fence([x, 0], [x, 4], 1.5);
      for (const a of [-6, 1.2]) {
        k.fence([a, 0], [a + 4.8, 0], 1.5);
        k.fence([a, 4], [a + 1.2, 4], 1.5);
        k.fence([a + 2.6, 4], [a + 4.8, 4], 1.5);
        k.beam("pen-gate-top", [a + 1.2, 1.1, 4], [a + 2.6, 1.1, 4], 0.09, "wood");
        k.beam("gate-brace", [a + 1.2, 0.3, 4], [a + 2.6, 1.1, 4], 0.09);
      }
      k.hall(0, -2.5, 9, 2.5, 2.4, 0.8, { open: true, roof: "wood" });
      k.vessel("stock-water-trough", [4, -0, -2], 0.8, 0.6, "wood", true);
      return k.finish();
    }
  }
];
