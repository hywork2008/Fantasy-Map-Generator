import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const ElevationProfileDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("elevationProfile"));

  return (
    <Dialog isOpen={isOpen} title="Elevation Profile" onClose={() => closeDialog("elevationProfile")}>
      <div id="elevationGraph" data-tip="Elevation profile"></div>
      <div style={{ textAlign: "center" }}>
        <div id="epControls">
          <span data-tip="Set curve profile">
            Curve:{" "}
            <select id="epCurve" defaultValue="Monotone X">
              <option>Linear</option>
              <option>Bundle</option>
              <option>Cubic Catmull-Rom</option>
              <option value="Monotone X">Monotone X</option>
              <option>Natural</option>
            </select>
          </span>
          <span>
            <button
              type="button"
              id="epSave"
              data-tip="Download the chart data as a CSV file"
              className="icon-download"
            ></button>
          </span>
          <span>
            <button type="button" id="epSaveSVG" data-tip="Download the chart as an SVG image">
              SVG
            </button>
          </span>
          <span>
            <button type="button" id="epSavePNG" data-tip="Download the chart as a PNG image">
              PNG
            </button>
          </span>
          <span id="epstats" style={{ marginLeft: "1em", color: "#555", fontSize: "0.85em" }}></span>
        </div>
      </div>
    </Dialog>
  );
};
