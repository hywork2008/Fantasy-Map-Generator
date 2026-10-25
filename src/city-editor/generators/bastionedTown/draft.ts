// Generation-only bundle. The saved document keeps `plan` and drops the skeleton copy.
import type { BastionedTownPlan, Point } from "../../types/document";
import type { Skeleton } from "../generation/skeleton/contracts";

export interface BastionedTownDraft {
  plan: BastionedTownPlan;
  skeleton: Skeleton;
  evaluations: number;
  citadelSquare?: Point[];
  meshRing: Point[];
  bastionVertices: Array<[number, number]>;
  curtainVertices: Array<[number, number]>;
}
