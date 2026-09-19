// M4a — CityProgram wiring. `generateCity` gained a third argument, but the
// programme only bites from S3 onward: the default (all false) must leave the
// S0–S3 result byte-for-byte what it was before the argument existed. `walls` is
// the one flag M4a actually consumes — it compacts the urban core.

import { describe, expect, it } from "vitest";
import { DEFAULT_SITE_CONFIG, type SiteConfig } from "../site/siteConfig";
import { siteToGeography, siteToParams } from "../site/siteInput";
import { synthSite } from "../site/synthSite";
import { generateCity } from "./pipeline";
import { type CityProgram, DEFAULT_PROGRAM } from "./types";

const CONFIGS: Record<string, SiteConfig> = {
  river: { ...DEFAULT_SITE_CONFIG, coast: "none", rivers: ["through"], relief: false },
  harbor: { ...DEFAULT_SITE_CONFIG, coast: "bay", rivers: [], relief: false },
  dry: { ...DEFAULT_SITE_CONFIG, coast: "none", rivers: [], relief: false }
};

function run(cfg: SiteConfig, seed: string, program?: CityProgram): ReturnType<typeof generateCity> {
  const site = synthSite("smallCity", cfg, seed);
  return generateCity(siteToParams(site), siteToGeography(site), program);
}

function urbanIds(r: ReturnType<typeof generateCity>): Set<number> {
  const last = r.steps[r.steps.length - 1];
  const ids = new Set<number>();
  last.cells.forEach((c, i) => {
    if (c.tag === "urban") ids.add(r.cells[i].id);
  });
  return ids;
}

const ALL_ON: CityProgram = {
  walls: true,
  citadel: true,
  plaza: true,
  temple: true,
  port: true,
  shanty: true,
  capital: true
};

describe("CityProgram — M4a wiring", () => {
  it("an all-false programme is identical to omitting the argument", () => {
    for (const [name, cfg] of Object.entries(CONFIGS)) {
      for (const seed of ["p1", "p2"]) {
        const omitted = JSON.stringify(run(cfg, seed));
        const explicit = JSON.stringify(run(cfg, seed, DEFAULT_PROGRAM));
        expect(explicit, `${name}/${seed}`).toEqual(omitted);
      }
    }
  }, 20_000);

  it("walls:true tightens the urban core to a strict, non-empty subset", () => {
    for (const [name, cfg] of Object.entries(CONFIGS)) {
      for (const seed of ["w1", "w2", "w3"]) {
        const open = urbanIds(run(cfg, seed));
        const walled = urbanIds(run(cfg, seed, { ...DEFAULT_PROGRAM, walls: true }));
        expect(walled.size, `${name}/${seed} non-empty`).toBeGreaterThan(5);
        expect(walled.size, `${name}/${seed} smaller`).toBeLessThan(open.size);
        for (const id of walled) expect(open.has(id), `${name}/${seed} subset`).toBe(true);
      }
    }
  });

  it("purely-S4/S6 features leave the S0–S3 snapshots unchanged", () => {
    // `port` is intentionally excluded: like `walls`, it feeds S3 an extra
    // sea-ward bearing so the built-up area reaches the harbour (design §4.5).
    for (const [name, cfg] of Object.entries(CONFIGS)) {
      const base = JSON.stringify(run(cfg, "inert").steps.slice(0, 4));
      for (const flag of ["citadel", "plaza", "temple", "shanty", "capital"] as const) {
        const flipped = JSON.stringify(run(cfg, "inert", { ...DEFAULT_PROGRAM, [flag]: true }).steps.slice(0, 4));
        expect(flipped, `${name}/${flag}`).toEqual(base);
      }
    }
  });

  it("is deterministic in (params, geo, programme)", () => {
    for (const cfg of Object.values(CONFIGS)) {
      expect(JSON.stringify(run(cfg, "det", ALL_ON))).toEqual(JSON.stringify(run(cfg, "det", ALL_ON)));
    }
  });
});
