import type { LabSiteKind } from "./classifyRiverSite";

export interface RiverPortLabOptions {
  enabled: boolean;
  /** 1 (normal) .. 10: divides the river-forming flux threshold and, with ignoreClimate, scales the rain. */
  riverDensity: number;
  /** Replace the climate precipitation with a uniform field (± noise). */
  ignoreClimate: boolean;
  /** Outermost grid cells become sea: no river drains off the map. */
  seaBorder: boolean;
  /** Minimum land share (0..0.9): shallows become coastal plain so rivers have room to join. */
  landShare: number;
  /** Inland lake depressions to carve (lake outlets). */
  lakes: number;
  /** Burgs forced onto each site kind, before ordinary towns. */
  siteQuota: Partial<Record<LabSiteKind, number>>;
  /** After the quotas, place the remaining ordinary towns as usual. */
  fillTowns: boolean;
}
