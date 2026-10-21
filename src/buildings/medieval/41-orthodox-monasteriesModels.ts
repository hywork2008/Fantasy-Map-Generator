import * as THREE from "three";
import { type MedievalModel, ModelKit } from "./modelKit";

export const models: MedievalModel[] = [
  {
    id: "orthodox-monastery",
    name: "Eastern European Orthodox monastery",
    task: 41,
    size: [34, 30, 14],
    note: "Illustrative late medieval eastern European monastery: domed church with an apse, residential ranges, refectory, covered wooden galleries and an enclosed service court. The bulbous roof form is regional, not universal to all Orthodox foundations.",
    create() {
      const k = new ModelKit("orthodox-monastery");
      k.box("monastery-court", [0, 0.06, 0], [26, 0.12, 23], "stone");
      k.hall(0, -6, 8, 7, 5, 1.2, { wall: "stone", windows: false, roof: "wood" });
      k.cylinder("church-apse", [4.5, 1.9, -6], 2, 3.8, "stone");
      k.cylinder("central-drum", [0, 5.9, -6], 1.1, 1.8, "stone");
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        k.box("drum-window", [Math.cos(a) * 1.05, 5.95, -6 + Math.sin(a) * 1.05], [0.2, 0.8, 0.12], "dark");
      }
      const profile = [
        [1.1, 0],
        [1.4, 0.5],
        [1.45, 1.1],
        [1.1, 1.8],
        [0.4, 2.5],
        [0, 3]
      ];
      const dome = k.add(
        "bulbous-church-dome",
        new THREE.LatheGeometry(
          profile.map(([r, y]) => new THREE.Vector2(r, y)),
          32
        ),
        "green"
      );
      dome.position.set(0, 6.6, -6);
      k.beam("orthodox-cross-upright", [0, 9.6, -6], [0, 11.3, -6], 0.075, "iron");
      k.beam("cross-main-bar", [-0.5, 10.7, -6], [0.5, 10.7, -6], 0.075, "iron");
      k.beam("cross-upper-bar", [-0.25, 11.05, -6], [0.25, 11.05, -6], 0.06, "iron");
      k.beam("cross-footbar", [-0.3, 10, -6], [0.3, 9.8, -6], 0.06, "iron");
      k.hall(-11, 1, 4, 17, 4.7, 1.5, { wall: "plaster", storeys: 2 });
      k.hall(11, 1, 4, 17, 4.7, 1.5, { wall: "plaster", storeys: 2 });
      k.hall(0, 10, 18, 4, 3.6, 1.4, { wall: "stone" });
      k.chimney(5, 10, 5.5);
      for (const side of [-1, 1]) {
        k.hall(side * 7.7, 1, 2.2, 13, 2.5, 0.5, { open: true, roof: "wood" });
        for (let i = 0; i < 7; i++) k.box("gallery-balustrade", [side * 7.7, 0.9, -4 + i * 1.7], [0.09, 1, 0.09]);
      }
      k.box("herb-garden", [0, 0.17, 3], [5, 0.1, 4], "green");
      return k.finish();
    }
  }
];
