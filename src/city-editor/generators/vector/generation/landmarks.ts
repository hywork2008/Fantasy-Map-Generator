import { HISTORICAL_PERIODS } from "../../../../types/historicalPeriod";
import { getUrbanDwellings } from "../../../../utils/urbanDwellings";
import type { Point } from "../../../types/primitives";
import type { VectorCityDocument } from "../../../types/vector/document";
import type { VectorBlock } from "../../../types/vector/generation";
import type { VectorOpenLandmarks } from "../../../types/vector/landmark";
import {
  type AerialOpenSite,
  placeGallowsOnApproach,
  placeWindmillsAroundTown,
  windmillCountFor,
  windmillFacingRadians
} from "../../aerialLandmarks";
import { makeRng } from "../../prng";
import { evaluateAnchor } from "../geometry/curves";
import { samplePath } from "../geometry/sampling";
import { validateVectorOpenLandmarks } from "../landmark";
import { vectorWorksSite } from "./guilds";

/** The mesh editor builds no permanent gallows below this many buildings unless a count is set. */
const GALLOWS_MIN_BUILDINGS = 400;

/**
 * The windmills and the gallows of a town by the mesh editor's rules (P6f): high and middle medieval post mills, and
 * tower mills from the late period, just beyond the town edge (the walls' glacis when walled), as many as the FMG
 * economy's wind-mill capacity or, without one, about one per 1,400 buildings, fewer on a river; all facing into the
 * FMG prevailing wind, or one seeded facing. The gallows mound stands beside an approach road 130-520 m out from a
 * town of 400 buildings or more. They stand on open ground; the urban land is not grown. The site is flat until P8, so elevation scores nothing.
 */
export function raiseVectorOpenLandmarks(
  doc: VectorCityDocument,
  blocks: VectorBlock[]
): { document: VectorCityDocument; wanted: number; placed: number } {
  const site = doc.site!,
    descriptor = site.descriptor,
    buildings = getUrbanDwellings(doc.context.targetPopulation ?? 0),
    rivers = Object.values(doc.paths).some(p => p.role === "river" && p.id !== "town-moat"),
    count = windmillCountFor(buildings, doc.context.historicalPeriod, rivers, descriptor?.economy?.mills?.wind),
    gallowsWanted = buildings >= GALLOWS_MIN_BUILDINGS ? 1 : 0;
  if (!count && !gallowsWanted) return { document: doc, wanted: 0, placed: 0 };
  const { view, town, roads } = vectorWorksSite(doc, blocks);
  const open: AerialOpenSite = {
    ...view,
    walled: Object.values(doc.paths).some(p => p.role === "wall"),
    roads: roads.map(r => samplePath(r).map(s => s.point)),
    elevation: () => 0,
    buildingsIn: () => [],
    farmsIn: () => []
  };
  if (town.length < 3) return { document: doc, wanted: count + gallowsWanted, placed: 0 };
  const seed = doc.recipe.seed;
  // As in the mesh editor, the gallows claim their mound before the mills look for ground.
  const gallows = gallowsWanted ? placeGallowsOnApproach(open, makeRng(`${seed}:gallows`)) : [];
  let windmills: VectorOpenLandmarks["windmills"] = [];
  if (count) {
    const rng = makeRng(`${seed}:windmill`),
      seededFacing = rng.range(0, Math.PI * 2),
      blowToward = descriptor?.climate?.prevailingWindDeg,
      gates = Object.values(doc.connections.gates).flatMap((g): Point[] => {
        const wall = doc.paths[g.wallPathId];
        return wall && g.kind === "passage" ? [evaluateAnchor(wall, g.anchor)] : [];
      });
    windmills = placeWindmillsAroundTown(
      open,
      {
        count,
        towerMills:
          HISTORICAL_PERIODS.indexOf(doc.context.historicalPeriod ?? "ageOfExploration") >=
          HISTORICAL_PERIODS.indexOf("lateMedieval"),
        gates,
        facing:
          typeof blowToward === "number" && Number.isFinite(blowToward)
            ? windmillFacingRadians(blowToward)
            : seededFacing
      },
      rng
    );
  }
  const wanted = count + gallowsWanted,
    placed = windmills.length + gallows.length;
  if (!placed) return { document: doc, wanted, placed };
  // Open ground: the site's urban land is not grown to take them, so no housing is laid round them.
  const next: VectorCityDocument = {
    ...doc,
    environment: { features: {}, hidden: [], ...doc.environment, landmarks: { windmills, gallows } }
  };
  return validateVectorOpenLandmarks(next).length
    ? { document: doc, wanted, placed: 0 }
    : { document: next, wanted, placed };
}
