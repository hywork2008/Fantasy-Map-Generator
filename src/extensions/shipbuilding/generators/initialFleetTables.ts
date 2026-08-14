/**
 * Design tables for map-generation initial fleet seeding.
 * Synced by hand from docs/data/historical-ship-fleets/ (editorial reference CSVs).
 * Do not load the CSVs at runtime — keep this module dependency-free.
 */

export type HistoricalPeriod = "earlyMedieval" | "highMedieval" | "lateMedieval" | "ageOfExploration";

export type MaritimeRole = "minor_coastal" | "regional_maritime" | "major_maritime" | "oceanic_empire";

export type ShipClassId = "sloop" | "caravel" | "galleon";

export interface StarterFleetGuideline {
  totalShipsBase: number;
  sloopCount: number;
  caravelCount: number;
  galleonCount: number;
  stateOwnedShare: number;
  merchantOwnedShare: number;
  typicalPorts: number;
  shipsPerExtraPort: number;
}

/** Hard cap so a map with dozens of ports cannot spawn thousands of hulls. */
export const MAX_FLEET_PER_STATE = 200;

/** Outlier flagship (Galleon 1) chance when the guideline would give zero large hulls. */
export const FLAGSHIP_OUTLIER_P: Readonly<Record<"minor_coastal" | "regional_maritime", number>> = {
  minor_coastal: 0.08,
  regional_maritime: 0.12
};

/**
 * Period × role starter counts from starter-fleet-guidelines.csv.
 * early/high oceanic_empire rows are zero and get clamped to major_maritime at classify time.
 */
export const STARTER_GUIDELINES: Readonly<
  Record<HistoricalPeriod, Readonly<Record<MaritimeRole, StarterFleetGuideline>>>
> = {
  earlyMedieval: {
    minor_coastal: {
      totalShipsBase: 3,
      sloopCount: 3,
      caravelCount: 0,
      galleonCount: 0,
      stateOwnedShare: 0.25,
      merchantOwnedShare: 0.75,
      typicalPorts: 1,
      shipsPerExtraPort: 1
    },
    regional_maritime: {
      totalShipsBase: 8,
      sloopCount: 7,
      caravelCount: 1,
      galleonCount: 0,
      stateOwnedShare: 0.2,
      merchantOwnedShare: 0.8,
      typicalPorts: 3,
      shipsPerExtraPort: 2
    },
    major_maritime: {
      totalShipsBase: 18,
      sloopCount: 16,
      caravelCount: 2,
      galleonCount: 0,
      stateOwnedShare: 0.3,
      merchantOwnedShare: 0.7,
      typicalPorts: 5,
      shipsPerExtraPort: 3
    },
    oceanic_empire: {
      totalShipsBase: 0,
      sloopCount: 0,
      caravelCount: 0,
      galleonCount: 0,
      stateOwnedShare: 0,
      merchantOwnedShare: 0,
      typicalPorts: 6,
      shipsPerExtraPort: 0
    }
  },
  highMedieval: {
    minor_coastal: {
      totalShipsBase: 5,
      sloopCount: 4,
      caravelCount: 1,
      galleonCount: 0,
      stateOwnedShare: 0.2,
      merchantOwnedShare: 0.8,
      typicalPorts: 1,
      shipsPerExtraPort: 1
    },
    regional_maritime: {
      totalShipsBase: 14,
      sloopCount: 11,
      caravelCount: 3,
      galleonCount: 0,
      stateOwnedShare: 0.15,
      merchantOwnedShare: 0.85,
      typicalPorts: 3,
      shipsPerExtraPort: 3
    },
    major_maritime: {
      totalShipsBase: 40,
      sloopCount: 30,
      caravelCount: 9,
      galleonCount: 1,
      stateOwnedShare: 0.25,
      merchantOwnedShare: 0.75,
      typicalPorts: 6,
      shipsPerExtraPort: 4
    },
    oceanic_empire: {
      totalShipsBase: 0,
      sloopCount: 0,
      caravelCount: 0,
      galleonCount: 0,
      stateOwnedShare: 0,
      merchantOwnedShare: 0,
      typicalPorts: 8,
      shipsPerExtraPort: 0
    }
  },
  lateMedieval: {
    minor_coastal: {
      totalShipsBase: 6,
      sloopCount: 4,
      caravelCount: 2,
      galleonCount: 0,
      stateOwnedShare: 0.2,
      merchantOwnedShare: 0.8,
      typicalPorts: 1,
      shipsPerExtraPort: 2
    },
    regional_maritime: {
      totalShipsBase: 20,
      sloopCount: 13,
      caravelCount: 6,
      galleonCount: 1,
      stateOwnedShare: 0.18,
      merchantOwnedShare: 0.82,
      typicalPorts: 4,
      shipsPerExtraPort: 3
    },
    major_maritime: {
      totalShipsBase: 55,
      sloopCount: 35,
      caravelCount: 15,
      galleonCount: 5,
      stateOwnedShare: 0.25,
      merchantOwnedShare: 0.75,
      typicalPorts: 7,
      shipsPerExtraPort: 5
    },
    oceanic_empire: {
      totalShipsBase: 90,
      sloopCount: 50,
      caravelCount: 25,
      galleonCount: 15,
      stateOwnedShare: 0.35,
      merchantOwnedShare: 0.65,
      typicalPorts: 10,
      shipsPerExtraPort: 6
    }
  },
  ageOfExploration: {
    minor_coastal: {
      totalShipsBase: 8,
      sloopCount: 6,
      caravelCount: 2,
      galleonCount: 0,
      stateOwnedShare: 0.2,
      merchantOwnedShare: 0.8,
      typicalPorts: 2,
      shipsPerExtraPort: 2
    },
    regional_maritime: {
      totalShipsBase: 28,
      sloopCount: 20,
      caravelCount: 6,
      galleonCount: 2,
      stateOwnedShare: 0.2,
      merchantOwnedShare: 0.8,
      typicalPorts: 4,
      shipsPerExtraPort: 4
    },
    major_maritime: {
      totalShipsBase: 80,
      sloopCount: 55,
      caravelCount: 18,
      galleonCount: 7,
      stateOwnedShare: 0.25,
      merchantOwnedShare: 0.75,
      typicalPorts: 8,
      shipsPerExtraPort: 6
    },
    oceanic_empire: {
      totalShipsBase: 150,
      sloopCount: 85,
      caravelCount: 40,
      galleonCount: 25,
      stateOwnedShare: 0.4,
      merchantOwnedShare: 0.6,
      typicalPorts: 12,
      shipsPerExtraPort: 8
    }
  }
};

/** Tech-point floors matching shipClasses.ts (kept here so pure fleet math needs no ShipClass import). */
export const SHIP_CLASS_TECH_POINTS: Readonly<Record<ShipClassId, number>> = {
  sloop: 0,
  caravel: 50,
  galleon: 150
};
