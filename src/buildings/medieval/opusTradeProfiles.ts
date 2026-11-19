/** Plot envelopes and street entrances of the Opus town-trade models; free of three.js so CE generators can import them. */

/**
 * Fourteenth-century burgage butchery: a jettied two-storey shop-house whose shop window drops into a
 * stall-board counter under a propped shutter, a carriage gateway beside it for driven beasts, and a paved
 * killing floor under a lean-to at the back of the plot with a hoisting frame, scalding copper, blocks and
 * offal tubs, a wattle holding pen, a draw well and the hide store. +Z is the street.
 */
export const OPUS_BUTCHERY = {
  width: 16,
  depth: 13,
  height: 10.2,
  /** Shop door in the house front; the carriage gate at x 2.3–5.3 is the stock entrance. */
  entrance: { id: "main", position: [-1.65, 0, 6.5] as const, clearWidth: 1.1 }
} as const;

export type OpusTownTrade =
  | "chandlery"
  | "metalwares"
  | "fishmongery"
  | "cutlery"
  | "lime-tile-yard"
  | "glaziers-workshop";

export interface OpusTownTradeProfile {
  width: number;
  depth: number;
  height: number;
  /** Street entrance in model metres; +Z is the street. */
  entrance: { id: "main"; position: readonly [number, number, number]; clearWidth: number };
}

/** Plot envelopes keep the earlier CE footprints so placement demand is unchanged. */
export const OPUS_TOWN_TRADES: Record<OpusTownTrade, OpusTownTradeProfile> = {
  chandlery: { width: 12, depth: 10, height: 10.9, entrance: { id: "main", position: [-0.7, 0, 5], clearWidth: 1 } },
  metalwares: {
    width: 14,
    depth: 12,
    height: 10.2,
    entrance: { id: "main", position: [-0.85, 0, 6], clearWidth: 1.1 }
  },
  fishmongery: { width: 14, depth: 12, height: 5.4, entrance: { id: "main", position: [0, 0, 6], clearWidth: 1.6 } },
  cutlery: { width: 12, depth: 10, height: 10.4, entrance: { id: "main", position: [-0.7, 0, 5], clearWidth: 1 } },
  "lime-tile-yard": {
    width: 20,
    depth: 20,
    height: 3.8,
    entrance: { id: "main", position: [0, 0, 10], clearWidth: 3.5 }
  },
  "glaziers-workshop": {
    width: 12,
    depth: 10,
    height: 9.6,
    entrance: { id: "main", position: [-0.9, 0, 5], clearWidth: 1 }
  }
};

/**
 * Opus ropewalk (MV task 56): a hand ropewalk with its hemp house, as the rope-makers of a late-medieval town worked
 * one on the edge of town (docs/plan/opus-ropewalk.md). The walk runs along Z; +Z is its head and the way in from the
 * road. The envelope is the CE plot of the earlier study, so CE keeps its footprint and entrance.
 */
export const OPUS_ROPEWALK = {
  width: 6,
  depth: 54,
  /** The hemp house's door on the road at the head of the walk. */
  entrance: { id: "main", position: [0, 0, 27] as const, clearWidth: 1.6 }
} as const;

/**
 * Opus smithy (MV task 53, docs/plan/ce-outskirts-workshop-sizes.md S2): a thirteenth-century smithy after the one dug
 * at Newington (Oxfordshire), an 8 x 5 m building on stone footings with two hearths at right angles, an anvil on a
 * stone base and a water trough, open-fronted onto its yard, with a small fuel store against its gable. +Z is the yard
 * and the way in from the road.
 */
export const OPUS_SMITHY = {
  width: 10,
  depth: 8,
  /** The way into the yard from the road, before the open front of the smithy. */
  entrance: { id: "main", position: [0, 0, 4] as const, clearWidth: 1.6 }
} as const;
