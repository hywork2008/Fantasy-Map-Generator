import * as THREE from "three";
import { expect, it } from "vitest";
import { compactModel } from "./compactModel";
import { ModelKit } from "./medieval/modelKit";
import { createModelAssembly, type ModelPartFactory } from "./modelParts";

function parts(): ModelPartFactory[] {
  return ["a", "b"].map((id, index) => ({
    id,
    role: "test",
    quality: "low",
    author: "Codex GPT-6.1 Sol",
    create() {
      const k = new ModelKit(id);
      k.box("body", [index * 2, 0.5, 0], [1, 1, 1], "stone");
      return k.finish();
    }
  }));
}

it("only pools equivalent materials when requested and preserves ranges through repeated compaction", () => {
  const original = compactModel(createModelAssembly("default", parts()));
  expect(original.pickables).toHaveLength(2);
  original.dispose();
  const pooled = compactModel(createModelAssembly("pooled", parts()), { mergeEquivalentMaterials: true });
  expect(pooled.pickables).toHaveLength(1);
  const again = compactModel(pooled, { mergeEquivalentMaterials: true });
  expect(again.pickables[0].userData.modelPartRanges).toEqual([
    { partId: "a", start: 0, count: 36 },
    { partId: "b", start: 36, count: 36 }
  ]);
  expect(again.group.userData.modelParts.map((part: { id: string }) => part.id)).toEqual(["a", "b"]);
  again.dispose();
});

it("does not combine differing material state or custom shaders", () => {
  const source = createModelAssembly("different", parts());
  (source.pickables[1].material as THREE.Material).side = THREE.FrontSide;
  const result = compactModel(source, { mergeEquivalentMaterials: true });
  expect(result.pickables).toHaveLength(2);
  result.dispose();
  const custom = createModelAssembly("custom", parts());
  (custom.pickables[1].material as THREE.Material).onBeforeCompile = () => {};
  const separate = compactModel(custom, { mergeEquivalentMaterials: true });
  expect(separate.pickables).toHaveLength(2);
  separate.dispose();
});
