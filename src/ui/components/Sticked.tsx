import type React from "react";
import { resetZoom } from "../../actions";
import { regeneratePrompt, showExportPane, showLoadPane, showSavePane } from "../../controllers/options";
import { useGenerationProgressState } from "../../store/generationProgressState";
import { useMapReadyTaskState } from "../../store/mapReadyTaskState";

export const Sticked: React.FC = () => {
  const isMapGenerationInProgress = useGenerationProgressState(state => state.isOpen);
  const canConfigureInitialMap = useGenerationProgressState(
    state => state.isOpen && !state.isGenerating && state.isInitialGeneration
  );
  const isMapReadyTaskRunning = useMapReadyTaskState(state => state.isRunning);

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
        id="zoomReset"
        data-tip="Reset map zoom"
        data-shortcut="0 (zero)"
        onClick={() => resetZoom(1000)}
        disabled={isMapGenerationInProgress}
      >
        Reset Zoom
      </button>
    </div>
  );
};
