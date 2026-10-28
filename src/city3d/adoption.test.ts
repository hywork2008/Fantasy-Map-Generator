import { expect, it } from "vitest";
import { authorSlug } from "../buildings/authors";
import { MODEL_VARIANTS } from "../buildings/variants";
import { adoptedVariant, CE_ADOPTION } from "./adoption";

it("registers unique variant ids that spell out their family, level and author", () => {
  const ids = MODEL_VARIANTS.map(variant => variant.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const variant of MODEL_VARIANTS)
    expect(variant.id).toBe(`${variant.family}@${variant.level}#${authorSlug(variant.author)}`);
});

it("adopts a registered variant of the same family and level for every level CE can request", () => {
  for (const [family, levels] of Object.entries(CE_ADOPTION))
    for (const [level, { variant }] of Object.entries(levels)) {
      const adopted = adoptedVariant(family, level);
      expect(adopted.id).toBe(variant);
    }
  for (const { family, level } of MODEL_VARIANTS) expect(() => adoptedVariant(family, level)).not.toThrow();
});
