import type { FortSite } from "../types/fortSite";
import type { TerrainFeature } from "../types/terrain";

/** Moat banks slope over this fraction of each half width. */
const MOAT_BANK_FRACTION = 0.35;

/** The authored motte, bailey and moats as generic earthworks over flat ground. */
export function fortSiteTerrainFeatures(site: FortSite): TerrainFeature[] {
  const { motte, bailey } = site;
  return [
    {
      kind: "platform",
      id: `${site.id}:motte`,
      summit: { center: motte.center, radiusMeters: motte.summitRadiusMeters },
      levelMeters: site.groundElevationMeters + motte.heightMeters,
      edge: { kind: "slope", runMeters: motte.baseRadiusMeters - motte.summitRadiusMeters }
    },
    {
      kind: "platform",
      id: `${site.id}:bailey`,
      summit: { center: bailey.center, radiusMeters: bailey.radiusMeters },
      levelMeters: bailey.elevationMeters,
      edge: { kind: "cliff" }
    },
    ...site.moats.map(
      (moat): TerrainFeature => ({
        kind: "ringCut",
        id: moat.id,
        axis: { center: moat.center, radiusMeters: moat.radiusMeters },
        widthMeters: moat.widthMeters,
        depthMeters: moat.depthMeters,
        rimElevationMeters: site.groundElevationMeters,
        bankFraction: MOAT_BANK_FRACTION,
        waterElevationMeters: site.waterElevationMeters
      })
    )
  ];
}
