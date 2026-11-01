import * as THREE from "three";
import { compactModel } from "../compactModel";
import { HouseDetailKit } from "./houseDetailKit";
import { addCraftBench, addCraftShed } from "./workshopDetailKit";

export function createHighStoneYard() {
  const k = new HouseDetailKit("masons-stone-yard-high");
  k.box("stone-yard-ground", [0, 0.025, 0], [13.8, 0.05, 10], "earth");
  addCraftShed(k, -3, -2, 7, 4);
  addCraftBench(k, -3, -1.4, 2.7, 1.3, 0.95);
  const dressed = k.add("part-dressed-bench-block", new THREE.BoxGeometry(1.45, 0.4, 0.8, 4, 1, 4), "stone");
  dressed.position.set(-3, 1.15, -1.4);
  for (let i = 0; i < 14; i++)
    k.beam("dressing-chisel-line", [-3.62 + i * 0.095, 1.354, -1.72], [-3.6 + i * 0.095, 1.354, -1.08], 0.007, "earth");
  addCraftBench(k, -1.25, -3.1, 1.3, 0.65, 0.9);
  for (let i = 0; i < 4; i++) {
    const x = -1.7 + i * 0.27;
    k.beam("steel-chisel", [x, 0.9175, -3.25], [x, 0.9175, -2.95], 0.035, "iron");
    k.cylinder("chisel-striking-head", [x, 0.925, -3.26], 0.025, 0.04, "iron").rotation.x = Math.PI / 2;
  }
  k.beam("mallet-wooden-handle", [-1.65, 0.9225, -3.3], [-1.1, 0.9225, -3.3], 0.045, "wood", true);
  k.cylinder("mallet-head", [-1.07, 0.99, -3.3], 0.09, 0.24, "oak").rotation.x = Math.PI / 2;
  for (let row = 0; row < 3; row++)
    for (let i = 0; i < 4 - row; i++) {
      const x = -4.7 + i * 1.05 + row * 0.5;
      k.box("squared-ashlar-stock", [x, 0.3 + row * 0.5, 2.5], [1, 0.5, 0.85], "stone");
      for (let j = 0; j < 5; j++)
        k.beam(
          "ashlar-dressing-mark",
          [x - 0.38 + j * 0.18, 0.16 + row * 0.5, 2.93],
          [x - 0.35 + j * 0.18, 0.43 + row * 0.5, 2.93],
          0.006,
          "earth"
        );
    }
  for (let i = 0; i < 6; i++) {
    const x = 1.5 + (i % 3) * 1.55,
      z = -2.6 + Math.floor(i / 3) * 1.65;
    k.box("stone-stock-pallet", [x, 0.11, z], [1.35, 0.12, 1.25], "wood");
    const geometry = new THREE.DodecahedronGeometry(0.66, 0);
    geometry.scale(1, 0.8 + (i % 2) * 0.1, 0.82);
    geometry.rotateY(i * 0.7);
    geometry.computeBoundingBox();
    geometry.translate(0, 0.17 - geometry.boundingBox!.min.y, 0);
    k.add("rough-quarried-stock", geometry, "stone").position.set(x, 0, z);
    for (const dx of [-0.6, 0.6]) k.box("pallet-runner", [x + dx, 0.065, z], [0.12, 0.03, 1.25], "oak");
  }
  for (let i = 0; i < 32; i++) {
    const geometry = new THREE.TetrahedronGeometry(0.035 + (i % 5) * 0.009, 0);
    geometry.scale(1, 0.4, 0.75);
    geometry.rotateY(i * 0.6);
    geometry.computeBoundingBox();
    geometry.translate(0, 0.05 - geometry.boundingBox!.min.y, 0);
    k.add("stone-dressing-chip", geometry, "stone").position.set(
      -1.6 + (i % 8) * 0.23,
      0,
      0.5 + Math.floor(i / 8) * 0.22
    );
  }
  k.box("straightedge-on-bench", [-3.1, 1.3625, -1.7], [1.2, 0.025, 0.055], "wood");
  k.beam("mason-square-long", [-4.05, 0.9675, -1.95], [-4.05, 0.9675, -0.95], 0.035, "iron");
  k.beam("mason-square-short", [-4.05, 0.9675, -0.95], [-3.7, 0.9675, -0.95], 0.035, "iron");
  return compactModel(k.finish());
}
