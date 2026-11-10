import type { BastionedTownPlan, BastionPlan, CurtainPlan, DefenseAccessPlan } from "../document";
import type { CurveAnchor } from "./document";

/** Independent semantic defense. No mesh face, edge or vertex references are saved. */
export interface VectorDefensePlan
  extends Omit<BastionedTownPlan, "circuitId" | "bastions" | "curtains" | "accesses" | "locked"> {
  editPolicy: "fixed";
  circuit: { id: string; wallPathIds: string[] };
  bastions: (Omit<BastionPlan, "wallEdgeIds"> & { wallSpans: { from: CurveAnchor; to: CurveAnchor }[] })[];
  curtains: (Omit<CurtainPlan, "wallEdgeIds"> & { wallSpans: { from: CurveAnchor; to: CurveAnchor }[] })[];
  accesses: (Omit<DefenseAccessPlan, "gateId" | "roadId"> & {
    portal: { kind: "gate" | "curtain"; id: string };
    roadPathIds: string[];
  })[];
}
