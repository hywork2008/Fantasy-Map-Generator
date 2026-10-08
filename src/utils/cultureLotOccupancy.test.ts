import { describe, expect, it } from "vitest";
import type { Burg, Culture } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";
import {
  burgLotOccupancy,
  cultureLotOccupancy,
  DEFAULT_LOT_OCCUPANCY,
  occupancyRadiusMeters
} from "./cultureLotOccupancy";

describe("culture Lot occupancy guide", () => {
  it("defaults to 80% until a culture sets its own guide", () => {
    expect(DEFAULT_LOT_OCCUPANCY).toBe(0.8);
    expect(cultureLotOccupancy({ name: "A", i: 1, base: 0, shield: "" } as Culture)).toBe(0.8);
    expect(cultureLotOccupancy({ name: "A", i: 1, base: 0, shield: "", lotOccupancy: 0.95 } as Culture)).toBe(0.95);
    expect(cultureLotOccupancy({ name: "A", i: 1, base: 0, shield: "", lotOccupancy: 1.5 } as Culture)).toBe(0.8);
  });

  it("reads the burg's culture, falling back to its cell's culture", () => {
    const pack = {
      cultures: [{ i: 0 }, { i: 1, lotOccupancy: 0.6 }],
      cells: { culture: [1] }
    } as unknown as PackedGraph;
    expect(burgLotOccupancy(pack, { cell: 0 } as Burg)).toBe(0.6);
    expect(burgLotOccupancy(pack, { cell: 0, culture: 0 } as Burg)).toBe(0.8);
  });

  it("shrinks the town for a denser guide and leaves room for walls and citadels", () => {
    const open = occupancyRadiusMeters(10_000, 0.8, {});
    expect(open).toBe(224);
    expect(occupancyRadiusMeters(10_000, 0.5, {})).toBeGreaterThan(open);
    expect(occupancyRadiusMeters(10_000, 0.85, {})).toBeLessThan(open);
    // Sizing stops at 85% so a packed guide keeps headroom for a below-median town.
    expect(occupancyRadiusMeters(10_000, 1, {})).toBe(occupancyRadiusMeters(10_000, 0.85, {}));
    expect(occupancyRadiusMeters(10_000, 0.8, { citadel: true })).toBeGreaterThan(open);
    expect(occupancyRadiusMeters(10_000, 0.8, { walls: true })).toBeGreaterThan(
      occupancyRadiusMeters(10_000, 0.8, { citadel: true })
    );
    expect(occupancyRadiusMeters(10, 1, {})).toBe(40);
  });
});
