import { describe, expect, it } from "vitest";
import type { RegionalContext } from "../../types/cityRegional";
import {
  decodeShare,
  encodeShare,
  parseDescriptor,
  resolveIncomingCity,
  shareFromDescriptor
} from "../io/incomingCity";
import { renderCityPreviewSvg } from "../render/previewSvg";
import { renderStandaloneCitySvg } from "../render/svg";
import { createDocument, createGridDocument, descriptorFrameGridOptions, parseDocument } from "./document";
import { buildCityBuildings } from "./gen/buildingLots";
import { DEFAULT_SITE_CONFIG } from "./gen/site/siteConfig";
import { synthSite } from "./gen/site/synthSite";
import { defaultGenerationSettings, generateCityOnDocument } from "./generate";
import { DocumentHistory } from "./history";
import { attachSceneRegions } from "./sceneRegions";

const region: RegionalContext = {
  version: 1,
  sourceRevision: "snapshot-1",
  roads: [],
  coverageBounds: { minX: -2400, minY: -2400, maxX: 2400, maxY: 2400 },
  settlements: [{ burgId: 99, name: "North town", center: [1500, 1500], radiusMeters: 80, representation: "estimated" }]
};

describe("FMG regional snapshots", () => {
  it("validates new inputs, preserves version 2 and rejects damaged regional data", () => {
    const site = synthSite("largeTown", DEFAULT_SITE_CONFIG, "regional");
    expect(parseDescriptor(JSON.stringify({ ...site, version: 2 }))).not.toBeNull();
    expect(() => resolveIncomingCity({ session: JSON.stringify({ ...site, regionalContext: {} }) })).toThrow(
      "FMG地域データ"
    );
    const incoming = parseDescriptor(JSON.stringify({ ...site, version: 3, regionalContext: region }))!;
    expect(incoming.frame.regionalMode).toBe(true);
    expect(decodeShare(encodeShare(shareFromDescriptor(incoming)))?.descriptor?.regionalContext).toEqual(region);
    expect(
      parseDescriptor(JSON.stringify({ ...site, regionalContext: { ...region, settlements: [{ center: [NaN, 0] }] } }))
    ).toBeNull();
  });

  it("round-trips geography and undo/redo without touching existing edited cells", () => {
    const city = createDocument("snapshot", 400);
    const originalMesh = JSON.stringify(city.mesh);
    attachSceneRegions(city, region);
    expect(JSON.stringify(city.mesh)).toBe(originalMesh);
    const restored = parseDocument(JSON.stringify(city))!;
    expect(restored.sceneRegions).toEqual(city.sceneRegions);
    const history = new DocumentHistory(restored);
    const changed = structuredClone(restored);
    changed.sceneRegions!.regionalContext.sourceRevision = "snapshot-2";
    history.commit(changed);
    expect(history.undo().sceneRegions?.regionalContext.sourceRevision).toBe("snapshot-1");
    expect(history.redo().sceneRegions?.regionalContext.sourceRevision).toBe("snapshot-2");
    const bad = structuredClone(city);
    bad.sceneRegions!.coreBoundary = [[Infinity, 0]];
    expect(parseDocument(JSON.stringify(bad))).toBeNull();
  });

  it("keeps central cells identical when only the regional display window grows", () => {
    const frame = { cityRadiusMeters: 350, extentMeters: 2400, regionalMode: true };
    const small = createGridDocument({
      size: "medium",
      grid: "evolution",
      seed: "region-grid",
      ...descriptorFrameGridOptions(frame)
    });
    const large = createGridDocument({
      size: "large",
      grid: "evolution",
      seed: "region-grid",
      ...descriptorFrameGridOptions({ ...frame, extentMeters: 4800 })
    });
    expect(large.mesh).toEqual(small.mesh);
    expect(large.frame.settlementExtentMeters).toBe(small.frame.settlementExtentMeters);
  });

  it("keeps generated housing counts independent of regional display extent", () => {
    const cities = [2400, 4800].map(extentMeters => {
      const descriptor = synthSite(
        "largeTown",
        { ...DEFAULT_SITE_CONFIG, coast: "none", rivers: [] },
        "region-housing",
        { extentMeters: 2400, cityRadiusMeters: 350 }
      );
      descriptor.frame.extentMeters = extentMeters;
      descriptor.regionalContext = structuredClone(region);
      descriptor.frame.regionalMode = true;
      const share = shareFromDescriptor(descriptor);
      const input = createGridDocument({
        size: share.size,
        grid: share.grid,
        seed: share.seed,
        patchParams: share.patchParams,
        measureBlockSize: share.measureBlockSize,
        ...descriptorFrameGridOptions(descriptor.frame)
      });
      const city = generateCityOnDocument(input, { ...defaultGenerationSettings(), descriptor }, share.seed, () => {});
      expect(city).not.toBeNull();
      return city!;
    });
    expect(Object.keys(cities[1].mesh.faces)).toHaveLength(Object.keys(cities[0].mesh.faces).length);
    expect(buildCityBuildings(cities[1])).toHaveLength(buildCityBuildings(cities[0]).length);
  });

  it("uses the same geographic symbols in preview and detailed exports with a single Y reversal", () => {
    const city = createDocument("regional-render", 400);
    city.appearance = "town";
    attachSceneRegions(city, region);
    const preview = renderCityPreviewSvg(city);
    const detailed = renderStandaloneCitySvg(city);
    expect(preview.querySelector(".ce-regional-settlements")!.outerHTML).toBe(
      detailed.querySelector(".ce-regional-settlements")!.outerHTML
    );
    expect(preview.querySelector("[data-regional-burg] text")?.getAttribute("y")).toBe("-1588");
    expect(preview.querySelectorAll(".ce-regional-layer [data-face]")).toHaveLength(0);
  });
});
