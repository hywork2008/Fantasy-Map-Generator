import type { WorldContext } from "../context/worldContext";
import { buildWorldLandFootprintPolicy, type WorldFootprintPolicySettings } from "../services/worldLandFootprintPolicy";
import { evaluateWorldLandConnectionProposals, type WorldLandProposalResult } from "./worldLandConnectionProposals";

type ProposalInput = Parameters<typeof evaluateWorldLandConnectionProposals>[2];
export type WorldCellLandProposalResult =
  | WorldLandProposalResult
  | {
      status: "unresolved";
      reason: "world-environment";
      environmentReason: string;
      diagnostics: WorldLandProposalResult["diagnostics"];
    };
/** Builds current cell geometry/permissions for every evaluation. Physical lake,
 * sea and river water remains a separate required input, as do engineering costs.
 * Cell support rules are a conservative mask, not continuous terrain certification.
 */
export function evaluateWorldCellLandConnectionProposals(
  world: Readonly<WorldContext>,
  distanceUnit: string,
  input: Omit<ProposalInput, "environment"> & {
    environment: Omit<ProposalInput["environment"], "supportsDryFootprint" | "allowsPassageFootprint">;
    cellPolicySettings: WorldFootprintPolicySettings;
    cellRules: Parameters<typeof buildWorldLandFootprintPolicy>[3];
  }
): WorldCellLandProposalResult {
  const built = buildWorldLandFootprintPolicy(world, distanceUnit, input.cellPolicySettings, input.cellRules);
  if (!("policy" in built))
    return {
      status: "unresolved",
      reason: "world-environment",
      environmentReason: built.reason,
      diagnostics: { enumeration: null, approachAttempts: 0, assessmentSearches: 0, rejected: [], individuals: [] }
    };
  let environmentReason: string | undefined;
  const check = (footprint: Parameters<typeof built.policy.assess>[0], purpose: "passage" | "dry-support") => {
    const r = built.policy.assess(footprint, purpose);
    if (r.status === "unresolved") environmentReason ??= r.reason;
    return r.status === "allowed";
  };
  const result = evaluateWorldLandConnectionProposals(world, distanceUnit, {
    ...input,
    environment: {
      ...input.environment,
      supportsDryFootprint: footprint => check(footprint, "dry-support"),
      allowsPassageFootprint: footprint => check(footprint, "passage")
    }
  });
  // A boolean callback fails closed, but its budget/error must not be reported as
  // a definite rejection or a completed proposal evaluation.
  return environmentReason
    ? {
        status: "unresolved",
        reason: "world-environment",
        environmentReason,
        diagnostics: result.diagnostics
      }
    : result;
}
