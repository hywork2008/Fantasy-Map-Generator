import { createInstance } from "i18next";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../context/worldContext";
import { createLandCalibrationWorldFixture } from "../../generators/fixtures/landConnectionCalibrationWorld";
import type { WorldLandProposalResult } from "../../generators/worldLandConnectionProposals";
import ja from "../../i18n/locales/ja.json";
import {
  getWorldLandProposalReport,
  publishWorldLandProposalReport,
  recordWorldLandProposalAdoption
} from "../../services/worldLandProposalReport";
import { LandConnectionAssessmentReport } from "./LandConnectionAssessmentReport";

const original = { ...worldContext };
let host: HTMLDivElement, root: Root;
const i18n = createInstance();
let identity = 1000;
beforeEach(async () => {
  Object.assign(worldContext, createLandCalibrationWorldFixture().world, { mapId: identity++ });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await i18n.init({ lng: "ja", resources: { ja: { translation: ja } }, interpolation: { escapeValue: false } });
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  Object.assign(worldContext, original);
});
const render = () =>
  act(async () =>
    root.render(
      <I18nextProvider i18n={i18n}>
        <LandConnectionAssessmentReport />
      </I18nextProvider>
    )
  );

describe("route overview connection explanation", () => {
  it("hides absent reports and updates proposed/adopted decisions with translated cost reasons", async () => {
    await render();
    expect(host.innerHTML).toBe("");
    worldContext.pack.burgs[1].name = "<img src=x>";
    const result = {
      status: "evaluated",
      diagnostics: {
        enumeration: null,
        approachAttempts: 2,
        assessmentSearches: 3,
        rejected: [],
        individuals: [
          {
            pairId: 1,
            assessment: {
              status: "proposed",
              comparison: { searches: 3 },
              travelSavingMeters: null,
              netImprovementMeters: null,
              newFacilityIds: [100],
              newConnectionIds: [1000],
              route: {
                facilityIds: [100],
                costs: { travelMeters: 70, constructionMeters: 50, repeatCrossingMeters: 10 }
              }
            }
          }
        ]
      }
    } as unknown as WorldLandProposalResult;
    const pairs = [{ id: 1, cityAId: 1, cityBId: 2, weight: 1, unconnectedAllowanceMeters: 200 }];
    await act(async () => publishWorldLandProposalReport(worldContext, result, pairs));
    expect(host.textContent).toContain("直近の接続評価");
    expect(host.textContent).toContain("有限の整備上限内で未接続の都市を結ぶ");
    expect(host.textContent).toContain("提案");
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector("tbody tr")?.textContent).toContain("80");
    await act(async () => recordWorldLandProposalAdoption(worldContext, result, "individual", 1, [100]));
    expect(host.textContent).toContain("採用済み");
    const snapshot = getWorldLandProposalReport(worldContext)!;
    expect(Object.isFrozen(snapshot.explanations[0].facilityIds)).toBe(true);
    worldContext.mapId++;
    await render();
    expect(host.innerHTML).toBe("");
  });
  it("shows exhausted work as incomplete and ignores stale adoption notifications", async () => {
    const first = {
      status: "unresolved",
      reason: "assessment-budget",
      diagnostics: {
        enumeration: null,
        approachAttempts: 0,
        assessmentSearches: 1,
        rejected: [],
        individuals: []
      }
    } as WorldLandProposalResult;
    const second = structuredClone(first);
    publishWorldLandProposalReport(worldContext, second, []);
    const before = getWorldLandProposalReport(worldContext);
    recordWorldLandProposalAdoption(worldContext, first, "shared", 0, [100]);
    expect(getWorldLandProposalReport(worldContext)).toBe(before);
    await render();
    expect(host.textContent).toContain("評価未完了");
    expect(host.textContent).toContain("比較の予算を使い切ったため未判定");
  });
});
