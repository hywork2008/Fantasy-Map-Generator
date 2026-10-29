import { describe, expect, it } from "vitest";
import { DESCRIPTOR_VERSION } from "../../data/siteDescriptor";
import { createGridDocument } from "../../generators/document";
import { DEFAULT_SITE_CONFIG } from "../../generators/site/siteConfig";
import { synthSite } from "../../generators/site/synthSite";
import {
  buildShare,
  CITY_EDITOR_SHARE_KIND,
  cityLinkFor,
  decodeShare,
  encodeShare,
  parseDescriptor,
  parseIncomingPayload,
  resolveIncomingCity,
  shareFromDescriptor
} from "./incomingCity";
import { cityEditorDocument } from "./shareRequest";

const sample = JSON.parse(
  JSON.stringify(
    synthSite(
      "largeTown",
      { ...DEFAULT_SITE_CONFIG, coast: "bay", rivers: ["through", "toCoast"], relief: true },
      "m3-fixture",
      { extentMeters: 1200, cityRadiusMeters: 396 }
    )
  )
);
const sampleJson = JSON.stringify(sample);

function encodeJson(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

describe("parseDescriptor", () => {
  it("accepts a well-formed descriptor", () => {
    expect(parseDescriptor(sampleJson)).toEqual(sample);
  });

  it("rejects non-JSON", () => {
    expect(parseDescriptor("{not json")).toBeNull();
  });

  it("rejects an unknown version", () => {
    const stale = JSON.stringify({ ...sample, version: DESCRIPTOR_VERSION + 1 });
    expect(parseDescriptor(stale)).toBeNull();
  });

  it("rejects a descriptor missing the frame", () => {
    const { frame: _drop, ...rest } = sample;
    expect(parseDescriptor(JSON.stringify(rest))).toBeNull();
  });

  it("keeps a guild chapter that has no craftsmen", () => {
    const guild = {
      domain: "textiles",
      status: "chapter",
      practitioners: 0,
      prestige: 0.25,
      foundedYear: 1190
    };
    const parsed = parseDescriptor(
      JSON.stringify({
        ...sample,
        economy: {
          version: 1,
          year: 1348,
          commerce: { rank: 0.2, marketCenter: true, merchantHouse: null, mint: false, caravanArrivalRank: 0.2 },
          guilds: [guild]
        }
      })
    );
    expect(parsed?.economy?.guilds).toEqual([guild]);
    expect(parsed?.economy?.year).toBe(1348);
  });

  it("drops an economy block that is not a profile", () => {
    const parsed = parseDescriptor(JSON.stringify({ ...sample, economy: { guilds: "none" } }));
    expect(parsed?.economy).toBeUndefined();
  });
});

describe("share codec", () => {
  it("preserves fractional rotation and normalizes full turns without losing automatic orientation", () => {
    for (const [rotation, expected] of [
      [37.5, 37.5],
      [360, 0],
      [-90, 270],
      [undefined, undefined],
      ["invalid", undefined]
    ]) {
      const share = buildShare({
        seed: "rotation",
        grid: "hex",
        size: "micro",
        settings: { config: DEFAULT_SITE_CONFIG }
      });
      const decoded = decodeShare(
        encodeShare({ ...share, settings: { ...share.settings, elevationRotation: rotation } })
      );
      expect(decoded?.settings.elevationRotation).toBe(expected);
    }
  });

  it("clamps elevation relief and keeps the share when the value is not a number", () => {
    const share = buildShare({
      seed: "relief",
      grid: "hex",
      size: "micro",
      settings: { config: DEFAULT_SITE_CONFIG, elevationPreset: "slope", elevationRelief: 8.4 }
    });
    expect(decodeShare(encodeShare(share))?.settings.elevationRelief).toBe(8);
    const text = { ...share, settings: { ...share.settings, elevationRelief: "steep" } };
    const decoded = decodeShare(encodeShare(text));
    expect(decoded).not.toBeNull();
    expect(decoded?.settings.elevationRelief).toBeUndefined();
    expect(decoded?.settings.elevationPreset).toBe("slope");
    const deep = buildShare({
      seed: "river-drop",
      grid: "hex",
      size: "micro",
      settings: { config: DEFAULT_SITE_CONFIG, riverDropMeters: 100.4 }
    });
    expect(decodeShare(encodeShare(deep))?.settings.riverDropMeters).toBe(100);
  });

  it("preserves independent moat options in share links", () => {
    const share = buildShare({
      seed: "moats",
      grid: "evolution",
      size: "tiny",
      settings: { config: DEFAULT_SITE_CONFIG, moats: { town: true, castle: false } }
    });
    expect(decodeShare(encodeShare(share))?.settings.moats).toEqual({ town: true, castle: false });
  });
  it("preserves terraces and rejects a terrace step that is not positive", () => {
    const share = buildShare({
      seed: "terraces",
      grid: "evolution",
      size: "tiny",
      settings: { config: DEFAULT_SITE_CONFIG, terraces: { stepMeters: 3.5 } }
    });
    expect(decodeShare(encodeShare(share))?.settings.terraces).toEqual({ stepMeters: 3.5 });
    const fieldShare = {
      ...share,
      settings: { ...share.settings, terrainField: { template: "crag" as const, sampleMeters: 2 } }
    };
    expect(decodeShare(encodeShare(fieldShare))?.settings.terrainField).toEqual({ template: "crag", sampleMeters: 2 });
    const brokenField = { ...share, settings: { ...share.settings, terrainField: { template: "mesa" } } };
    expect(decodeShare(encodeShare(brokenField))).toBeNull();
    const broken = { ...share, settings: { ...share.settings, terraces: { stepMeters: 0 } } };
    expect(decodeShare(encodeShare(broken))).toBeNull();
  });

  it("compresses and restores the exact input mesh and failed checkpoint", () => {
    const input = createGridDocument({ size: "micro", grid: "voronoi", seed: "original-grid" });
    const share = buildShare({
      seed: "different-town",
      gridSeed: "wrong-grid",
      grid: "voronoi",
      size: "micro",
      settings: { config: DEFAULT_SITE_CONFIG, townWallRings: "double" },
      input,
      stage: "innerWall",
      debugFailure: true
    });
    const token = encodeShare(share);
    expect(token.startsWith("gz.")).toBe(true);
    expect(token.length).toBeLessThan(JSON.stringify(share).length);
    const restored = decodeShare(token)!;
    expect(restored.stage).toBe("innerWall");
    expect(restored.debugFailure).toBe(true);
    expect(cityEditorDocument(restored)).toEqual(input);
    expect(decodeShare("gz.not-gzip")).toBeNull();
    expect(parseIncomingPayload(JSON.stringify({ ...share, input: { invalid: true } }))).toBeNull();
    expect(parseIncomingPayload(JSON.stringify({ ...share, stage: "unknown" }))).toBeNull();
  });

  it("round-trips a City Editor share through a base64url token", () => {
    const share = buildShare({
      seed: "town-a",
      grid: "hex",
      size: "small",
      hexSizeMeters: 50,
      gridSeed: "grid-a",
      settings: { config: DEFAULT_SITE_CONFIG },
      descriptor: sample
    });
    const token = encodeShare(share);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeShare(token)).toEqual(JSON.parse(JSON.stringify(share)));
  });

  it.each(["auto", "organic", "classic", "circulade", "bram"] as const)("preserves the %s morphology", layout => {
    const share = buildShare({
      seed: "morphology",
      grid: "evolution",
      size: "tiny",
      settings: { config: DEFAULT_SITE_CONFIG, layout }
    });
    expect(decodeShare(encodeShare(share))?.settings.layout).toBe(layout);
  });

  it("round-trips a Tiny map-size share", () => {
    const share = buildShare({
      seed: "tiny-town",
      grid: "evolution",
      size: "tiny",
      settings: { config: DEFAULT_SITE_CONFIG }
    });
    expect(decodeShare(encodeShare(share))).toEqual(JSON.parse(JSON.stringify(share)));
  });

  it("preserves the historical period used to place cemeteries", () => {
    const share = buildShare({
      seed: "cemetery-period",
      grid: "evolution",
      size: "tiny",
      settings: { config: structuredClone(DEFAULT_SITE_CONFIG), historicalPeriod: "steamEra" }
    });
    expect(decodeShare(encodeShare(share))?.settings.historicalPeriod).toBe("steamEra");
  });

  it("wraps a City Generator descriptor token as a share", () => {
    const decoded = decodeShare(encodeJson(sample));
    expect(decoded).not.toBeNull();
    expect(decoded?.descriptor).toEqual(sample);
    expect(decoded?.seed).toBe(sample.burg.seed);
    expect(decoded?.grid).toBe("evolution");
    expect(decoded?.kind).toBe(CITY_EDITOR_SHARE_KIND);
  });

  it("cityLinkFor produces a decodable fragment", () => {
    const share = shareFromDescriptor(sample);
    expect(cityEditorDocument(share).showElevationTint).toBe(false);
    const url = cityLinkFor(share, "https://example.test/city-editor/");
    const token = url.slice(url.indexOf("#") + 1);
    expect(decodeShare(token)?.descriptor).toEqual(sample);
  });

  it("returns null for a corrupt token", () => {
    expect(decodeShare("!!!!not-base64!!!!")).toBeNull();
  });

  it("parseIncomingPayload accepts either a share or a raw descriptor", () => {
    expect(parseIncomingPayload(sampleJson)?.descriptor).toEqual(sample);
    const share = shareFromDescriptor(sample);
    expect(parseIncomingPayload(JSON.stringify(share))).toEqual(JSON.parse(JSON.stringify(share)));
  });
});

describe("resolveIncomingCity", () => {
  it("reads a stashed descriptor as origin 'world'", () => {
    const resolved = resolveIncomingCity({ session: sampleJson });
    expect(resolved?.origin).toBe("world");
    expect(resolved?.share.descriptor).toEqual(sample);
  });

  it("reads a fragment payload as origin 'link'", () => {
    const hash = `#${encodeShare(shareFromDescriptor(sample))}`;
    const resolved = resolveIncomingCity({ hash });
    expect(resolved?.origin).toBe("link");
    expect(resolved?.share.descriptor).toEqual(sample);
  });

  it("prefers the fragment over the stash", () => {
    const other = JSON.parse(
      JSON.stringify(
        synthSite("smallCity", { ...DEFAULT_SITE_CONFIG, coast: "none", rivers: [] }, "other", {
          extentMeters: 1200,
          cityRadiusMeters: 396
        })
      )
    );
    const resolved = resolveIncomingCity({
      hash: `#${encodeJson(other)}`,
      session: sampleJson
    });
    expect(resolved?.share.descriptor).toEqual(other);
    expect(resolved?.origin).toBe("link");
  });

  it("falls through to the stash when the fragment is junk", () => {
    const resolved = resolveIncomingCity({ hash: "#not-a-real-token", session: sampleJson });
    expect(resolved?.origin).toBe("world");
    expect(resolved?.share.descriptor).toEqual(sample);
  });

  it("returns null when nothing is present", () => {
    expect(resolveIncomingCity({})).toBeNull();
    expect(resolveIncomingCity({ hash: "", session: null })).toBeNull();
  });
});

describe("river placement sharing", () => {
  for (const placement of ["outside", "outsideNear"] as const) {
    it(`preserves ${placement} through a shared link`, () => {
      const share = buildShare({
        seed: "outside",
        grid: "hex",
        size: "small",
        settings: { config: structuredClone(DEFAULT_SITE_CONFIG), riverPlacement: placement }
      });
      expect(decodeShare(encodeShare(share))?.settings.riverPlacement).toBe(placement);
    });
  }
});

describe("mandatory local site bounds", () => {
  function descriptor(bounds?: { minX: number; minY: number; maxX: number; maxY: number }) {
    return {
      ...sample,
      frame: {
        ...sample.frame,
        extentMeters: 1500,
        cityRadiusMeters: 80,
        ...(bounds ? { requiredBounds: bounds } : {})
      }
    };
  }
  it("retains distant near-bank terrain without shifting origin or enlarging town radius", () => {
    const d = descriptor({ minX: -700, minY: -20, maxX: -600, maxY: 40 });
    const share = shareFromDescriptor(d);
    expect(share.descriptor!.frame).toEqual(d.frame);
    expect(share.size).toBe("small");
    expect(share.patchParams?.nPatches).toBe(6);
    expect(share.measureBlockSize).toBe(true);
    expect(decodeShare(encodeShare(share))!.descriptor!.frame).toEqual(d.frame);
  });
  it("still fits a hamlet when all mandatory points fit the smaller frame", () => {
    const d = descriptor({ minX: -10, minY: -10, maxX: 10, maxY: 10 });
    const fitted = shareFromDescriptor(d).descriptor!;
    expect(fitted.frame.extentMeters).toBeLessThan(1500);
    expect(fitted.frame.requiredBounds).toEqual(d.frame.requiredBounds);
    expect(fitted.frame.cityRadiusMeters).toBe(80);
  });
  it("rejects inverted, nonfinite, overflowing or out-of-frame bounds", () => {
    for (const bounds of [
      null,
      { minX: 2, minY: 0, maxX: 1, maxY: 0 },
      { minX: -800, minY: 0, maxX: 0, maxY: 0 },
      { minX: 0, minY: 0, maxX: 1e308, maxY: 0 },
      { minX: 0, minY: 0, maxX: Infinity, maxY: 0 }
    ]) {
      const d = descriptor();
      d.frame.requiredBounds = bounds;
      expect(parseDescriptor(JSON.stringify(d))).toBeNull();
    }
  });
});
