import * as THREE from "three";
import { type MedievalModel, ModelKit, type Position } from "./modelKit";

export const models: MedievalModel[] = [
  {
    id: "tanners-yard",
    name: "Tannery vats and drying frames",
    task: 22,
    size: [15, 13, 6],
    note: "Open tannery work yard with liming and tanning vats, wash trough, fleshing beam and hides stretched on tied drying frames. No automatic water or river placement is assigned.",
    create() {
      const k = new ModelKit("tanners-yard");
      k.hall(-3, -3, 6, 3.5, 2.8, 1.2, { open: true, roof: "wood" });
      for (let i = 0; i < 4; i++) {
        const x = -4 + i * 2.5;
        k.vessel("tanning-vat", [x, 0, 0], 0.95, 0.9, i % 2 ? "wood" : "stone", true);
        k.ring("vat-binding", [x, 0.7, 0], 0.96, 0.035, "iron");
      }
      k.box("washing-trough-base", [-4, 0.12, 3], [3, 0.24, 1.3], "stone");
      for (const z of [2.4, 3.6]) k.box("wash-trough-wall", [-4, 0.5, z], [3, 0.8, 0.15], "stone");
      for (const x of [-5.45, -2.55]) k.box("wash-trough-end", [x, 0.5, 3], [0.15, 0.8, 1.1], "stone");
      k.box("wash-water", [-4, 0.6, 3], [2.7, 0.02, 1], "water");
      for (let i = 0; i < 3; i++) {
        const x = -0.5 + i * 2.4;
        for (const xx of [x - 0.9, x + 0.9]) k.box("drying-post", [xx, 1.6, 3], [0.1, 3.2, 0.1]);
        for (const y of [0.4, 3.1]) k.beam("drying-frame", [x - 0.9, y, 3], [x + 0.9, y, 3], 0.09);
        const outline: Position[] = [
          [x - 0.55, 2.8, 3],
          [x + 0.55, 2.8, 3],
          [x + 0.75, 2.3, 3],
          [x + 0.45, 1.7, 3],
          [x + 0.7, 0.9, 3],
          [x, 1.05, 3],
          [x - 0.7, 0.9, 3],
          [x - 0.45, 1.7, 3],
          [x - 0.75, 2.3, 3]
        ];
        const hide = new THREE.Shape(outline.map(p => new THREE.Vector2(p[0], p[1])));
        k.add("stretched-hide", new THREE.ShapeGeometry(hide).translate(0, 0, 3), "leather");
        for (const y of [1.1, 2, 2.7])
          for (const s of [-1, 1])
            k.beam("hide-lacing", [x + s * 0.9, y, 3], [x + s * 0.5, y, 3], 0.014, "cloth", true);
      }
      k.beam("fleshing-beam", [1, 0.4, -2.5], [2.5, 1.2, -2.5], 0.3, "wood", true);
      return k.finish();
    }
  }
];
