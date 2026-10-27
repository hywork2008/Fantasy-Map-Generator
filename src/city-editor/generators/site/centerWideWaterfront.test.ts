import { expect, it } from "vitest";
import share from "../../data/fixtures/amerford-20261027.json";
import type { BurgSiteDescriptor } from "../../types/contracts/burgSiteDescriptor";
import { terrainHeight } from "../castlePlacement";
import { pointInPolygon } from "../geom";
import { centerWideWaterfront } from "./centerWideWaterfront";
import { siteToGeography } from "./siteInput";

it("reframes Amerford without changing river widths or the coast/river relationship", () => {
  const source = structuredClone(share.descriptor) as BurgSiteDescriptor;
  const before = structuredClone(source);
  const next = centerWideWaterfront(source);
  const offset = next.frame.urbanCenterOffsetMeters!;
  expect(offset).toBeDefined();
  expect(source).toEqual(before);
  expect(centerWideWaterfront(next)).toBe(next);
  expect(next.burg.waterAccess).toEqual(source.burg.waterAccess);
  expect(next.rivers[0].widthMeters).toBe(source.rivers[0].widthMeters);
  for (const [i, line] of next.waterbody!.shoreline.entries())
    for (const [j, p] of line.entries()) {
      expect(p[0] + offset[0]).toBeCloseTo(source.waterbody!.shoreline[i][j][0]);
      expect(p[1] + offset[1]).toBeCloseTo(source.waterbody!.shoreline[i][j][1]);
    }
  for (const [i, line] of next.rivers[0].rightBankSegments.entries())
    for (const [j, p] of line.entries()) {
      expect(p[0] + offset[0]).toBeCloseTo(source.rivers[0].rightBankSegments[i][j][0]);
      expect(p[1] + offset[1]).toBeCloseTo(source.rivers[0].rightBankSegments[i][j][1]);
    }
  expect(siteToGeography(next).channels!.some(channel => pointInPolygon([0, 0], channel.polygon))).toBe(false);
  expect(next.frame.extentMeters).toBeLessThan(source.rivers[0].widthMeters);
});

it("resamples terrain at the same world positions as the reframed water", () => {
  const source = structuredClone(share.descriptor) as BurgSiteDescriptor;
  const field = source.terrain.heightfield;
  field.elevationsMeters = field.elevationsMeters.map((_, i) => (i % field.size) + Math.floor(i / field.size) * 2);
  const next = centerWideWaterfront(source);
  const [x, y] = next.frame.urbanCenterOffsetMeters!;
  expect(terrainHeight(next.terrain, [0, 0])).toBeCloseTo(terrainHeight(source.terrain, [x, y])!);
});
