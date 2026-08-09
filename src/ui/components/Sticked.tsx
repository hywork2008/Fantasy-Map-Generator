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
        data-tip="Generate a new map based on options"
        data-shortcut="F2"
        onClick={() => regeneratePrompt()}
        disabled={isMapGenerationInProgress}
      >
        New Map
      </button>
      <button
        type="button"
        id="exportButton"
        data-tip="Select format to download image or export map data"
        onClick={() => void showExportPane()}
        disabled={isMapGenerationInProgress || isMapReadyTaskRunning}
      >
        Export
      </button>
      <button
        type="button"
        id="saveButton"
        data-tip="Save fully-functional map file"
        onClick={() => showSavePane()}
        disabled={isMapGenerationInProgress || isMapReadyTaskRunning}
      >
        Save
      </button>
      <button
        type="button"
        id="loadButton"
        data-tip="Load fully-functional map (.map or .gz formats)"
        onClick={() => void showLoadPane()}
        disabled={isMapGenerationInProgress && !canConfigureInitialMap}
      >
        Load
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
        data-tip="Click to open Cell details view"
        className={openDialogs.has("cellInfo") ? "pressed" : undefined}
        onClick={() => triggerToolAction("overviewCellsButton")}
        disabled={toolsUnavailable}
      >
        Cells
      </button>
      <button
        type="button"
        id="stickedAdvanceTimeButton"
        data-tip="Click to open the Advance Time dialog and step the world's simulation clock forward by years, months, or days"
        className={openDialogs.has("advanceTime") ? "pressed" : undefined}
        onClick={() => triggerToolAction("openAdvanceTimeDialog")}
        disabled={toolsUnavailable}
      >
        Advance Time
      </button>
    </div>
  );
};
