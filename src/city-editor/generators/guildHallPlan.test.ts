import { describe, expect, it } from "vitest";
import { guildHallPlan } from "./guildHallPlan";

const chapters = ["textiles", "leather", "metallurgy", "woodworking", "victualling", "brewing", "baking"].map(
  (domain, i) => ({ domain, practitioners: 40 - i * 5 })
);

describe("guild halls by culture and town size (docs/plan/bv-workhome-facade-variation.md §6.1 W5a)", () => {
  it("gives an English town one guildhall, kept by its leading trade, and craft halls only from 10,000 people", () => {
    expect(guildHallPlan("atlantic", 2000, chapters)).toEqual([{ kind: "town", domains: ["textiles"] }]);
    expect(guildHallPlan("atlantic", 300, [])).toEqual([{ kind: "town", domains: [] }]);
    expect(guildHallPlan("atlantic", 10000, chapters).map(h => h.kind)).toEqual(["town", "craft", "craft"]);
  });

  it("gives a German town's leading guilds shared town houses from 2,000 people, one for each 1,250", () => {
    expect(guildHallPlan("northern-urban", 1999, chapters)).toEqual([]);
    const houses = guildHallPlan("northern-urban", 5000, chapters);
    expect(houses.map(h => h.domains[0])).toEqual(["textiles", "leather", "metallurgy", "woodworking"]);
    expect(houses.flatMap(h => h.domains).sort()).toEqual(chapters.map(c => c.domain).sort());
    expect(houses.every(h => h.kind === "zunft")).toBe(true);
  });

  it("leaves a Mediterranean town's guilds in their church chapels below 10,000 people", () => {
    expect(guildHallPlan("mediterranean", 9999, chapters)).toEqual([]);
    expect(guildHallPlan("mediterranean", 20000, chapters)).toHaveLength(2);
  });
});
