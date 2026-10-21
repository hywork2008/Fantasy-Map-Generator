import { assemblyHall } from "./civicParts";
import { type MedievalModel, ModelKit } from "./modelKit";

export const models: MedievalModel[] = [
  {
    id: "cloth-guild-hall",
    name: "Cloth merchants' guild hall",
    task: 27,
    size: [22, 15, 12],
    note: "Large cloth-trade hall with an upper assembly chamber, ground-floor inspection counters, measuring rods, folded bolts and draped cloth banners. No looms or industrial machinery.",
    create() {
      const k = assemblyHall("cloth-guild-hall", 16, 8);
      for (let i = 0; i < 4; i++) {
        const x = -5.8 + i * 3.6;
        k.table(x, 0, 2.6, 1.4, 0.9);
        for (let j = 0; j < 3; j++)
          k.box("folded-cloth-bolt", [x - 0.7 + j * 0.7, 1.05, 0], [0.6, 0.2, 1.1], j % 2 ? "cloth" : "white");
        k.beam("cloth-measuring-rod", [x - 1.1, 1.1, 0.5], [x + 1.1, 1.1, 0.5], 0.035, "wood", true);
      }
      for (const x of [-2.5, 0, 2.5]) {
        k.box("cloth-banner", [x, 5.1, 4.18], [0.9, 1.8, 0.04], x === 0 ? "white" : "cloth");
        k.box("cloth-hall-shield", [x, 6.3, 4.2], [0.7, 0.65, 0.06], "wood");
      }
      k.box("cloth-inspection-balcony", [0, 3.2, 4.8], [6, 0.18, 1.5], "stone");
      k.box("balcony-access-walk", [4.9, 3.2, 4.3], [3.8, 0.18, 0.6], "stone");
      const railing = new ModelKit("cloth-balcony-railing");
      railing.fence([-2.8, 5.4], [2.8, 5.4], 1);
      k.attach(railing.finish(), [0, 3.3, 0]);
      return k.finish();
    }
  }
];
