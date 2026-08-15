import { describe, expect, it } from "vitest";
import { Names } from "./names-generator";

describe("fantasy race name bases", () => {
  it("defines Infernal and Beastfolk bases at stable ids 43 and 44", () => {
    const bases = Names.getNameBases();
    expect(bases[43]?.name).toBe("Infernal");
    expect(bases[43]?.i).toBe(43);
    expect(bases[44]?.name).toBe("Beastfolk");
    expect(bases[44]?.i).toBe(44);
    expect(bases[43]?.b.split(",").length).toBeGreaterThan(80);
    expect(bases[44]?.b.split(",").length).toBeGreaterThan(80);
  });
});
