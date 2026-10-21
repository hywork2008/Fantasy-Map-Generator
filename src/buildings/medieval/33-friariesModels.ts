import { cloister } from "./32-abbey-living-quartersModels";
import { type MedievalModel, ModelKit } from "./modelKit";

export const models: MedievalModel[] = [
  {
    id: "mendicant-friary",
    name: "Urban mendicant friary",
    task: 33,
    size: [28, 25, 10],
    note: "Restrained urban friary with a preaching church, a small cloister, shared dormitory, refectory and kitchen. Intended for high/late medieval and later urban settings, not an early medieval foundation.",
    create() {
      const k = new ModelKit("mendicant-friary");
      cloister(k, 8);
      k.hall(0, -7, 19, 6, 4.8, 2.3, { wall: "stone", windows: false, door: 1.6 });
      for (const x of [-6, -3, 0, 3, 6]) k.box("preaching-church-window", [x, 3.4, -3.95], [0.45, 1.6, 0.045], "dark");
      k.hall(-7, 1, 4, 9, 4.8, 1.5, { wall: "plaster", storeys: 2 });
      k.hall(0, 7, 12, 4, 3.3, 1.2, { wall: "plaster" });
      k.hall(7, 2, 4, 6, 3, 1.2, { wall: "stone" });
      k.chimney(7, 2, 5.1);
      for (const x of [-1.2, 1.2]) k.box("church-bellcote-post", [x, 6, -7], [0.18, 2, 0.18]);
      k.roof(0, -7, 3, 1.8, 7, 0.7, "tile");
      k.cylinder("friary-bell", [0, 6.3, -7], 0.25, 0.45, "iron", 0.15);
      return k.finish();
    }
  }
];
