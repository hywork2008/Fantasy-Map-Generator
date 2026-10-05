import { corridorDelta, corridorUnit } from "../services/approachCorridorGeometry";
import type { PhysicalWaterIndex } from "../services/physicalWaterIndex";
import type { RiverPoint } from "../services/riverGeometry";
import {
  type ApproachCorridor,
  type ApproachCorridorResult,
  type ApproachCorridorSettings,
  type CorridorGuideNode,
  findApproachCorridor
} from "./approachCorridorSearch";
import {
  type CrossingCandidateInput,
  type ProvisionalRiverCrossing,
  validateProvisionalRiverCrossing
} from "./riverCrossingCandidates";

export interface CrossingApproachGuides {
  nodes: readonly CorridorGuideNode[];
  startNodeId: number;
  approachNodeId: number;
  /** Required when this endpoint attaches to an existing road. */
  startTangent?: RiverPoint;
}
export type RiverCrossingApproachResult =
  | {
      status: "approaches-validated";
      crossing: ProvisionalRiverCrossing;
      approachA: ApproachCorridor;
      approachB: ApproachCorridor;
      searches: readonly [ApproachCorridorResult, ApproachCorridorResult];
    }
  | { reason: "invalid-crossing" | "invalid-approach-contract" }
  | { reason: "approach-unresolved"; side: "A" | "B"; search: ApproachCorridorResult };
/** Geometry gate only: no road/facility registration, construction decision or
 * network reachability guarantee. Both outside corridors must end on E, with
 * their outgoing tangent directed along the fixed E→D bridge axis.
 */
export function connectRiverCrossingApproaches(input: {
  crossing: ProvisionalRiverCrossing;
  crossingInput: CrossingCandidateInput;
  sideA: CrossingApproachGuides;
  sideB: CrossingApproachGuides;
  settings: ApproachCorridorSettings;
  water: PhysicalWaterIndex;
}): RiverCrossingApproachResult {
  const { crossing: c, crossingInput: source } = input;
  if (!validateProvisionalRiverCrossing(c, { ...source, otherWater: [], waterIndex: input.water }))
    return { reason: "invalid-crossing" };
  if (input.settings.roadWidthMeters !== source.dimensions.roadWidthMeters)
    return { reason: "invalid-approach-contract" };
  const sides = [input.sideA, input.sideB],
    endpoints = [c.approachA, c.approachB],
    decks = [c.deckA, c.deckB];
  const results: ApproachCorridorResult[] = [];
  for (let i = 0; i < 2; i++) {
    const guides = sides[i],
      endpoint = endpoints[i],
      goal = guides.nodes.find(n => n.id === guides.approachNodeId);
    if (!goal || goal.point[0] !== endpoint[0] || goal.point[1] !== endpoint[1])
      return { reason: "invalid-approach-contract" };
    const goalTangent = corridorUnit(corridorDelta(decks[i], endpoint));
    if (!goalTangent) return { reason: "invalid-crossing" };
    const result = findApproachCorridor({
      nodes: guides.nodes,
      startNodeId: guides.startNodeId,
      goalNodeId: guides.approachNodeId,
      startTangent: guides.startTangent,
      goalTangent,
      settings: input.settings,
      water: input.water,
      supportsDryFootprint: source.supportsDryFootprint
    });
    results.push(result);
    if (!("corridor" in result)) return { reason: "approach-unresolved", side: i === 0 ? "A" : "B", search: result };
  }
  const [a, b] = results as [
    Extract<ApproachCorridorResult, { corridor: ApproachCorridor }>,
    Extract<ApproachCorridorResult, { corridor: ApproachCorridor }>
  ];
  return {
    status: "approaches-validated",
    crossing: c,
    approachA: a.corridor,
    approachB: b.corridor,
    searches: [a, b]
  };
}
