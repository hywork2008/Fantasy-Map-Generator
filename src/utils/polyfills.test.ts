import { describe, expect, it } from "vitest";
import { flatArrayFallback } from "./polyfills";

describe("flat fallback", () => {
  it("matches native depth handling and skips sparse slots", () => {
    // biome-ignore lint/suspicious/noSparseArray: Deliberately test native sparse-array semantics.
    const nested = [1, [2, [3]], , 4];
    for (const depth of [undefined, 0, 1, 2, Infinity, -1, NaN, 1.5]) {
      expect(flatArrayFallback.call(nested, depth)).toEqual(nested.flat(depth));
    }
  });
});
