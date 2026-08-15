import type React from "react";
import { useTranslation } from "react-i18next";
import { regeneratePrompt, showExportPane, showLoadPane, showSavePane } from "../../controllers/options";
import { useDialogState } from "../../store/dialogState";
import { useGenerationProgressState } from "../../store/generationProgressState";
import { useMapReadyTaskState } from "../../store/mapReadyTaskState";

export const Sticked: React.FC = () => {
  const { t } = useTranslation();
  const isMapGenerationInProgress = useGenerationProgressState(state => state.isOpen);
  const canConfigureInitialMap = useGenerationProgressState(
    state => state.isOpen && !state.isGenerating && state.isInitialGeneration
  );
  const isMapReadyTaskRunning = useMapReadyTaskState(state => state.isRunning);
  const openDialogs = useDialogState(state => state.openDialogs);

  const triggerToolAction = (eventName: string) => {
    document.dispatchEvent(new CustomEvent("react-tool-action", { detail: { action: eventName } }));
  };

  const toolsUnavailable = isMapGenerationInProgress || isMapReadyTaskRunning;

  return (
    <div id="sticked">
      <button
        type="button"
        id="newMapButton"
        data-tip={t("sticked.newMapTip")}
        data-shortcut="F2"
        onClick={() => regeneratePrompt()}
        disabled={isMapGenerationInProgress}
      >
        {t("sticked.newMap")}
      </button>
      <button
        type="button"
        id="exportButton"
        data-tip={t("sticked.exportTip")}
        onClick={() => void showExportPane()}
        disabled={isMapGenerationInProgress || isMapReadyTaskRunning}
      >
        {t("sticked.export")}
      </button>
      <button
        type="button"
        id="saveButton"
        data-tip={t("sticked.saveTip")}
        onClick={() => showSavePane()}
        disabled={isMapGenerationInProgress || isMapReadyTaskRunning}
      >
        {t("sticked.save")}
      </button>
      <button
        type="button"
        id="loadButton"
        data-tip={t("sticked.loadTip")}
        onClick={() => void showLoadPane()}
        disabled={isMapGenerationInProgress && !canConfigureInitialMap}
      >
        {t("sticked.load")}
      </button>
      <button
        type="button"
        id="optionsReset"
        data-tip={t("uiSettings.resetDefaultsTip")}
        onClick={() => document.dispatchEvent(new CustomEvent("react-cleanup-data"))}
      >
        {t("uiSettings.resetDefaults")}
      </button>
      <button
        type="button"
        id="stickedCellsButton"
        data-tip={t("sticked.cellsTip")}
        className={openDialogs.has("cellInfo") ? "pressed" : undefined}
        onClick={() => triggerToolAction("overviewCellsButton")}
        disabled={toolsUnavailable}
      >
        {t("sticked.cells")}
      </button>
      <button
        type="button"
        id="stickedAdvanceTimeButton"
        data-tip={t("sticked.advanceTimeTip")}
        className={openDialogs.has("advanceTime") ? "pressed" : undefined}
        onClick={() => triggerToolAction("openAdvanceTimeDialog")}
        disabled={toolsUnavailable}
      >
        {t("sticked.advanceTime")}
      </button>
    </div>
  );
};
