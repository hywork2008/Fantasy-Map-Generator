import { describe, expect, it } from "vitest";
import { EMPTY_FILTER, entryFacets, entryMatches, parseFilter, serializeFilter } from "./catalogueIndex";

describe("catalogue filter", () => {
  it("resolves entries from every registry and leaves unknown ids unclassified", () => {
    expect(entryFacets("medieval-trade-workshop.dedicated-horse-mill")?.uses).toEqual(["milling"]);
    expect(entryFacets("chartres")?.kind).toBe("structure");
    expect(entryFacets("white-tower")?.uses).toContain("fortification");
    expect(entryFacets("airship")?.kind).toBe("vehicle");
    expect(entryFacets("barbican-horseshoe")?.uses).toContain("fortification");
    expect(entryFacets("ship-of-the-line")?.kind).toBe("ship");
    expect(entryFacets("no-such-model")).toBeUndefined();
    expect(entryFacets(undefined)).toBeUndefined();
  });

  it("matches kinds, overlapping periods, any-region models and uses", () => {
    const airship = entryFacets("airship")!,
      trireme = entryFacets("trireme")!,
      spring = entryFacets("spring")!;
    const filter = { ...EMPTY_FILTER, from: "steamEra", to: "petroleumEra" } as const;
    expect(entryMatches(airship, "Airship", filter)).toBe(true);
    expect(entryMatches(trireme, "Trireme", filter)).toBe(false);
    expect(entryMatches(airship, "Airship", { ...EMPTY_FILTER, kinds: ["ship"] })).toBe(false);
    expect(entryMatches(spring, "Spring", { ...EMPTY_FILTER, regions: ["east-asian"] })).toBe(true);
    expect(entryMatches(trireme, "Trireme", { ...EMPTY_FILTER, regions: ["east-asian"] })).toBe(false);
    expect(entryMatches(trireme, "Trireme", { ...EMPTY_FILTER, uses: ["military"] })).toBe(true);
    expect(entryMatches(undefined, "Unknown", EMPTY_FILTER)).toBe(true);
    expect(entryMatches(undefined, "Unknown", { ...EMPTY_FILTER, kinds: ["prop"] })).toBe(false);
    expect(entryMatches(trireme, "Trireme · Olympias", { ...EMPTY_FILTER, query: "olymp" })).toBe(true);
  });

  it("round-trips the URL query and keeps unrelated parameters", () => {
    const filter = parseFilter("?kind=vehicle,bogus&from=steamEra&region=european&use=aviation&q=air&model=x");
    expect(filter).toEqual({
      kinds: ["vehicle"],
      from: "steamEra",
      regions: ["european"],
      uses: ["aviation"],
      query: "air"
    });
    expect(serializeFilter(filter, "?model=x")).toBe(
      "?model=x&kind=vehicle&from=steamEra&region=european&use=aviation&q=air"
    );
    expect(serializeFilter(EMPTY_FILTER, "?kind=ship")).toBe("");
  });
});
