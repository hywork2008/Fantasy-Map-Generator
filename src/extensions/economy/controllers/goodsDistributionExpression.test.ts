import { describe, expect, it } from "vitest";
import { generateExpression, parseExpression } from "./goodsDistributionExpression";

describe("goods distribution expressions", () => {
  it("round-trips biome tags and coastal habitat predicates", () => {
    const expression = 'coastalHabitat("tidalFlat") || biomeTag("wetland") && nearshoreHabitat("seagrassMeadow")';

    const parsed = parseExpression(expression);

    expect(parsed).not.toBeNull();
    expect(generateExpression(parsed!)).toBe(
      'coastalHabitat("tidalFlat") || (biomeTag("wetland") && nearshoreHabitat("seagrassMeadow"))'
    );
  });
});
