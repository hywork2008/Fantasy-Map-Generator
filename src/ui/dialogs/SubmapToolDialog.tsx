import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const SubmapToolDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("submapTool"));

  return (
    <Dialog isOpen={isOpen} title="Submap Tool" onClose={() => closeDialog("submapTool")}>
      <p style={{ fontWeight: "bold" }}>
        This operation is destructive and irreversible. It will create a completely new map based on the current one.
        Don't forget to save the .map file to your machine first!
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5em" }}>
        <div data-tip="Set points (cells) number of the submap" style={{ display: "flex", gap: "1em" }}>
          <div>Points number</div>
          <div>
            <input id="submapPointsInput" type="range" min="1" max="13" defaultValue="4" />
            <output id="submapPointsFormatted" style={{ color: "#053305" }}>
              10K
            </output>
          </div>
        </div>

        <div data-tip="Check to fit burg styles (icon and label size) to the submap scale">
          <input type="checkbox" className="checkbox" id="submapRescaleBurgStyles" defaultChecked />
          <label htmlFor="submapRescaleBurgStyles" className="checkbox-label">
            Rescale burg styles
          </label>
        </div>
      </div>
    </Dialog>
  );
};
