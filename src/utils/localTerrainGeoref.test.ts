import { describe, expect, it } from "vitest";
import { JAPAN_REGION } from "../data/earthRegions";
import { mapPointToLonLat } from "../generators/earthRegionRaster";
import { earthRegionGeoref, georefConsistency, georefLonLatToMap, georefMapToLonLat } from "./localTerrainGeoref";

describe("localTerrainGeoref", () => {
  const geo = earthRegionGeoref(JAPAN_REGION, 1200, 820)!;

  it("matches the generator's own pixel to lon/lat mapping and round-trips", () => {
    const point = georefMapToLonLat(geo, 417, 233);
    expect(point).toEqual(mapPointToLonLat(JAPAN_REGION, 1200, 820, 417, 233));
    const back = georefLonLatToMap(geo, point.lon, point.lat);
    expect(back.x).toBeCloseTo(417, 9);
    expect(back.y).toBeCloseTo(233, 9);
  });

  it("refuses the DEM when too many land cells were edited", () => {
    const cells = Array.from({ length: 20 }, (_, i) => ({ x: i, y: 0, h: 40 }));
    expect(georefConsistency(cells, () => 41).ok).toBe(true);
    expect(georefConsistency(cells, x => (x < 3 ? 60 : 40)).ok).toBe(false);
    expect(georefConsistency([{ x: 0, y: 0, h: 5 }], () => 50).ok).toBe(false);
  });
});
