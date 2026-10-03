import { describe, expect, it } from "vitest";
import { nearestOnPolyline, pointInPolygon } from "../geom";
import { DEFAULT_SITE_CONFIG } from "./siteConfig";
import { resolveWallPlan, siteToGeography, siteToProgram } from "./siteInput";
import { synthSite } from "./synthSite";

describe("independent sea defenses", () => {
  it.each([
    { capital: false, citadel: false },
    { capital: true, citadel: false },
    { capital: false, citadel: true },
    { capital: true, citadel: true }
  ])("leaves a harbour open regardless of capital=$capital / castle=$citadel", flags => {
    const site = synthSite("smallTown", { ...DEFAULT_SITE_CONFIG, coast: "bay" }, "sea-defense");
    Object.assign(site.burg, { walls: true, port: true, ...flags });
    const program = siteToProgram(site);
    expect(program.wallPlan?.coast).toBe("open");
    expect(resolveWallPlan(program.wallPlan!, { coast: "seaWall" }).coast).toBe("seaWall");
    site.burg.port = false;
    expect(siteToProgram(site).wallPlan?.coast).toBe("seaWall");
  });
});

describe("wide-channel bank clearance", () => {
  it.each([
    { y: 0, bank: "left" as const },
    { y: 0, bank: "right" as const },
    { y: -100, bank: "left" as const },
    { y: 100, bank: "right" as const },
    { y: -220, bank: "left" as const },
    { y: 220, bank: "right" as const },
    { y: -400, bank: "left" as const },
    { y: 400, bank: "right" as const }
  ])("keeps a wide river at y=$y on the $bank bank", ({ y, bank }) => {
    const site = synthSite(
      "smallTown",
      { ...DEFAULT_SITE_CONFIG, coast: "none", rivers: ["straight"] },
      "wide-channel-clearance",
      { extentMeters: 1500, cityRadiusMeters: 240 }
    );
    Object.assign(site.rivers[0], {
      widthMeters: 400,
      throughBurgCell: true,
      crossesSite: true,
      cityBank: bank,
      segments: [
        {
          points: [
            [-750, y],
            [750, y]
          ],
          widthsMeters: [400, 400]
        }
      ]
    });

    const geo = siteToGeography(site);
    expect(geo.channels).toHaveLength(1);
    expect(geo.rivers).toHaveLength(0);
    const channel = geo.channels![0];
    expect(pointInPolygon([0, 0], channel.polygon)).toBe(false);
    expect(nearestOnPolyline([0, 0], channel.shoreline).dist).toBeCloseTo(Math.max(72, Math.abs(y) - 200));
    // The far bank remains at its original position; only the near bank moves.
    const farY = y + (bank === "left" ? -200 : 200);
    expect(pointInPolygon([0, (channel.shoreline[0][1] + farY) / 2], channel.polygon)).toBe(true);
    expect(channel.polygon.slice(channel.shoreline.length).every(p => p[1] === farY)).toBe(true);
  });
});
