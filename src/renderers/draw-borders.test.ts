import { describe, expect, it } from "vitest";
import { isStateBorder } from "./draw-borders";

describe("isStateBorder", () => {
  it("does not render the frontier between a State and unclaimed land as a State border", () => {
    expect(isStateBorder(2, 0, true)).toBe(false);
  });

  it("renders a shared land boundary once, from the higher State id", () => {
    expect(isStateBorder(2, 1, true)).toBe(true);
    expect(isStateBorder(1, 2, true)).toBe(false);
  });

  it("does not render a State border along water", () => {
    expect(isStateBorder(2, 1, false)).toBe(false);
  });
});
