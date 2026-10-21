import { createMedievalContainerModel } from "../props/medievalContainers";
import { type MedievalModel, ModelKit } from "./modelKit";

export const models: MedievalModel[] = [
  {
    id: "market-produce-stall",
    name: "Produce stall with cloth awning",
    task: 6,
    size: [5, 5, 4],
    note: "Braced demountable stall, alternating linen awning panels, display counter, loose produce and a loaded wicker basket.",
    create() {
      const k = new ModelKit("market-produce-stall");
      for (const x of [-1.8, 1.8]) for (const z of [-1.3, 1.3]) k.box("stall-post", [x, 1.4, z], [0.12, 2.8, 0.12]);
      for (let i = 0; i < 6; i++) {
        const awning = k.box("awning-panel", [-1.7 + i * 0.68, 2.9, 0], [0.68, 0.045, 3.5], i % 2 ? "white" : "cloth");
        awning.rotation.x = 0.12;
      }
      k.table(0, 1, 3.8, 0.9, 0.9);
      for (let i = 0; i < 12; i++)
        k.sphere(
          "market-produce",
          [-1.45 + (i % 6) * 0.55, 1.05, 0.8 + Math.floor(i / 6) * 0.3],
          [0.15, 0.14, 0.13],
          i % 2 ? "straw" : "green"
        );
      k.attach(createMedievalContainerModel("basket", "loaded"), [-0.9, 0, -0.2]);
      k.beam("stall-cross-brace", [-1.8, 2, -1.3], [-1, 2.8, -1.3], 0.1);
      return k.finish();
    }
  },
  {
    id: "market-goods-booth",
    name: "Covered cloth and goods booth",
    task: 6,
    size: [5, 5, 4],
    note: "Market booth with folded textiles, hanging fabric, a pitched canvas cover, a timber counter and a closed stock crate.",
    create() {
      const k = new ModelKit("market-goods-booth");
      k.hall(0, 0, 3.8, 2.8, 2.5, 0.65, { open: true, roof: "cloth" });
      k.table(0, 1, 3.2, 0.8, 0.85);
      for (let i = 0; i < 5; i++)
        k.box("folded-cloth", [-1 + i * 0.5, 0.98 + (i % 2) * 0.08, 1], [0.45, 0.15, 0.5], i % 2 ? "white" : "cloth");
      k.box("hanging-textile", [0, 1.9, -1.3], [1.6, 1, 0.03], "cloth");
      k.attach(createMedievalContainerModel("crate", "closed"), [1, 0, -0.6]);
      return k.finish();
    }
  }
];
