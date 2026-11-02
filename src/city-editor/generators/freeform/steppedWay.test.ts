import { describe, expect, it } from "vitest";
import { polylineLength } from "../geom";
import { planSteppedWay, WAY_RISER_METERS, WAY_TREAD_METERS } from "./steppedWay";

describe("planSteppedWay", () => {
  it("keeps flat ground as one landing and no flights", () => {
    const profile = planSteppedWay({
      centerline: [
        [0, 0],
        [15, 0]
      ],
      heightAt: () => 3.2
    });
    expect(profile).not.toBeNull();
    expect(profile?.flights).toEqual([]);
    expect(profile?.landings).toHaveLength(1);
    expect(profile?.landings[0].fromMeters).toBeCloseTo(0, 5);
    expect(profile?.landings[0].toMeters).toBeCloseTo(15, 5);
    expect(Math.abs(profile!.landings[0].levelMeters - 3.2)).toBeLessThanOrEqual(WAY_RISER_METERS / 2 + 1e-6);
  });

  it("climbs between two pinned levels with whole risers and treads", () => {
    const line = [
      [0, 0],
      [12, 0]
    ] as const;
    const profile = planSteppedWay({
      centerline: line,
      heightAt: () => 0,
      pinStart: 0,
      pinEnd: 10 * WAY_RISER_METERS
    });
    expect(profile).not.toBeNull();
    expect(profile!.flights.length).toBeGreaterThan(0);
    const length = polylineLength([...line]);
    expect(profile!.landings[0].fromMeters).toBeCloseTo(0, 4);
    expect(profile!.landings[profile!.landings.length - 1].toMeters).toBeCloseTo(length, 4);
    for (const landing of profile!.landings)
      expect(landing.toMeters - landing.fromMeters).toBeGreaterThanOrEqual(3 - 1e-4);
    for (const flight of profile!.flights) {
      expect(flight.steps).toBeGreaterThanOrEqual(1);
      expect(flight.steps).toBeLessThanOrEqual(17);
      expect(Math.abs(flight.toLevelMeters - flight.fromLevelMeters)).toBeCloseTo(flight.steps * WAY_RISER_METERS, 4);
      expect(flight.toMeters - flight.fromMeters).toBeCloseTo(flight.steps * WAY_TREAD_METERS, 4);
    }
    expect(profile!.landings[0].levelMeters).toBeCloseTo(0, 4);
    expect(profile!.landings[profile!.landings.length - 1].levelMeters).toBeCloseTo(10 * WAY_RISER_METERS, 4);
    let cursor = 0;
    for (let i = 0; i < profile!.landings.length; i++) {
      expect(profile!.landings[i].fromMeters).toBeCloseTo(cursor, 4);
      cursor = profile!.landings[i].toMeters;
      const flight = profile!.flights[i];
      if (!flight) break;
      expect(flight.fromMeters).toBeCloseTo(cursor, 4);
      cursor = flight.toMeters;
    }
    expect(cursor).toBeCloseTo(length, 4);
  });

  it("refuses two landings and a flight when the line is only 6 m", () => {
    expect(
      planSteppedWay({
        centerline: [
          [0, 0],
          [6, 0]
        ],
        heightAt: () => 0,
        pinStart: 0,
        pinEnd: 5
      })
    ).toBeNull();
  });
});
