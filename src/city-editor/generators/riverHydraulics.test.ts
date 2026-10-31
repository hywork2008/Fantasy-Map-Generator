import { describe, expect, it } from "vitest";
import type { TerrainRiverCorridor } from "../types/terrain";
import { hydraulicWaterAt, RIVER_GRAVITY_MPS2, solveRiverHydraulics } from "./riverHydraulics";

const corridor = (): TerrainRiverCorridor => ({
  kind: "riverCorridor",
  id: "river",
  sourceId: "test",
  centerline: [
    [0, 0],
    [0, 100]
  ],
  widthsMeters: [20, 20],
  bedMeters: [49, 39],
  depthMeters: 1.4,
  bank: { kind: "slope", runMeters: 6 }
});

describe("steady river hydraulics", () => {
  it("uses the lower bank minus River depth and keeps cross-sections level on a cross-slope", () => {
    const profile = solveRiverHydraulics({
      corridor: corridor(),
      bankDropMeters: 3,
      landAt: ([x, y]) => 50 + x * 0.4 - y * 0.1
    })!;
    expect(profile.stations.length).toBeGreaterThan(2);
    for (const station of profile.stations) {
      expect(station.surfaceMeters).toBeCloseTo(Math.min(station.leftBankMeters, station.rightBankMeters) - 3);
      expect(hydraulicWaterAt([profile], station.left)).toBeCloseTo(station.surfaceMeters);
      expect(hydraulicWaterAt([profile], station.right)).toBeCloseTo(station.surfaceMeters);
    }
  });

  it("conserves discharge and dissipates energy through Manning friction", () => {
    const profile = solveRiverHydraulics({
      corridor: corridor(),
      bankDropMeters: 3,
      upstreamVelocityMps: 1,
      landAt: ([x, y]) => 50 + x * 0.4 - y * 0.1
    })!;
    expect(profile.stations.at(-1)!.velocityMps).toBeGreaterThan(1);
    for (let i = 0; i < profile.stations.length; i++) {
      const station = profile.stations[i];
      expect(station.widthMeters * station.depthMeters * station.velocityMps).toBeCloseTo(profile.dischargeM3s, 8);
      expect(station.surfaceMeters - station.bedMeters).toBeCloseTo(station.depthMeters, 8);
      if (!i) continue;
      const previous = profile.stations[i - 1];
      const run = station.distanceMeters - previous.distanceMeters;
      const radius = (station.widthMeters * station.depthMeters) / (station.widthMeters + 2 * station.depthMeters);
      const loss = (run * profile.roughness ** 2 * station.velocityMps ** 2) / radius ** (4 / 3);
      expect(previous.energyHeadMeters - station.energyHeadMeters).toBeCloseTo(loss, 7);
      expect(station.energyHeadMeters).toBeCloseTo(
        station.surfaceMeters + station.velocityMps ** 2 / (2 * RIVER_GRAVITY_MPS2),
        8
      );
    }
  });

  it("does not pump water uphill and leaves level pools at rest without supplied flow", () => {
    const hill = solveRiverHydraulics({ corridor: corridor(), landAt: ([, y]) => 10 + y * 0.2 })!;
    expect(hill.stations.every(station => station.surfaceMeters === 9)).toBe(true);
    const flat = solveRiverHydraulics({ corridor: corridor(), landAt: () => 10 })!;
    expect(flat.dischargeM3s).toBe(0);
    expect(flat.stations.every(station => station.velocityMps === 0 && station.depthMeters === 1.4)).toBe(true);
  });
});
