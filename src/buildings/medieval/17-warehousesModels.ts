import { createMedievalContainerModel } from "../props/medievalContainers";
import { type MedievalModel, ModelKit } from "./modelKit";

export const models: MedievalModel[] = [
  {
    author: "Codex GPT-6.1 Sol",
    id: "merchant-warehouse",
    name: "Merchant warehouse and loading hoist",
    task: 17,
    size: [15, 14, 12],
    note: "Three-storey merchant warehouse with large upper loading doors, projecting hoist beam, rope pulley, rain canopy and a receiving platform with crates and casks.",
    create() {
      const k = new ModelKit("merchant-warehouse");
      k.hall(0, -1, 10, 7, 7.8, 2.8, { wall: "stone", door: 2.8, storeys: 3 });
      for (const y of [3.2, 5.8]) {
        k.box("upper-loading-door", [0, y, 2.62], [1.8, 2.1, 0.08], "wood");
        k.box("loading-door-lintel", [0, y + 1.12, 2.7], [2.1, 0.18, 0.16]);
      }
      k.beam("warehouse-hoist", [0, 8.3, 1.5], [0, 8.3, 5.2], 0.22);
      k.ring("hoist-pulley", [0, 8, 5], 0.18, 0.045, "wood", true);
      k.beam("lifting-rope", [0, 7.9, 5], [0, 1, 5], 0.025, "cloth", true);
      k.box("loading-platform", [0, 0.3, 3.8], [7, 0.6, 3], "stone");
      k.roof(0, 3.2, 7.8, 2.3, 3.1, 0.65, "wood");
      for (const [i, x] of [-2.8, -1.9, 1.9, 2.8].entries())
        k.attach(createMedievalContainerModel(i % 2 ? "barrel" : "crate", "closed"), [x, 0.6, 3.8]);
      return k.finish();
    }
  },
  {
    author: "Codex GPT-6.1 Sol",
    id: "riverside-goods-store",
    name: "Small riverside goods store",
    task: 17,
    size: [13, 12, 8],
    note: "Lower timber goods store for a river landing, wide freight door, loading canopy, hand-operated hoist and staged barrels and crates. No quay or river is included.",
    create() {
      const k = new ModelKit("riverside-goods-store");
      k.hall(0, -1, 9, 6, 4, 2, { wall: "wood", door: 3 });
      k.hall(0, 3, 6, 2.5, 2.8, 0.65, { open: true, roof: "wood" });
      k.beam("goods-hoist-jib", [3.5, 3.7, 1], [3.5, 3.7, 4], 0.16);
      k.beam("goods-hoist-rope", [3.5, 3.7, 3.8], [3.5, 0.8, 3.8], 0.025, "cloth", true);
      for (let i = 0; i < 3; i++) k.attach(createMedievalContainerModel("crate", "closed"), [-2 + i * 1.2, 0, 3]);
      return k.finish();
    }
  }
];
