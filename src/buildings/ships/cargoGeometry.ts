import type { ShipType } from "../../city-editor/types/ships";

/** Authored Codex hull coordinates, excluding bowsprits. Closed hatches are deck handover
 * areas, not a claim that these exterior-only models contain accessible holds.
 * Rigging bands conservatively reserve the full beam around set sails, spars and shroud feet. */
export const SHIP_CARGO_GEOMETRY = {
  small: { hullLength: 11.8, hullCenter: 0.1, accessX: 3.1, deckY: 1.69, draft: 1.7, rigging: [[-5.3, 8.4]] },
  medium: {
    hullLength: 24,
    hullCenter: 0,
    accessX: 2,
    deckY: 2.775,
    draft: 1.8,
    rigging: [
      [1, 3.5],
      [-7.5, -5]
    ]
  },
  large: {
    hullLength: 47,
    hullCenter: 0.5,
    accessX: 3,
    deckY: 5.265,
    draft: 3.2,
    rigging: [
      [8, 12.5],
      [-6, -1.5],
      [-20, -15.5]
    ]
  },
  barge: { hullLength: 19, hullCenter: 0, accessX: 0, deckY: 1, draft: 0.7, rigging: [] }
} satisfies Record<
  ShipType,
  { hullLength: number; hullCenter: number; accessX: number; deckY: number; draft: number; rigging: number[][] }
>;
