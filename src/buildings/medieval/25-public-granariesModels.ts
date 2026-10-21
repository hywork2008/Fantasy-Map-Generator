import { createMedievalContainerModel } from "../props/medievalContainers";
import { type MedievalModel, ModelKit } from "./modelKit";

export const models: MedievalModel[] = [
  {
    id: "public-granary",
    name: "Public municipal granary",
    task: 25,
    size: [23, 17, 13],
    note: "Large civic grain reserve with three storage levels, raised masonry loading apron, upper receiving doors, timber hoist and a separate receiving wing; distinguished from a small private granary.",
    create() {
      const k = new ModelKit("public-granary");
      k.hall(0, -2, 15, 8, 8, 3, { wall: "stone", door: 3, storeys: 3 });
      k.hall(8.5, -1, 4, 6, 4.5, 1.6, { wall: "stone", door: 2 });
      k.box("receiving-apron", [0, 0.45, 4], [11, 0.9, 4], "stone");
      for (const x of [-3.5, 0, 3.5]) {
        k.box("grain-loading-door", [x, 4.2, 2.2], [1.6, 2.1, 0.08], "wood");
        k.beam("civic-grain-hoist", [x, 7.2, 1.5], [x, 7.2, 4.8], 0.2);
        k.beam("sack-lifting-rope", [x, 7.2, 4.6], [x, 1.5, 4.6], 0.025, "cloth", true);
        k.attach(createMedievalContainerModel("sack", "closed"), [x, 0.9, 4.5]);
      }
      for (let i = 0; i < 3; i++) k.box("apron-step", [0, 0.15 + i * 0.3, 6 - i * 0.35], [3, 0.3, 0.4], "stone");
      k.box("municipal-plaque", [0, 6.5, 2.25], [1.1, 0.8, 0.1], "stone");
      for (let i = 0; i < 3; i++)
        k.beam("grain-sheaf-emblem", [-0.2 + i * 0.2, 6.2, 2.32], [-0.3 + i * 0.3, 6.8, 2.32], 0.06, "straw", true);
      return k.finish();
    }
  }
];
