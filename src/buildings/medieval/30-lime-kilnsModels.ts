import * as THREE from "three";
import { type MedievalModel, ModelKit } from "./modelKit";

export const models: MedievalModel[] = [
  {
    id: "masonry-lime-kiln",
    name: "Masonry lime kiln and charging bank",
    task: 30,
    size: [14, 13, 7],
    note: "Small intermittent lime kiln with an open charging pot, stone firebox, draw opening, access bank, limestone charge and fuel stock. No factory chimney or continuous modern shaft system.",
    create() {
      const k = new ModelKit("masonry-lime-kiln");
      k.box("kiln-foundation", [0, 0.18, 0], [5, 0.36, 4.8], "stone");
      const pot = k.add(
        "kiln-pot",
        new THREE.LatheGeometry(
          [
            [0, 0],
            [2, 0],
            [2, 3.9],
            [1.55, 3.9],
            [1.55, 0.45],
            [0, 0.45]
          ].map(([r, y]) => new THREE.Vector2(r, y)),
          24
        ),
        "stone"
      );
      pot.position.set(0, 0.35, -0.2);
      k.cylinder("kiln-charge", [0, 2.7, -0.2], 1.5, 0.15, "earth");
      for (let i = 0; i < 19; i++) {
        const r = Math.sqrt((i + 0.5) / 19) * 1.2,
          a = i * 2.4;
        k.sphere(
          "limestone-charge",
          [r * Math.cos(a), 2.9 + 0.2 * (1 - r / 1.2), -0.2 + r * Math.sin(a)],
          [0.28, 0.2, 0.28],
          "stone"
        );
      }
      k.box("draw-arch-surround", [0, 0.9, 1.9], [2, 1.5, 0.6], "stone");
      k.box("draw-opening", [0, 0.75, 2.23], [1.1, 1.05, 0.06], "dark");
      for (let i = 0; i < 8; i++)
        k.box("charging-bank-step", [0, 0.2 * (i + 1), -3.9 + i * 0.25], [4, 0.4 * (i + 1), 0.5], "earth");
      for (let i = 0; i < 10; i++)
        k.sphere(
          "raw-limestone",
          [-4 + (i % 3) * 0.6, 0.35 + Math.floor(i / 6) * 0.4, 1 + Math.floor(i / 3) * 0.6],
          [0.45, 0.35, 0.4],
          "stone"
        );
      for (let i = 0; i < 8; i++)
        k.beam(
          "kiln-fuel",
          [3.4 + (i % 4) * 0.2, 0.13 + Math.floor(i / 4) * 0.2, 0],
          [3.4 + (i % 4) * 0.2, 0.13 + Math.floor(i / 4) * 0.2, 1.5],
          0.18,
          "wood",
          true
        );
      return k.finish();
    }
  }
];
