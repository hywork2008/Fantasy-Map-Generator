import type React from "react";

export const Sticked: React.FC = () => {
  return (
    <div id="sticked">
      <button type="button" id="newMapButton" data-tip="Generate a new map based on options" data-shortcut="F2">
        New Map
      </button>
      <button type="button" id="exportButton" data-tip="Select format to download image or export map data">
        Export
      </button>
      <button type="button" id="saveButton" data-tip="Save fully-functional map file">
        Save
      </button>
      <button type="button" id="loadButton" data-tip="Load fully-functional map (.map or .gz formats)">
        Load
      </button>
      <button type="button" id="zoomReset" data-tip="Reset map zoom" data-shortcut="0 (zero)">
        Reset Zoom
      </button>
    </div>
  );
};
