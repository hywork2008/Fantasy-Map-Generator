import type React from "react";
import { resetZoom } from "../../actions";
import { regeneratePrompt, showExportPane, showLoadPane, showSavePane } from "../../controllers/options";

export const Sticked: React.FC = () => {
  return (
    <div id="sticked">
      <button
        type="button"
        id="newMapButton"
        data-tip="Generate a new map based on options"
        data-shortcut="F2"
        onClick={() => regeneratePrompt()}
      >
        New Map
      </button>
      <button
        type="button"
        id="exportButton"
        data-tip="Select format to download image or export map data"
        onClick={() => void showExportPane()}
      >
        Export
      </button>
      <button type="button" id="saveButton" data-tip="Save fully-functional map file" onClick={() => showSavePane()}>
        Save
      </button>
      <button
        type="button"
        id="loadButton"
        data-tip="Load fully-functional map (.map or .gz formats)"
        onClick={() => void showLoadPane()}
      >
        Load
      </button>
      <button
        type="button"
        id="zoomReset"
        data-tip="Reset map zoom"
        data-shortcut="0 (zero)"
        onClick={() => resetZoom(1000)}
      >
        Reset Zoom
      </button>
    </div>
  );
};
