import { describe, expect, it } from "vitest";
import { vertexHandleRadius } from "./svg";

describe("vertexHandleRadius", () => {
  it("interpolates from r=8 at ×1 to r=2 at ×20", () => {
    expect(vertexHandleRadius(1)).toBe(8);
    expect(vertexHandleRadius(20)).toBe(2);
    expect(vertexHandleRadius(10.5)).toBe(5);
    expect(vertexHandleRadius(100)).toBe(2);
  });
});
