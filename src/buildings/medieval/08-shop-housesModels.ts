import { createMedievalContainerModel } from "../props/medievalContainers";
import { type MedievalModel, ModelKit } from "./modelKit";

export const models: MedievalModel[] = [
  {
    id: "merchant-shop-house",
    name: "Merchant shop and dwelling",
    task: 8,
    size: [9, 10, 9],
    note: "Street-facing shop under an upstairs dwelling. Hinged display shutter, counter, fabric awning, goods shelves and stock crates distinguish the commercial ground floor.",
    create() {
      const k = new ModelKit("merchant-shop-house");
      k.hall(0, -1.5, 6, 5, 5.2, 2, { storeys: 2, doorOffset: 2, windows: false });
      for (const x of [-1.8, 1.8]) k.window(x, 1.12, 4.3);
      k.box("shop-open-window", [-1, 1.35, 1.18], [2.7, 1.4, 0.15], "dark");
      k.box("lower-display-shutter", [-1, 0.8, 1.6], [2.9, 0.1, 1], "wood");
      const top = k.box("upper-hinged-shutter", [-1, 2.25, 1.6], [2.9, 0.08, 1], "wood");
      top.rotation.x = -0.2;
      k.table(-1, 2, 2.8, 0.75, 0.8);
      for (let i = 0; i < 6; i++)
        k.box("folded-goods", [-2 + i * 0.4, 0.95, 2], [0.33, 0.18, 0.5], i % 2 ? "cloth" : "white");
      for (const x of [-2.6, 2.6]) k.box("awning-post", [x, 1.35, 2.9], [0.12, 2.7, 0.12]);
      const awning = k.box("shop-awning", [0, 2.8, 2.3], [5.7, 0.05, 2], "cloth");
      awning.rotation.x = 0.12;
      k.attach(createMedievalContainerModel("crate", "closed"), [-1.8, 0, 3.1]);
      return k.finish();
    }
  },
  {
    id: "artisan-shop-house",
    name: "Street workshop and lodging",
    task: 8,
    size: [9, 9, 8],
    note: "Artisan dwelling with a broad work window, folding timber shutter, outside workbench, tool pegs and a small tiled working canopy.",
    create() {
      const k = new ModelKit("artisan-shop-house");
      k.hall(0, -1, 6, 4.5, 4.8, 1.7, { storeys: 2, wall: "wood", doorOffset: 2, windows: false });
      for (const x of [-1.8, 1.8]) k.window(x, 1.37, 4.1);
      k.box("open-work-window", [-1, 1.5, 1.4], [2.6, 1.4, 0.12], "dark");
      k.table(-1, 2, 2.5, 0.9, 0.9);
      k.box("fold-down-work-shutter", [-1, 0.9, 1.6], [2.8, 0.1, 0.8], "wood");
      for (let i = 0; i < 5; i++)
        k.beam("hanging-tool", [-2 + i * 0.42, 1.2, 1.5], [-2 + i * 0.42, 1.9, 1.5], 0.04, "iron", true);
      k.roof(-1, 2.2, 3.5, 2.3, 2.8, 0.5, "wood");
      k.chimney(1.8, -1.5, 5.8);
      return k.finish();
    }
  }
];
