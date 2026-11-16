import type { Point } from "../../../types/primitives";
import type { VectorCityDocument } from "../../../types/vector/document";
import type { VectorBlock, VectorPolygon } from "../../../types/vector/generation";
import { placeInnsOnApproach } from "../../gateInnPlacement";
import { regionArea, regionBoolean } from "../geometry/regions";
import { samplePath } from "../geometry/sampling";
import { validateVectorInns } from "../inn";
import { vectorWorksSite } from "./guilds";

/**
 * The wayside inns and caravanserais of an FMG town's economy on its busiest approach (P6e), by the mesh editor's
 * rules (`placeInnsOnApproach`): the largest yard first, just beyond the town edge beside the road, the next beyond
 * it. The approach is the FMG road with the most recorded traffic; with none, as in the mesh editor, no inn is
 * built. The site grows to take the inns placed beyond it.
 */
export function raiseVectorInns(
  doc: VectorCityDocument,
  blocks: VectorBlock[]
): { document: VectorCityDocument; wanted: number; placed: number } {
  const site = doc.site!,
    economy = site.descriptor?.economy,
    wanted = (economy?.facilities ?? []).filter(item => item.count > 0);
  if (!wanted.length) return { document: doc, wanted: 0, placed: 0 };
  const roads = site.descriptor!.roads,
    busiest = roads
      .map((road, i) => ({ road, path: doc.paths[`fmg-road:${road.routeId}:${i}`] }))
      .filter(r => r.path && (r.road.traffic ?? 0) > 0)
      .sort(
        (a, b) => (b.road.traffic ?? 0) - (a.road.traffic ?? 0) || (b.road.trafficRank ?? 0) - (a.road.trafficRank ?? 0)
      )[0];
  // No approach with recorded traffic: the mesh editor builds no inn either, so none is missing.
  if (!busiest) return { document: doc, wanted: 0, placed: 0 };
  const { view, insideTown } = vectorWorksSite(doc, blocks);
  let points: Point[] = samplePath(busiest.path).map(s => s.point);
  // Townward end first.
  if (!insideTown(points[0]) && insideTown(points.at(-1)!)) points = [...points].reverse();
  const inns = placeInnsOnApproach(view, wanted, economy?.year ?? 0, {
    points,
    roadHalf: Math.max(busiest.path.width.leftMeters, busiest.path.width.rightMeters),
    groupId: busiest.path.id
  });
  if (!inns.length) return { document: doc, wanted: wanted.length, placed: 0 };
  const outside = inns
    .map((inn): VectorPolygon => ({ outer: inn.footprint, holes: [] }))
    .filter(r => regionBoolean([r], site.domain, "difference").some(p => regionArea(p) > 1e-3));
  const next: VectorCityDocument = {
    ...doc,
    site: outside.length ? { ...site, domain: regionBoolean(site.domain, outside, "union") } : site,
    environment: { features: {}, hidden: [], ...doc.environment, inns }
  };
  return validateVectorInns(next).length
    ? { document: doc, wanted: wanted.length, placed: 0 }
    : { document: next, wanted: wanted.length, placed: inns.length };
}
