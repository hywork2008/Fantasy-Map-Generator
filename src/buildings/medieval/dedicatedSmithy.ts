import * as THREE from "three";
import { DEFAULT_AUTHOR } from "../authors";
import { compactModel } from "../compactModel";
import { createModelAssembly, type ModelPartFactory } from "../modelParts";
import { variantId } from "../modelVariants";
import { type DedicatedSmithyForm, dedicatedSmithyProfile } from "./dedicatedSmithyProfile";
import { ModelKit, type Position } from "./modelKit";
import { createSmithyCorePart, type SmithyCorePart } from "./smithyDetails";

export type SmithyQuality = "low" | "high";
function site(form: DedicatedSmithyForm) {
  const p = dedicatedSmithyProfile(form),
    [x0, z0, x1, z1] = p.siteXZ;
  const back = form === "farrier" ? -5 : z0,
    front = z1 - 2;
  const k = new ModelKit(`${p.formId}-site`);
  k.box("level-stone-work-pad", [(x0 + x1) / 2, 0.075, (back + front) / 2], [x1 - x0, 0.15, front - back], "stone");
  for (const r of p.ramps) {
    const [a, b, c, d] = r.rectXZ;
    const near = r.end === "front" ? b : d,
      far = r.end === "front" ? d : b;
    const vertices: Position[] = [
      [a, 0.15, near],
      [c, 0.15, near],
      [c, 0, far],
      [a, 0, far]
    ];
    const geometry = new THREE.BufferGeometry();
    const indices = r.end === "front" ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        indices.flatMap(i => vertices[i]),
        3
      )
    );
    geometry.computeVertexNormals();
    k.add(`${r.end}-ground-ramp`, geometry, "stone");
  }
  return k.finish();
}
function frame(high: boolean) {
  const k = new ModelKit("dedicated-smithy-open-frame");
  for (const x of [-4.45, 2.45])
    for (const z of [-3.45, 1.45]) {
      k.box("shelter-stone-foot", [x, 0.25, z], [0.36, 0.2, 0.36], "stone");
      k.box("shelter-post", [x, 1.75, z], [0.16, 3, 0.16]);
      k.beam("shelter-knee-brace", [x, 2.55, z], [x - Math.sign(x + 1) * 0.6, 3.2, z], 0.12);
      if (high) for (const y of [0.6, 2.7]) k.cylinder("post-peg", [x, y, z + 0.09], 0.025, 0.05, "oak");
    }
  for (const z of [-3.45, 1.45]) k.beam("shelter-wall-plate", [-4.6, 3.2, z], [2.6, 3.2, z], 0.18);
  return k.finish();
}
function stores(form: DedicatedSmithyForm, high: boolean) {
  const k = new ModelKit(`${form}-material-storage`);
  // The inherited iron stack starts 0.10 m above its component origin.
  k.box("iron-stock-pallet", [-3.2, 0.2, 0.8], [0.9, 0.1, 1.7], "wood");
  k.box("charcoal-bin-bottom", [-4.2, 0.23, -1], [0.9, 0.16, 0.9], "wood");
  for (const x of [-4.6, -3.8]) k.box("charcoal-bin-side", [x, 0.5, -1], [0.1, 0.55, 0.9], "wood");
  for (const z of [-1.4, -0.6]) k.box("charcoal-bin-end", [-4.2, 0.5, z], [0.7, 0.55, 0.1], "wood");
  k.box("contained-charcoal", [-4.2, 0.46, -1], [0.7, 0.24, 0.7], "dark");
  if (high)
    for (let i = 0; i < 16; i++)
      k.sphere(
        "charcoal-lump",
        [-4.45 + (i % 4) * 0.17, 0.6, -1.25 + Math.floor(i / 4) * 0.17],
        [0.075, 0.045, 0.075],
        "dark"
      );
  k.cylinder("quench-water", [1.4, 0.65, 1.9], 0.24, 0.02, "water");
  for (const z of [-2.1, -0.9]) k.box("finished-stock-rack-leg", [4.8, 0.55, z], [0.12, 0.8, 0.12]);
  k.box("finished-stock-rack", [4.8, 0.98, -1.5], [0.6, 0.12, 1.5]);
  for (let i = 0; i < 4; i++) {
    if (form === "farrier") {
      const points = Array.from({ length: high ? 25 : 13 }, (_, j): Position => {
        const a = (j * Math.PI * 1.55) / (high ? 24 : 12);
        return [4.8 + Math.cos(a) * 0.18, 1.06, -1.95 + i * 0.3 + Math.sin(a) * 0.12];
      });
      k.tube("finished-horseshoe", points, 0.025, "iron");
    } else k.box("finished-iron-blank", [4.8, 1.07, -1.95 + i * 0.3], [0.4, 0.06, 0.12], "iron");
  }
  return k.finish();
}
function stock(high: boolean) {
  const k = new ModelKit("through-access-shoeing-stock");
  for (const x of [5.9, 8.1])
    for (const z of [-1.9, 1.9]) {
      k.box("stock-stone-foot", [x, 0.25, z], [0.3, 0.2, 0.3], "stone");
      k.box("stock-post", [x, 1.5, z], [0.16, 2.7, 0.16]);
      if (high) for (const y of [0.7, 2.65]) k.cylinder("stock-bolt", [x, y, z + 0.09], 0.025, 0.05, "iron");
    }
  for (const x of [5.9, 8.1]) k.beam("upper-stock-rail", [x, 2.65, -1.9], [x, 2.65, 1.9], 0.12);
  k.beam("outer-lower-stock-rail", [8.1, 1.25, -1.9], [8.1, 1.25, 1.9], 0.12);
  for (const [a, b] of [
    [-1.9, -0.75],
    [0.75, 1.9]
  ])
    k.beam("inner-end-stock-rail", [5.9, 1.25, a], [5.9, 1.25, b], 0.12);
  // Stowed restraint straps stay outside the animal and handler passages.
  for (const z of [-1.2, 1.2])
    k.tube(
      "stowed-leather-strap",
      [
        [8.18, 2.5, z],
        [8.25, 1.8, z],
        [8.18, 1.25, z]
      ],
      0.025,
      "leather"
    );
  return k.finish();
}
export function dedicatedSmithyParts(form: DedicatedSmithyForm, quality: SmithyQuality): ModelPartFactory[] {
  const high = quality === "high",
    p = dedicatedSmithyProfile(form);
  const part = (role: string, create: ModelPartFactory["create"]): ModelPartFactory => ({
    id: `${p.formId}:${role}`,
    role,
    quality,
    author: DEFAULT_AUTHOR,
    create
  });
  return [
    part("site", () => site(form)),
    part("frame", () => frame(high)),
    ...(["roof", "forge", "bellows", "anvil", "tools"] as SmithyCorePart[]).map(role => ({
      ...part(role, () => {
        const k = new ModelKit(`${p.formId}-${role}`);
        k.attach(createSmithyCorePart(role), [0, 0.15, 0]);
        return k.finish();
      }),
      basedOn: [variantId("medieval.open-smithy", "high", DEFAULT_AUTHOR)]
    })),
    part("stores", () => stores(form, high)),
    ...(form === "farrier" ? [part("stock", () => stock(high))] : [])
  ];
}
export function assembleDedicatedSmithy(
  form: DedicatedSmithyForm,
  quality: SmithyQuality,
  parts: readonly ModelPartFactory[] = dedicatedSmithyParts(form, quality)
) {
  const model = compactModel(createModelAssembly(`${form}-${quality}`, parts), { mergeEquivalentMaterials: true });
  model.group.userData.placementSpec = dedicatedSmithyProfile(form);
  return model;
}
