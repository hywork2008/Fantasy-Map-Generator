import { createMedievalContainerModel } from "../props/medievalContainers";
import { models as carts } from "./09-hand-cartsModels";
import { type MedievalModel, ModelKit } from "./modelKit";

export const models: MedievalModel[] = [
  {
    id: "sand-storage-yard",
    name: "Sand storage and loading yard",
    task: 40,
    size: [15, 13, 4],
    note: "Separated sand heaps, low timber retaining bays, dry material shelter, transport buckets, shovel and a wooden wheelbarrow for glassmaking or masonry supply.",
    create() {
      const k = new ModelKit("sand-storage-yard");
      for (let bay = 0; bay < 2; bay++) {
        const x = -3 + bay * 5;
        for (const xx of [x - 1.9, x + 1.9]) k.box("sand-bay-wall", [xx, 0.5, -1], [0.12, 1, 4], "wood");
        k.box("sand-bay-back", [x, 0.5, -3], [3.9, 1, 0.12], "wood");
        k.box("sand-bed", [x, 0.05, -1], [3.6, 0.1, 3.7], "plaster");
        k.sphere("sand-heap", [x, 0.7, -1], [1.65, 0.7, 1.7], bay ? "straw" : "plaster");
      }
      k.hall(-3, -1, 4.5, 4.5, 2.5, 0.7, { open: true, roof: "wood" });
      k.attach(carts.find(model => model.id === "wooden-wheelbarrow")!.create(), [2, 0, 3]);
      k.attach(createMedievalContainerModel("basket", "empty"), [-2, 0, 2.8], 0.7);
      k.attach(createMedievalContainerModel("barrel", "empty"), [-3, 0, 2.8], 0.7);
      k.beam("sand-shovel-haft", [-0.2, 0.3, 2.5], [-0.2, 1.5, 2.1], 0.05, "wood", true);
      k.box("sand-shovel-blade", [-0.2, 0.2, 2.5], [0.35, 0.3, 0.06], "iron");
      return k.finish();
    }
  }
];
