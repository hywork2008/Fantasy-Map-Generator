/**
 * Electric telegraph lines: a State-funded capital asset that backs electricTelegraph's
 * demonstrated/adopted thresholds. Unlike PowerStations, a line has no fuel consumption and no
 * generation-capacity output of its own — the effect of telegraph adoption is the state-wide
 * technology-diffusion bonus in technologyProgress.ts's advanceStage() (docs/plan/
 * electric-power-and-telegraph.md §3.12), gated on the electricTelegraph technology stage itself.
 * Design: docs/plan/electric-power-and-telegraph.md §3.9 — same shape as powerStations.ts.
 */

import { getTechnologyStage } from "../../../generators/technologyProgress";
import { isTechnologyStageAtLeast } from "../../../generators/technologyTypes";
import { rn } from "../../hostUtils";
import {
  ANNUAL_GATE,
  getSimulationYear,
  getTelegraphLines,
  getWorldContext,
  setTelegraphLines,
  settleAnnualOnce
} from "../economyContext";
import {
  consumeNamed,
  debitTreasury,
  FACILITY_MAINTENANCE_RATE,
  marketIdForBurg,
  pickSponsorBurg,
  TELEGRAPH_LINE_BUDGET
} from "./chemMedCommon";

export class TelegraphLinesModule {
  settleAnnual(): boolean {
    const year = getSimulationYear();
    if (!settleAnnualOnce(ANNUAL_GATE.telegraphLines)) return false;

    const lines = [...getTelegraphLines()];
    const states = getWorldContext().pack.states ?? [];

    for (const state of states) {
      if (!state?.i || state.removed) continue;
      const stage = getTechnologyStage("electricTelegraph", state.i);
      if (!isTechnologyStageAtLeast(stage, "known")) continue;

      let line = lines.find(entry => entry.stateId === state.i && entry.active);
      if (!line) {
        const burgId = pickSponsorBurg(state.i);
        if (!burgId || !debitTreasury(state.i, TELEGRAPH_LINE_BUDGET)) continue;
        line = {
          burgId,
          stateId: state.i,
          role: "trial",
          active: true,
          utilization: 0,
          documentedRuns: 0,
          lastFundedYear: year
        };
        lines.push(line);
      } else if (isTechnologyStageAtLeast(stage, "adopted") && line.role === "trial") {
        line.role = "service";
      }

      if (!debitTreasury(state.i, rn(TELEGRAPH_LINE_BUDGET * FACILITY_MAINTENANCE_RATE, 2))) {
        line.active = false;
        line.lastFailureReason = "fundingCut";
        continue;
      }
      line.lastFundedYear = year;
      line.active = true;

      const marketId = marketIdForBurg(line.burgId);
      // Annual input scale: calibration TBD. No fuel — a telegraph line is wiring and relay
      // stations, not a powered machine.
      const copperWire = consumeNamed(marketId, "Copper Wire", 0.8);
      const machineParts = consumeNamed(marketId, "Machine Parts", 0.3);
      const coverage = Math.min(1, copperWire / 0.8, machineParts / 0.3);
      line.utilization = rn(Math.max(0, coverage), 4);

      if (line.utilization >= 0.5) {
        line.documentedRuns += 1;
      } else {
        line.lastFailureReason = "materialShortage";
      }
    }

    setTelegraphLines(lines);
    return true;
  }
}

export const TelegraphLines = new TelegraphLinesModule();
