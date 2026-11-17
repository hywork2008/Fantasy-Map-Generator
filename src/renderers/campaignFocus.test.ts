import { describe, expect, it } from "vitest";
import { battleCampaignAnchor, regimentCampaignAnchor } from "./campaignFocus";

describe("campaign anchors", () => {
  it("frames the battle screen on the defender cell", () => {
    expect(battleCampaignAnchor({ x: 100, y: 80, cell: 12 })).toEqual({ x: 100, y: 80, cellId: 12 });
  });

  it("frames a regiment in the open battle on that battle cell", () => {
    const anchor = regimentCampaignAnchor({
      regiment: { state: 2, i: 1, x: 10, y: 10 },
      battle: {
        x: 100,
        y: 80,
        cell: 12,
        attackers: [{ state: 2, i: 1 }],
        defenders: [{ state: 3, i: 4 }]
      },
      enemies: [{ state: 3, i: 4, x: 400, y: 400 }],
      contactReachPx: 50,
      cellAt: () => 99
    });

    expect(anchor).toEqual({ x: 100, y: 80, cellId: 12 });
  });

  it("frames the midpoint of the nearest enemy inside the week window", () => {
    const anchor = regimentCampaignAnchor({
      regiment: { state: 1, i: 0, x: 0, y: 0 },
      battle: null,
      enemies: [
        { state: 2, i: 0, x: 30, y: 40 },
        { state: 3, i: 0, x: 300, y: 0 }
      ],
      contactReachPx: 80,
      cellAt: (x, y) => (x === 15 && y === 20 ? 7 : 0)
    });

    expect(anchor).toEqual({ x: 15, y: 20, cellId: 7 });
  });

  it("stays on the regiment when the nearest enemy is outside the window", () => {
    const anchor = regimentCampaignAnchor({
      regiment: { state: 1, i: 0, x: 10, y: 20 },
      battle: null,
      enemies: [{ state: 2, i: 0, x: 1000, y: 20 }],
      contactReachPx: 80,
      cellAt: (x, y) => x + y
    });

    expect(anchor).toEqual({ x: 10, y: 20, cellId: 30 });
  });

  it("stays on the regiment when no state is at war", () => {
    const anchor = regimentCampaignAnchor({
      regiment: { state: 1, i: 0, x: 4, y: 6 },
      battle: null,
      enemies: [],
      contactReachPx: 80,
      cellAt: () => 3
    });

    expect(anchor).toEqual({ x: 4, y: 6, cellId: 3 });
  });

  it("does not use a battle the regiment is not part of", () => {
    const anchor = regimentCampaignAnchor({
      regiment: { state: 1, i: 0, x: 0, y: 0 },
      battle: {
        x: 500,
        y: 500,
        cell: 40,
        attackers: [{ state: 8, i: 1 }],
        defenders: [{ state: 9, i: 1 }]
      },
      enemies: [{ state: 2, i: 0, x: 10, y: 0 }],
      contactReachPx: 80,
      cellAt: () => 5
    });

    expect(anchor).toEqual({ x: 5, y: 0, cellId: 5 });
  });
});
