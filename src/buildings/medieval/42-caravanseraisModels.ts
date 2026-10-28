import * as THREE from "three";
import { type MedievalModel, ModelKit } from "./modelKit";

export const models: MedievalModel[] = [
  {
    author: "Codex GPT-6.1 Sol",
    id: "balkan-caravanserai",
    name: "Ottoman Balkan caravanserai",
    task: 42,
    size: [34, 30, 12],
    note: "Regional southeastern European/Ottoman caravanserai with a vaulted entry, lodging ranges, courtyard galleries, animal shelter and water trough. Appropriate to its region and period, not a generic western European inn.",
    create() {
      const k = new ModelKit("balkan-caravanserai");
      k.box("caravan-court", [0, 0.08, 0], [27, 0.16, 25], "stone");
      k.hall(0, -10, 25, 5, 5.2, 1.8, { wall: "stone", storeys: 2 });
      for (const side of [-1, 1]) {
        k.hall(side * 11, 0, 15, 4.5, 5.2, 1.5, { wall: "stone", storeys: 2, rotation: (-side * Math.PI) / 2 });
        k.hall(side * 7, 10, 8, 4, 4.7, 1.5, { wall: "stone", storeys: 2 });
        k.hall(side * 7.5, 0, 14, 2.3, 2.6, 0.6, { open: true, roof: "wood", rotation: (-side * Math.PI) / 2 });
        for (let i = 0; i < 5; i++)
          k.beam("animal-tethering-rail", [side * 6.1, 1.1, -4 + i * 2], [side * 6.1, 1.1, -3 + i * 2], 0.1);
      }
      const shape = new THREE.Shape();
      shape.moveTo(-2.6, 0);
      shape.lineTo(-2.6, 6.5);
      shape.lineTo(2.6, 6.5);
      shape.lineTo(2.6, 0);
      shape.lineTo(1.6, 0);
      shape.lineTo(1.6, 2.7);
      shape.absarc(0, 2.7, 1.6, 0, Math.PI, false);
      shape.lineTo(-1.6, 0);
      shape.closePath();
      k.add(
        "vaulted-gateway",
        new THREE.ExtrudeGeometry(shape, { depth: 1.2, bevelEnabled: false, curveSegments: 16 }).translate(0, 0, 10.2),
        "stone"
      );
      k.box("gateway-parapet", [0, 6.5, 10.8], [5.7, 0.3, 1.6], "stone");
      k.box("gateway-terrace", [0, 4.9, 9], [5.2, 0.2, 3], "stone");
      k.vessel("court-water-trough", [0, 0.16, 0], 1.2, 0.7, "stone", true);
      k.hall(0, -6.8, 15, 2.2, 2.7, 0.5, { open: true, roof: "wood" });
      k.fence([-3.5, 5.5], [-3.5, -4], 1);
      k.fence([3.5, 5.5], [3.5, -4], 1);
      return k.finish();
    }
  }
];
