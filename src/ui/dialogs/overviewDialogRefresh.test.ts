import { afterEach, describe, expect, it } from "vitest";
import { useBurgsOverviewState } from "../../store/burgsOverviewState";
import { dialogStore } from "../../store/dialogState";
import { useMarkersOverviewState } from "../../store/markersOverviewState";
import { useMilitaryOverviewState } from "../../store/militaryOverviewState";
import { usePopulationOverviewState } from "../../store/populationOverviewState";
import { useRegimentsOverviewState } from "../../store/regimentsOverviewState";
import { useRiversOverviewState } from "../../store/riversOverviewState";
import { useRoutesOverviewState } from "../../store/routesOverviewState";
import { useTechnologyOverviewState } from "../../store/technologyOverviewState";
import { registerOverviewDialogRefreshers } from "./overviewDialogRefresh";

registerOverviewDialogRefreshers();

afterEach(() => {
  dialogStore.getState().closeAllDialogs();
});

describe("Overview dialog refresh registration", () => {
  it("refreshes each overview store before its dialog opens", () => {
    const refreshCounters: ReadonlyArray<readonly [string, () => number]> = [
      ["burgsOverview", () => useBurgsOverviewState.getState().refreshCounter],
      ["markersOverview", () => useMarkersOverviewState.getState().refreshCounter],
      ["militaryOverview", () => useMilitaryOverviewState.getState().refreshCounter],
      ["populationOverview", () => usePopulationOverviewState.getState().refreshCounter],
      ["regimentsOverview", () => useRegimentsOverviewState.getState().refreshCounter],
      ["riversOverview", () => useRiversOverviewState.getState().refreshCounter],
      ["routesOverview", () => useRoutesOverviewState.getState().refreshCounter],
      ["technologyOverview", () => useTechnologyOverviewState.getState().refreshCounter]
    ];

    for (const [dialogId, getRefreshCounter] of refreshCounters) {
      const beforeOpen = getRefreshCounter();

      dialogStore.getState().openDialog(dialogId);

      expect(getRefreshCounter()).toBe(beforeOpen + 1);
      dialogStore.getState().closeDialog(dialogId);
    }
  });
});
