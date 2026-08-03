import { describe, expect, it } from "vitest";
import { STATE_EXPAND_DANGER_BAN } from "./dangerExpandPolicy";
import {
  allowsFrontierOutpost,
  assignWildLandTags,
  classifyWildLand,
  WILD_LAND,
  WILD_LAND_MARGIN_DANGER_MIN
} from "./wildLandTags";

describe("classifyWildLand", () => {
  it("marks ocean and governed land as none", () => {
    expect(classifyWildLand(10, 0, 0)).toBe(WILD_LAND.none);
    expect(classifyWildLand(30, 2, 90)).toBe(WILD_LAND.none);
  });

  it("splits unclaimed land by danger", () => {
    expect(classifyWildLand(30, 0, 0)).toBe(WILD_LAND.claimable);
    expect(classifyWildLand(30, 0, WILD_LAND_MARGIN_DANGER_MIN)).toBe(WILD_LAND.margin);
    expect(classifyWildLand(30, 0, STATE_EXPAND_DANGER_BAN)).toBe(WILD_LAND.monster);
  });
});

describe("assignWildLandTags", () => {
  it("writes tags and forbids outposts on margin/monster", () => {
    const cells = {
      i: new Uint16Array([0, 1, 2, 3]),
      h: new Uint8Array([25, 25, 25, 10]),
      state: new Uint16Array([0, 0, 1, 0]),
      danger: new Uint8Array([0, 40, 0, 0])
    };
    const tags = assignWildLandTags(cells);
    expect(tags[0]).toBe(WILD_LAND.claimable);
    expect(tags[1]).toBe(WILD_LAND.margin);
    expect(tags[2]).toBe(WILD_LAND.none);
    expect(tags[3]).toBe(WILD_LAND.none);
    expect(allowsFrontierOutpost(tags[0])).toBe(true);
    expect(allowsFrontierOutpost(tags[1])).toBe(false);
  });
});
