export type CivicHallKind = "town" | "market" | "cloth";

/** One dimensional and connection contract for cloth and craft guild halls. */
export const GUILD_HALL_PROFILE = Object.freeze({
  width: 15,
  depth: 7,
  upperFloor: 3.32,
  upperWall: 3.25,
  roofRise: 2.2,
  support: "masonry-arcade" as const,
  stairSide: "east" as const,
  doorZ: -2.3
});

/** Civic exceptions are named presets, never inferred from the trade decoration. */
export function civicHallProfile(kind: CivicHallKind) {
  if (kind === "town") return { ...GUILD_HALL_PROFILE, width: 12, upperWall: 3.7, roofRise: 2.6 };
  if (kind === "market") return { ...GUILD_HALL_PROFILE, width: 14, depth: 6, support: "timber-posts" as const };
  return GUILD_HALL_PROFILE;
}
