/**
 * Annual atmospheric steam trials and mine installations.
 * Design: docs/plan/steam-engine-knowledge-accumulation.md §6–7,
 * docs/plan/steam-industrial-implementation.md Phase 0.
 */

import { getTechnologyStage } from "../../../generators/technologyProgress";
import { isTechnologyStageAtLeast } from "../../../generators/technologyTypes";
import { isDeepMineRequirementRelaxed, rn, scaleCountRequirement } from "../../hostUtils";
import {
  getGoods,
  getMineOperations,
  getMineralDeposits,
  getSimulationYear,
  getSteamInstallations,
  getSteamInstallationsLastSettledYear,
  getSteamPumpTrials,
  getWorldContext,
  setSteamInstallations,
  setSteamInstallationsLastSettledYear,
  setSteamPumpTrials
} from "../economyContext";
import { isGoodEnabled } from "./goods-generator";
import { Markets } from "./markets-generator";

export const STEAM_ANNUAL_COAL = 2;
export const STEAM_ANNUAL_TOOLS = 0.35;
export const STEAM_BUILD_IRON = 0.8;
export const STEAM_DRAINAGE_BONUS = 0.5;
export const STEAM_TRIAL_YEARS_FOR_DEMONSTRATION = 2;

function findGood(name: string) {
  return getGoods().find(good => good.name === name);
}

function consume(marketId: number, goodName: string, requested: number): number {
  const good = findGood(goodName);
  if (!good || !isGoodEnabled(good)) return 0;
  return Markets.consumeForSmelting(marketId, good.i, requested, 0.6);
}

function burgStateId(burgId: number): number {
  return getWorldContext().pack.burgs?.[burgId]?.state ?? 0;
}

function eligibleDeepMines(stateId: number) {
  const deposits = new Map(getMineralDeposits().map(deposit => [deposit.i, deposit]));
  const inState = getMineOperations().filter(operation => {
    if (!operation.active) return false;
    return burgStateId(operation.burgId) === stateId;
  });
  const deep = inState.filter(operation => deposits.get(operation.depositId)?.depth === "deep");
  if (deep.length || !isDeepMineRequirementRelaxed()) return deep;
  return inState;
}

function operateSite(marketId: number, needsBuildIron: boolean): { coal: number; tools: number; utilization: number } {
  const iron = needsBuildIron ? consume(marketId, "Iron Ingot", STEAM_BUILD_IRON) : STEAM_BUILD_IRON;
  const coal = consume(marketId, "Coal", STEAM_ANNUAL_COAL);
  const tools = consume(marketId, "Tools", STEAM_ANNUAL_TOOLS);
  const ironCoverage = needsBuildIron ? iron / STEAM_BUILD_IRON : 1;
  const utilization = Math.min(1, coal / STEAM_ANNUAL_COAL, tools / STEAM_ANNUAL_TOOLS, ironCoverage);
  return { coal, tools, utilization: rn(Math.max(0, utilization), 4) };
}

export class SteamInstallationsModule {
  settleAnnual(): boolean {
    const year = getSimulationYear();
    if (getSteamInstallationsLastSettledYear() === year) return false;
    setSteamInstallationsLastSettledYear(year);

    const states = getWorldContext().pack.states ?? [];
    const trials = [...getSteamPumpTrials()];
    const installations = [...getSteamInstallations()];
    const occupied = new Set([
      ...trials.filter(trial => trial.status === "building" || trial.status === "running").map(t => t.mineOperationId),
      ...installations.map(installation => installation.mineOperationId)
    ]);

    for (const state of states) {
      if (!state?.i || state.removed) continue;
      const stage = getTechnologyStage("atmosphericSteamPumping", state.i);
      const mines = eligibleDeepMines(state.i);
      if (!mines.length) continue;

      if (!isTechnologyStageAtLeast(stage, "known")) continue;

      const hasActiveTrial = trials.some(
        trial => trial.stateId === state.i && (trial.status === "building" || trial.status === "running")
      );
      const hasInstallation = installations.some(installation =>
        mines.some(mine => mine.i === installation.mineOperationId)
      );
      if (!hasActiveTrial && !hasInstallation) {
        const candidate = mines.find(mine => !occupied.has(mine.i)) ?? mines[0];
        if (!occupied.has(candidate.i)) {
          trials.push({
            mineOperationId: candidate.i,
            burgId: candidate.burgId,
            stateId: state.i,
            status: "building",
            operatingYears: 0,
            documentedRuns: 0,
            fuelConsumed: 0,
            maintenanceConsumed: 0,
            lastOperatedYear: year,
            utilization: 0
          });
          occupied.add(candidate.i);
        }
      }

      if (isTechnologyStageAtLeast(stage, "demonstrated")) {
        const installedHere = installations.filter(installation =>
          mines.some(mine => mine.i === installation.mineOperationId)
        ).length;
        const target = isTechnologyStageAtLeast(stage, "diffused")
          ? Math.max(2, Math.ceil(mines.length * 0.1))
          : isTechnologyStageAtLeast(stage, "adopted")
            ? Math.max(2, Math.min(mines.length, 3))
            : Math.min(2, mines.length);
        if (installedHere < target) {
          const candidate = mines.find(mine => !occupied.has(mine.i));
          if (candidate) {
            installations.push({
              mineOperationId: candidate.i,
              technologyId: "atmosphericSteamPumping",
              installedYear: year,
              condition: 1,
              utilization: 0,
              lastFueledYear: year,
              annualCoalUsed: 0,
              annualToolsUsed: 0
            });
            occupied.add(candidate.i);
          }
        }
      }
    }

    for (const trial of trials) {
      if (trial.status !== "building" && trial.status !== "running") continue;
      const mine = getMineOperations().find(operation => operation.i === trial.mineOperationId);
      if (!mine?.active) {
        trial.status = "failed";
        trial.utilization = 0;
        continue;
      }
      const result = operateSite(mine.marketId, trial.status === "building");
      trial.fuelConsumed = rn(trial.fuelConsumed + result.coal, 4);
      trial.maintenanceConsumed = rn(trial.maintenanceConsumed + result.tools, 4);
      trial.utilization = result.utilization;
      trial.lastOperatedYear = year;
      if (result.utilization >= 0.5) {
        if (trial.status === "building") trial.status = "running";
        trial.operatingYears += 1;
        trial.documentedRuns += 1;
      }
    }

    for (const trial of trials) {
      if (
        trial.status !== "running" ||
        trial.documentedRuns < scaleCountRequirement(STEAM_TRIAL_YEARS_FOR_DEMONSTRATION)
      ) {
        continue;
      }
      if (installations.some(installation => installation.mineOperationId === trial.mineOperationId)) {
        trial.status = "retired";
        continue;
      }
      if (!isTechnologyStageAtLeast(getTechnologyStage("atmosphericSteamPumping", trial.stateId), "demonstrated")) {
        continue;
      }
      installations.push({
        mineOperationId: trial.mineOperationId,
        technologyId: "atmosphericSteamPumping",
        installedYear: year,
        condition: 1,
        utilization: trial.utilization,
        lastFueledYear: year,
        annualCoalUsed: trial.fuelConsumed,
        annualToolsUsed: trial.maintenanceConsumed
      });
      trial.status = "retired";
    }

    for (const installation of installations) {
      const mine = getMineOperations().find(operation => operation.i === installation.mineOperationId);
      if (!mine?.active) {
        installation.utilization = 0;
        installation.condition = rn(installation.condition * 0.85, 4);
        continue;
      }
      const result = operateSite(mine.marketId, false);
      installation.annualCoalUsed = result.coal;
      installation.annualToolsUsed = result.tools;
      installation.utilization = result.utilization;
      installation.lastFueledYear = year;
      installation.condition = rn(
        Math.max(0.05, Math.min(1, installation.condition * 0.98 + result.utilization * 0.04)),
        4
      );
    }

    setSteamPumpTrials(trials);
    setSteamInstallations(installations);
    return true;
  }
}

export const SteamInstallations = new SteamInstallationsModule();

/** Extra drainage (0..STEAM_DRAINAGE_BONUS) for one mine that actually has a fueled engine. */
export function getMineSteamDrainageBonus(mineOperationId: number): number {
  const installation = getSteamInstallations().find(entry => entry.mineOperationId === mineOperationId);
  if (installation) return STEAM_DRAINAGE_BONUS * installation.utilization * installation.condition;
  const trial = getSteamPumpTrials().find(
    entry => entry.mineOperationId === mineOperationId && (entry.status === "running" || entry.status === "building")
  );
  if (trial) return STEAM_DRAINAGE_BONUS * 0.7 * trial.utilization;
  return 0;
}

export function countSteamEvidence(stateId: number): { trialYears: number; installations: number } {
  const mines = new Set(eligibleDeepMines(stateId).map(mine => mine.i));
  const trialYears = getSteamPumpTrials()
    .filter(trial => trial.stateId === stateId)
    .reduce((max, trial) => Math.max(max, trial.documentedRuns), 0);
  const installations = getSteamInstallations().filter(installation => mines.has(installation.mineOperationId)).length;
  return { trialYears, installations };
}
