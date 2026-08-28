// M3 — the FMG hand-off path: a real descriptor arriving via sessionStorage or a
// shareable-link fragment must round-trip byte-for-byte and drive the pipeline
// to the same non-empty urban core the synthetic path produces.

import { describe, expect, it } from "vitest";
import { generateCity } from "../core/pipeline";
import { type BurgSiteDescriptor, DESCRIPTOR_VERSION } from "./burgSiteDescriptor";
import { decodeDescriptor, encodeDescriptor, parseDescriptor, resolveIncomingSite, siteLinkFor } from "./incomingSite";
import { DEFAULT_SITE_CONFIG } from "./siteConfig";
import { siteToGeography, siteToParams } from "./siteInput";
import { synthSite } from "./synthSite";

// A synthetic descriptor stands in for a real FMG one — same shape, same
// DESCRIPTOR_VERSION, includes a coast, two rivers and a 17×17 heightfield.
// Normalised through JSON so the fixture equals what actually crosses the wire
// (e.g. `-0` collapses to `0`).
const sample: BurgSiteDescriptor = JSON.parse(
  JSON.stringify(
    synthSite(
      "largeTown",
      { ...DEFAULT_SITE_CONFIG, coast: "bay", rivers: ["through", "toCoast"], relief: true },
      "m3-fixture"
    )
  )
);
const sampleJson = JSON.stringify(sample);

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

  it("rejects a descriptor whose rivers field is not an array", () => {
    expect(parseDescriptor(JSON.stringify({ ...sample, rivers: null }))).toBeNull();
  });
});

describe("encode / decode", () => {
  it("round-trips a descriptor through a base64url token", () => {
    const token = encodeDescriptor(sample);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeDescriptor(token)).toEqual(sample);
  });

  it("siteLinkFor produces a decodable fragment", () => {
    const url = siteLinkFor(sample, "https://example.test/city/");
    const token = url.slice(url.indexOf("#") + 1);
    expect(decodeDescriptor(token)).toEqual(sample);
  });

  it("returns null for a corrupt token", () => {
    expect(decodeDescriptor("!!!!not-base64!!!!")).toBeNull();
  });
});

describe("resolveIncomingSite", () => {
  it("reads a stashed hand-off as origin 'world'", () => {
    expect(resolveIncomingSite({ session: sampleJson })).toEqual({ descriptor: sample, origin: "world" });
  });

  it("reads a fragment payload as origin 'link'", () => {
    const hash = `#${encodeDescriptor(sample)}`;
    expect(resolveIncomingSite({ hash })).toEqual({ descriptor: sample, origin: "link" });
  });

  it("prefers the fragment over the stash", () => {
    const other: BurgSiteDescriptor = JSON.parse(
      JSON.stringify(
        synthSite("smallCity", { ...DEFAULT_SITE_CONFIG, coast: "none", rivers: [], relief: false }, "other")
      )
    );
    const resolved = resolveIncomingSite({ hash: `#${encodeDescriptor(other)}`, session: sampleJson });
    expect(resolved).toEqual({ descriptor: other, origin: "link" });
  });

  it("falls through to the stash when the fragment is junk", () => {
    expect(resolveIncomingSite({ hash: "#not-a-real-token", session: sampleJson })).toEqual({
      descriptor: sample,
      origin: "world"
    });
  });

  it("returns null when nothing is present", () => {
    expect(resolveIncomingSite({})).toBeNull();
    expect(resolveIncomingSite({ hash: "", session: null })).toBeNull();
  });
});

describe("pipeline on a decoded descriptor", () => {
  it("produces a tagged, non-empty urban core", () => {
    const descriptor = decodeDescriptor(encodeDescriptor(sample));
    expect(descriptor).not.toBeNull();
    const result = generateCity(siteToParams(descriptor!), siteToGeography(descriptor!));
    const finalTags = result.steps[result.steps.length - 1].cells.map(c => c.tag);
    expect(finalTags.filter(t => t === "urban").length).toBeGreaterThan(0);
    expect(finalTags.every(t => ["sea", "urban", "outskirts", "rural", "land"].includes(t))).toBe(true);
  });

  it("re-rolls the layout when the seed is overridden, geography held fixed", () => {
    const base = siteToParams(sample);
    const a = generateCity({ ...base, seed: "roll-a" }, siteToGeography(sample));
    const b = generateCity({ ...base, seed: "roll-b" }, siteToGeography(sample));
    const cellsOf = (r: typeof a) => JSON.stringify(r.cells.map(c => c.polygon));
    expect(cellsOf(a)).not.toEqual(cellsOf(b));
  });
});
