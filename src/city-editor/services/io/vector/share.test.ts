import { gzipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import saved from "../../../../../docs/analytics/ce-meshless-m5-synthetic-20261107.json";
import { syntheticVectorInput } from "../../../generators/vector/generation/input";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "../../../generators/vector/generation/pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "../../../generators/vector/generation/urban";
import { parseVectorDocument } from "./documentCodec";
import { decodeVectorShare, encodeVectorShare, vectorRecipe } from "./share";

describe("meshless shares", () => {
  it("round trips a complete edited native document and the selected stage without regeneration", () => {
    const doc = parseVectorDocument(JSON.stringify(saved))!;
    doc.paths["urban-lane:0"].origin = "manual";
    doc.revision++;
    const share = {
      kind: "fmg-vector-city-share",
      version: 1,
      mode: "document",
      document: doc,
      stage: "facilities"
    } as const;
    expect(decodeVectorShare(encodeVectorShare(share))).toEqual(share);
    expect(() => vectorRecipe(doc)).toThrow("vector-recipe-edited");
  });
  it("reproduces geometry from the explicit recipe input and rejects lossy recipe sharing of manual output", () => {
    const doc = generateVectorUrban(
        generateVectorSkeleton(syntheticVectorInput("share-recipe", 100, false), DEFAULT_VECTOR_GENERATION).document,
        { ...DEFAULT_VECTOR_URBAN, population: 90, maxLanes: 4 }
      ),
      recipe = vectorRecipe(doc),
      decoded = decodeVectorShare(
        encodeVectorShare({ kind: "fmg-vector-city-share", version: 1, mode: "recipe", recipe })
      );
    expect(decoded?.mode).toBe("recipe");
    expect(recipe.input.urban).toBeUndefined();
    expect(recipe.input.generation).toBeUndefined();
    const rebuilt = generateVectorUrban(generateVectorSkeleton(recipe.input, recipe.skeleton).document, recipe.urban);
    expect(Object.keys(rebuilt.paths)).toEqual(Object.keys(doc.paths));
    for (const id of Object.keys(doc.paths)) expect(rebuilt.paths[id].source).toEqual(doc.paths[id].source);
    doc.paths["urban-lane:0"].editPolicy = "fixed";
    expect(() => vectorRecipe(doc)).toThrow();
  });
  it("rejects corrupted, oversized, future and decompression-bomb shares", () => {
    expect(decodeVectorShare("vector.?")).toBeNull();
    expect(decodeVectorShare(`vector.${"a".repeat(1500000)}`)).toBeNull();
    const bytes = gzipSync(strToU8("x".repeat(9 * 1024 * 1024)));
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    expect(
      decodeVectorShare(`vector.${btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")}`)
    ).toBeNull();
  });
});
