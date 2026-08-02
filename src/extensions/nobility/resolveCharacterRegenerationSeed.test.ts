import { describe, expect, it } from "vitest";
import { resolveCharacterRegenerationSeed } from "./resolveCharacterRegenerationSeed";

describe("resolveCharacterRegenerationSeed", () => {
  it("returns the map seed for mapSeed entropy", () => {
    expect(resolveCharacterRegenerationSeed("mapSeed", "abc123")).toBe("abc123");
  });

  it("mixes map seed with a timestamp for mixTime entropy", () => {
    const resolved = resolveCharacterRegenerationSeed("mixTime", "abc123");
    expect(resolved.startsWith("abc123:")).toBe(true);
    expect(resolved).not.toBe("abc123");
  });

  it("produces a distinct seed for random entropy", () => {
    const a = resolveCharacterRegenerationSeed("random", "abc123");
    const b = resolveCharacterRegenerationSeed("random", "abc123");
    expect(a.startsWith("abc123:r:")).toBe(true);
    expect(b.startsWith("abc123:r:")).toBe(true);
    expect(a).not.toBe(b);
  });
});
