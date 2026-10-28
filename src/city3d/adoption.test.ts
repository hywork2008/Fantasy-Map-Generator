import * as THREE from "three";
import { expect, it } from "vitest";
import { authorSlug } from "../buildings/authors";
import { MODEL_VARIANTS } from "../buildings/variants";
import { adoptedVariant, CE_ADOPTION, markVariant, sceneVariants } from "./adoption";

it("registers unique variant ids that spell out their family, level and author", () => {
  const ids = MODEL_VARIANTS.map(variant => variant.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const variant of MODEL_VARIANTS)
    expect(variant.id).toBe(
      `${variant.family}@${variant.level}#${authorSlug(variant.author)}${variant.edition ? `~${variant.edition}` : ""}`
    );
});

it("adopts a registered variant of the same family and level for every level CE can request", () => {
  for (const [family, levels] of Object.entries(CE_ADOPTION))
    for (const [level, { variant }] of Object.entries(levels)) {
      const adopted = adoptedVariant(family, level);
      expect(adopted.id).toBe(variant);
    }
  for (const { family, level } of MODEL_VARIANTS) expect(() => adoptedVariant(family, level)).not.toThrow();
});

it("lists only variants that visible objects draw", () => {
  const root = new THREE.Group();
  const drawn = new THREE.InstancedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial(), 2);
  const empty = new THREE.InstancedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial(), 2);
  empty.count = 0;
  const hidden = new THREE.Group();
  hidden.visible = false;
  markVariant(drawn, "b");
  markVariant(drawn, "a");
  markVariant(drawn, "a");
  markVariant(empty, "c");
  markVariant(hidden, "d");
  root.add(drawn, empty, hidden);
  expect(sceneVariants(root)).toEqual(["a", "b"]);
});
