import { RIVER_CARGO_VESSEL } from "../../../utils/riverCrossing";
import type { BurgSiteDescriptor } from "../../types/contracts/burgSiteDescriptor";
import { nearestOnPolyline } from "../geom";

/** World-route flux is not a test for a local landing at a sea port. Small
 * river craft can use a surveyed nearby bank without making the river a
 * navigable world trade route (or changing bridge clearance requirements). */
export function resolvePortFrontages(site: BurgSiteDescriptor): BurgSiteDescriptor {
  const access = site.burg.waterAccess;
  if (!site.burg.port || !access?.port.sea || access.port.river || !access.river) return site;
  const river = site.rivers.find(r => r.riverId === access.riverId);
  if (
    !river ||
    (river.depthMeters ?? 0) < RIVER_CARGO_VESSEL.draftMeters ||
    river.widthMeters < RIVER_CARGO_VESSEL.beamMeters * 2
  )
    return site;
  const survey = site.fixedCrossings?.rivers.find(r => r.id === river.riverId);
  const banks = survey?.rings ?? [...river.leftBankSegments, ...river.rightBankSegments];
  if (
    !banks.some(
      line =>
        line.length >= 2 &&
        nearestOnPolyline(
          [0, 0],
          line.map(p => [p[0], p[1]])
        ).dist <=
          site.frame.cityRadiusMeters * 2
    )
  )
    return site;
  return {
    ...site,
    burg: {
      ...site.burg,
      waterAccess: {
        ...access,
        port: { ...access.port, river: true }
      }
    }
  };
}
