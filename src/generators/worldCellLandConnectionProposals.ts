import type { WorldContext } from "../context/worldContext";
import { buildWorldLandFootprintPolicy, type WorldFootprintPolicySettings } from "../services/worldLandFootprintPolicy";
import { publishWorldLandProposalReport } from "../services/worldLandProposalReport";
import { WorldNonRiverWaterRegistry } from "../services/worldNonRiverWater";
import { buildWorldDryLandConnections, type WorldDryConnectionSettings } from "./worldDryLandConnections";
import { evaluateWorldLandConnectionProposals, type WorldLandProposalResult } from "./worldLandConnectionProposals";

type ProposalInput = Parameters<typeof evaluateWorldLandConnectionProposals>[2];
const worldWater = new WorldNonRiverWaterRegistry();
export type WorldCellLandProposalResult =
  | WorldLandProposalResult
  | {
      status: "unresolved";
      reason: "world-environment";
      environmentReason: string;
      diagnostics: WorldLandProposalResult["diagnostics"];
    };
/** Builds current cell geometry/permissions and physical lake/sea water for every
 * evaluation. Engineering costs and river capability remain explicit inputs.
 * Cell support rules are a conservative mask, not continuous terrain certification.
 */
export function evaluateWorldCellLandConnectionProposals(
  world: Readonly<WorldContext>,
  distanceUnit: string,
  input: Omit<ProposalInput, "environment"> & {
    environment: Omit<
      ProposalInput["environment"],
      "supportsDryFootprint" | "allowsPassageFootprint" | "nonRiverWater"
    > & {
      /** Additional explicit obstacles; never replaces the world lake/sea mask. */
      nonRiverWater?: ProposalInput["environment"]["nonRiverWater"];
    };
    cellPolicySettings: WorldFootprintPolicySettings;
    cellRules: Parameters<typeof buildWorldLandFootprintPolicy>[3];
    /** Optional automatic dry walking alternatives. Settings are explicit;
     * an incomplete finite guide is not a disconnected-world certificate. */
    dryBaseline?: Omit<WorldDryConnectionSettings, "corridor">;
  }
): WorldCellLandProposalResult {
  const pack = world.pack;
  const fingerprint = () =>
    JSON.stringify([
      world.distanceScale,
      distanceUnit,
      world.graphWidth,
      world.graphHeight,
      world.pack?.cells?.i,
      world.pack?.cells?.v,
      world.pack?.cells?.h,
      world.pack?.cells?.state,
      world.pack?.cells?.p,
      world.pack?.cells?.fl,
      world.pack?.vertices?.p,
      world.pack?.rivers,
      world.pack?.burgs
    ]);
  const before = fingerprint();
  const built = buildWorldLandFootprintPolicy(world, distanceUnit, input.cellPolicySettings, input.cellRules);
  const water = worldWater.get(world, distanceUnit, input.cellPolicySettings);
  if (!("policy" in built) || !("water" in water)) {
    const result: WorldCellLandProposalResult = {
      status: "unresolved",
      reason: "world-environment",
      environmentReason:
        "reason" in built ? built.reason : "reason" in water ? `water-${water.reason}` : "invalid-water",
      diagnostics: { enumeration: null, approachAttempts: 0, assessmentSearches: 0, rejected: [], individuals: [] }
    };
    publishWorldLandProposalReport(world, result, input.pairs);
    return result;
  }
  let environmentReason: string | undefined;
  const check = (footprint: Parameters<typeof built.policy.assess>[0], purpose: "passage" | "dry-support") => {
    const r = built.policy.assess(footprint, purpose);
    if (r.status === "unresolved") environmentReason ??= r.reason;
    return r.status === "allowed";
  };
  const nonRiverWater = [...water.water, ...(input.environment.nonRiverWater ?? [])];
  let baselineConnections = input.baselineConnections;
  if (input.dryBaseline) {
    if (world.pack.rivers.length > input.settings.crossings.maxRivers) environmentReason = "river-budget";
    const riverWater = [];
    for (const river of world.pack.rivers) {
      if (environmentReason) break;
      const current = input.registry.get(world, river, distanceUnit, input.settings.crossings.geometry);
      if (!("geometry" in current)) {
        environmentReason = `river-${current.reason}`;
        break;
      }
      riverWater.push(current.geometry.water);
    }
    const completeWater = environmentReason ? null : input.registry.getWaterIndex([...riverWater, ...nonRiverWater]);
    const dry = completeWater
      ? buildWorldDryLandConnections(
          world,
          distanceUnit,
          input.pairs,
          {
            ...input.dryBaseline,
            corridor: input.settings.approaches.corridor
          },
          { water: completeWater, supportsDryFootprint: p => check(p, "dry-support") && check(p, "passage") }
        )
      : null;
    if (!dry || "reason" in dry || environmentReason || dry.unresolvedPairIds.length) {
      const result: WorldCellLandProposalResult = {
        status: "unresolved",
        reason: "world-environment",
        environmentReason:
          environmentReason ??
          (dry && "reason" in dry ? dry.reason : dry ? "dry-baseline-unresolved" : "invalid-water"),
        diagnostics: { enumeration: null, approachAttempts: 0, assessmentSearches: 0, rejected: [], individuals: [] }
      };
      publishWorldLandProposalReport(world, result, input.pairs);
      return result;
    }
    baselineConnections = [...input.baselineConnections, ...dry.connections];
  }
  const result = evaluateWorldLandConnectionProposals(world, distanceUnit, {
    ...input,
    baselineConnections,
    environment: {
      ...input.environment,
      nonRiverWater,
      supportsDryFootprint: footprint => check(footprint, "dry-support"),
      allowsPassageFootprint: footprint => check(footprint, "passage")
    }
  });
  if (world.pack !== pack || fingerprint() !== before) environmentReason = "changed-world-environment";
  // A boolean callback fails closed, but its budget/error must not be reported as
  // a definite rejection or a completed proposal evaluation.
  const finalResult: WorldCellLandProposalResult = environmentReason
    ? {
        status: "unresolved",
        reason: "world-environment",
        environmentReason,
        diagnostics: result.diagnostics
      }
    : result;
  if (finalResult !== result) publishWorldLandProposalReport(world, finalResult, input.pairs);
  return finalResult;
}
