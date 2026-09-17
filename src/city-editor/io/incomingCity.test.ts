import { describe, expect, it } from "vitest";
import { DESCRIPTOR_VERSION } from "../core/gen/site/burgSiteDescriptor";
import { DEFAULT_SITE_CONFIG } from "../core/gen/site/siteConfig";
import { synthSite } from "../core/gen/site/synthSite";
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
});

describe("share codec", () => {
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
