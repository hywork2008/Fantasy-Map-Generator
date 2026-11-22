import type { BuildingFrontage, BuildingFrontageCandidate } from "../../generators/buildingFrontage";
import type { BuildingLot } from "../../generators/buildingLots.types";
import type { Point } from "../../types/primitives";

/**
 * The frontage of a generated house from its recorded entrance (`houses.entrances`: the door on its wall and the point
 * its way reaches on the street): of the model's door positions, the one facing the way out, nearest the door. A rear
 * house on a burgage plot so opens onto its court, a front house onto its street; with no entrance the model keeps its
 * first candidate, as before.
 */
export function fabricDoorFrontage(doorOf: (lot: BuildingLot) => readonly [Point, Point] | undefined) {
  return (lot: BuildingLot, candidates: readonly BuildingFrontageCandidate[]): BuildingFrontage => {
    const entrance = doorOf(lot);
    if (!entrance || !candidates.length) return { ...candidates[0], source: "unknown" };
    const [door, access] = entrance,
      length = Math.hypot(access[0] - door[0], access[1] - door[1]),
      out: Point | undefined =
        length > 1e-6 ? [(access[0] - door[0]) / length, (access[1] - door[1]) / length] : undefined;
    const score = (c: BuildingFrontageCandidate) =>
      Math.hypot(c.door[0] - door[0], c.door[1] - door[1]) -
      (out ? 4 * (c.normal[0] * out[0] + c.normal[1] * out[1]) : 0);
    const best = [...candidates].sort((a, b) => score(a) - score(b))[0];
    return { ...best, source: "access" };
  };
}
