// M4a — the standalone SiteConfig now carries an editable feature set. Cover the
// population-seeded defaults and the "Randomize site" roll (which must never hand
// a landlocked site a port).

import { describe, expect, it } from "vitest";
import { makeRng } from "../core/prng";
import { DEFAULT_SITE_CONFIG, defaultFeatures, FEATURE_KEYS, randomSiteConfig, siteConfigKey } from "./siteConfig";

describe("defaultFeatures", () => {
  it("scales walls / plaza / shanty with population; temple on, port + citadel off", () => {
    const hamlet = defaultFeatures(800);
    expect(hamlet).toMatchObject({ walls: false, plaza: false, shanty: false });

    const town = defaultFeatures(4_000);
    expect(town).toMatchObject({ walls: true, plaza: true, shanty: false });

    const city = defaultFeatures(12_000);
    expect(city).toMatchObject({ walls: true, plaza: true, shanty: true });

    for (const pop of [500, 3_000, 40_000]) {
      const f = defaultFeatures(pop);
      expect(f.temple).toBe(true);
      expect(f.port).toBe(false);
      expect(f.citadel).toBe(false);
    }
  });

  it("DEFAULT_SITE_CONFIG carries exactly the FEATURE_KEYS", () => {
    expect(Object.keys(DEFAULT_SITE_CONFIG.features).sort()).toEqual([...FEATURE_KEYS].sort());
  });
});

describe("siteConfigKey", () => {
  it("is stable and independent of the feature set (features have no S0–S3 effect yet)", () => {
    const a = { ...DEFAULT_SITE_CONFIG, features: { ...DEFAULT_SITE_CONFIG.features, walls: true, temple: true } };
    const b = { ...DEFAULT_SITE_CONFIG, features: { ...DEFAULT_SITE_CONFIG.features, walls: false, temple: false } };
    expect(siteConfigKey(a)).toEqual(siteConfigKey(b));
    expect(siteConfigKey(DEFAULT_SITE_CONFIG)).toEqual("none|through|flat");
  });
});

describe("randomSiteConfig", () => {
  it("is deterministic per rng seed", () => {
    expect(randomSiteConfig(makeRng("rsc"))).toEqual(randomSiteConfig(makeRng("rsc")));
  });

  it("rolls every feature flag to both values across seeds", () => {
    const seen = new Map(FEATURE_KEYS.map(k => [k, new Set<boolean>()]));
    for (let i = 0; i < 80; i++) {
      const cfg = randomSiteConfig(makeRng(`roll-${i}`));
      for (const k of FEATURE_KEYS) seen.get(k)?.add(cfg.features[k]);
    }
    for (const k of FEATURE_KEYS) expect(seen.get(k)?.size, k).toBe(2);
  });

  it("never rolls a port on a landlocked site, and does roll one when there is a coast", () => {
    let coastalPorts = 0;
    for (let i = 0; i < 120; i++) {
      const cfg = randomSiteConfig(makeRng(`port-${i}`));
      if (cfg.coast === "none") expect(cfg.features.port).toBe(false);
      else if (cfg.features.port) coastalPorts++;
    }
    expect(coastalPorts).toBeGreaterThan(0);
  });
});
