/**
 * Catalog and helpers for coastal / nearshore habitat attributes.
 * Codes are catalog-local indices into the key arrays; meaning is always via key.
 */

import type {
  CoastalHabitatCode,
  CoastalHabitatDefinition,
  CoastalHabitatKey,
  NearshoreHabitatCode,
  NearshoreHabitatDefinition,
  NearshoreHabitatKey
} from "../types/coastalHabitat";
import { COASTAL_HABITAT_KEYS, NEARSHORE_HABITAT_KEYS } from "../types/coastalHabitat";

export const COASTAL_HABITAT_DEFINITIONS: readonly CoastalHabitatDefinition[] = [
  {
    key: "none",
    label: "None",
    color: "#00000000",
    contentHint: "No special coastal habitat"
  },
  {
    key: "sandyBeach",
    label: "Sandy beach",
    color: "#f0e0a8",
    contentHint: "Sea turtle nesting, sand crabs, shorebirds, shore fishing (not formal harbors)"
  },
  {
    key: "rockyIntertidal",
    label: "Rocky intertidal",
    color: "#8a8a7a",
    contentHint: "Tide pools, crabs, barnacles, shellfish, starfish, seaweed"
  },
  {
    key: "tidalFlat",
    label: "Tidal flat",
    color: "#c4b89a",
    contentHint: "Shellfish beds, migratory birds, salt works, mud crabs"
  },
  {
    key: "coastalDune",
    label: "Coastal dune",
    color: "#e8d4a0",
    contentHint: "Dry sand behind long beaches; nesting and sparse vegetation"
  }
];

export const NEARSHORE_HABITAT_DEFINITIONS: readonly NearshoreHabitatDefinition[] = [
  {
    key: "none",
    label: "None",
    color: "#00000000",
    contentHint: "No special nearshore habitat"
  },
  {
    key: "rockyReef",
    label: "Rocky reef",
    color: "#4a6b7a",
    contentHint: "Fishing grounds, navigation hazard, rocky fish habitat"
  },
  {
    key: "coralReef",
    label: "Coral reef",
    color: "#2a8a9a",
    contentHint: "Warm-water fishery, spawning grounds, navigation hazard"
  },
  {
    key: "seagrassMeadow",
    label: "Seagrass meadow",
    color: "#3a8a6a",
    contentHint: "Nursery grounds, shellfish, coastal fishery"
  }
];

const coastalCodeByKey: Readonly<Record<CoastalHabitatKey, CoastalHabitatCode>> = Object.fromEntries(
  COASTAL_HABITAT_KEYS.map((key, code) => [key, code])
) as Record<CoastalHabitatKey, CoastalHabitatCode>;

const nearshoreCodeByKey: Readonly<Record<NearshoreHabitatKey, NearshoreHabitatCode>> = Object.fromEntries(
  NEARSHORE_HABITAT_KEYS.map((key, code) => [key, code])
) as Record<NearshoreHabitatKey, NearshoreHabitatCode>;

const coastalDefByKey = Object.fromEntries(COASTAL_HABITAT_DEFINITIONS.map(d => [d.key, d])) as Record<
  CoastalHabitatKey,
  CoastalHabitatDefinition
>;

const nearshoreDefByKey = Object.fromEntries(NEARSHORE_HABITAT_DEFINITIONS.map(d => [d.key, d])) as Record<
  NearshoreHabitatKey,
  NearshoreHabitatDefinition
>;

export function getCoastalHabitatCode(key: CoastalHabitatKey): CoastalHabitatCode {
  return coastalCodeByKey[key];
}

export function getNearshoreHabitatCode(key: NearshoreHabitatKey): NearshoreHabitatCode {
  return nearshoreCodeByKey[key];
}

export function getCoastalHabitatKey(code: CoastalHabitatCode): CoastalHabitatKey {
  return COASTAL_HABITAT_KEYS[code] ?? "none";
}

export function getNearshoreHabitatKey(code: NearshoreHabitatCode): NearshoreHabitatKey {
  return NEARSHORE_HABITAT_KEYS[code] ?? "none";
}

export function getCoastalHabitatDefinition(code: CoastalHabitatCode): CoastalHabitatDefinition {
  const key = getCoastalHabitatKey(code);
  return coastalDefByKey[key];
}

export function getNearshoreHabitatDefinition(code: NearshoreHabitatCode): NearshoreHabitatDefinition {
  const key = getNearshoreHabitatKey(code);
  return nearshoreDefByKey[key];
}

export function isSandyBeach(code: CoastalHabitatCode): boolean {
  return getCoastalHabitatKey(code) === "sandyBeach";
}

/** Formal harbors / shipyards must not sit on sandy beach cells. */
export function allowsFormalHarbor(coastalCode: CoastalHabitatCode | undefined): boolean {
  if (coastalCode === undefined) return true;
  return !isSandyBeach(coastalCode);
}

export function ensureCoastalHabitatColumns(
  cellCount: number,
  cells: {
    coastalHabitat?: ArrayLike<number>;
    nearshoreHabitat?: ArrayLike<number>;
  }
): { coastalHabitat: Uint8Array; nearshoreHabitat: Uint8Array } {
  const reuseOrCreate = (column: ArrayLike<number> | undefined): Uint8Array => {
    if (column instanceof Uint8Array && column.length === cellCount) return column;
    if (column && column.length === cellCount) return Uint8Array.from(column);
    return new Uint8Array(cellCount);
  };
  return {
    coastalHabitat: reuseOrCreate(cells.coastalHabitat),
    nearshoreHabitat: reuseOrCreate(cells.nearshoreHabitat)
  };
}
