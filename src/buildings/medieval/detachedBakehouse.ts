import * as THREE from "three";
import { DEFAULT_AUTHOR } from "../authors";
import { compactModel } from "../compactModel";
import { createModelAssembly, type ModelPartFactory } from "../modelParts";
import { variantId } from "../modelVariants";
import { type BakeryPart, createHighBakeryComponent } from "./bakeryComponents";
import { DETACHED_BAKEHOUSE as p } from "./detachedBakehouseProfile";
import { ModelKit, type Position } from "./modelKit";

export type BakehouseQuality = "low" | "high";
function site() {
  const k = new ModelKit("bakehouse-paved-site");
  k.box("level-work-pad", [2.75, 0.075, 0.75], [14.5, 0.15, 8.5], "stone");
  const geometry = new THREE.BufferGeometry();
  const a: Position = [-4.5, 0.15, 5],
    b: Position = [10, 0.15, 5];
  const c: Position = [10, 0, 7],
    d: Position = [-4.5, 0, 7];
  const e: Position = [-4.5, 0, 5],
    f: Position = [10, 0, 5];
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [...a, ...c, ...b, ...a, ...d, ...c, ...e, ...b, ...f, ...e, ...a, ...b, ...e, ...d, ...a, ...f, ...b, ...c],
      3
    )
  );
  geometry.computeVertexNormals();
  k.add("level-entry-ramp", geometry, "stone");
  return k.finish();
}
function architecture(high: boolean) {
  const k = new ModelKit("bakehouse-preparation-house");
  k.box("rear-wall", [0, 1.65, -2.875], [8, 3, 0.25], "stone");
  for (const side of [-1, 1]) {
    k.box("side-wall", [side * 3.875, 1.65, 0], [0.25, 3, 6], "stone");
    k.box("front-wall", [side * 2.5, 1.65, 2.875], [3, 3, 0.25], "stone");
  }
  k.box("entry-lintel", [0, 2.75, 2.875], [2, 0.8, 0.25], "stone");
  if (high) {
    for (let y = 0.45; y < 3.15; y += 0.3)
      for (const side of [-1, 1]) k.box("front-mortar-course", [side * 2.5, y, 3.002], [2.95, 0.012, 0.008], "white");
  }
  return k.finish();
}
function roof(high: boolean) {
  const k = new ModelKit("bakehouse-roof");
  k.roof(0, 0, 8.6, 6.6, 3.25, 1.4, "tile", true);
  if (high) {
    const angle = Math.atan2(1.4, 3.3);
    for (const side of [-1, 1])
      for (let i = 1; i <= 8; i++) {
        const z = (side * 3.3 * i) / 9;
        k.beam(
          "tile-course",
          [-4.25, 4.67 - Math.abs(z) * Math.tan(angle), z],
          [4.25, 4.67 - Math.abs(z) * Math.tan(angle), z],
          0.018,
          "earth"
        );
      }
  }
  return k.finish();
}
function stores(high: boolean) {
  const k = new ModelKit("bakehouse-flour-and-dough-storage");
  k.table(2.55, -1.5, 1.7, 1.4, 0.35);
  for (const x of [2.05, 2.65, 3.15]) {
    k.box("tied-flour-sack", [x, 0.735, -1.5], [0.45, 0.65, 0.8], "cloth");
    k.beam("sack-tie", [x - 0.07, 1.065, -1.5], [x + 0.07, 1.065, -1.5], 0.025, "wood");
  }
  k.table(2.55, 1.2, 1.4, 1.2, 0.7);
  k.box("covered-dough-tray", [2.55, 0.86, 1.2], [1.2, 0.2, 1], "cloth");
  k.vessel("carried-water-tub", [3.2, 0, -0.1], 0.28, 0.55, "wood", true);
  k.box("stored-water", [3.2, 0.4, -0.1], [0.36, 0.02, 0.36], "water");
  if (high) for (const x of [2.1, 2.55, 3]) k.box("dough-cover-fold", [x, 0.965, 1.2], [0.018, 0.01, 0.95], "white");
  return k.finish();
}
export function detachedBakehouseParts(quality: BakehouseQuality): ModelPartFactory[] {
  const high = quality === "high";
  const fresh = (id: string, create: ModelPartFactory["create"]): ModelPartFactory => ({
    id: `dedicated-bakehouse:${id}`,
    role: id,
    author: DEFAULT_AUTHOR,
    quality,
    create
  });
  return [
    fresh("site", site),
    fresh("architecture", () => architecture(high)),
    fresh("roof", () => roof(high)),
    ...p.equipment.map(e => ({
      ...fresh(e.id, () => {
        // Reuse the complete physical component at unit scale in both qualities.
        const k = new ModelKit(`bakehouse-${e.id}`);
        const model = createHighBakeryComponent("bread-bakehouse", e.sourcePart as BakeryPart);
        model.group.rotation.y = e.rotationY;
        k.attach(model, [...e.translation]);
        return k.finish();
      }),
      basedOn: [variantId("medieval.bread-bakehouse", "high", DEFAULT_AUTHOR)]
    })),
    fresh("stores", () => {
      const k = new ModelKit("bakehouse-stores-raised-floor");
      k.attach(stores(high), [0, 0.15, 0]);
      return k.finish();
    })
  ];
}
export function assembleDetachedBakehouse(
  quality: BakehouseQuality,
  parts: readonly ModelPartFactory[] = detachedBakehouseParts(quality)
) {
  const result = compactModel(createModelAssembly(`dedicated-bakehouse-${quality}`, parts), {
    mergeEquivalentMaterials: true
  });
  result.group.userData.placementSpec = p;
  return result;
}
