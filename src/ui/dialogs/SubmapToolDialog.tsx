import type React from "react";
import { useEffect, useState } from "react";
import { cellsDensityMap, getCellsDensityColor } from "../../controllers/options";
import { submapToolActions } from "../../controllers/submap-tool";
import { useDialogState } from "../../store/dialogState";
import { useOptionsState } from "../../store/optionsState";
import { Dialog } from "./Dialog";
import { closeAllDialogs, closeDialog } from "./dialogService";

export const SubmapToolDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("submapTool"));
  const defaultPoints = useOptionsState(state => state.points);

  const [pointsValue, setPointsValue] = useState<number>(defaultPoints);
  const [rescaleBurgStyles, setRescaleBurgStyles] = useState<boolean>(true);

  // Sync pointsValue when dialog opens if needed
  useEffect(() => {
    if (isOpen) {
      setPointsValue(defaultPoints);
      setRescaleBurgStyles(true);
    }
  }, [isOpen, defaultPoints]);

  const handleGenerate = () => {
    closeAllDialogs();
    submapToolActions.generateSubmap(pointsValue, rescaleBurgStyles);
  };

  const cells = cellsDensityMap[pointsValue] || 10000;
  const cellsColor = getCellsDensityColor(cells);

  return (
    <Dialog
      isOpen={isOpen}
      title="Create a submap"
      onClose={() => closeDialog("submapTool")}
      buttons={[
        { label: "Submap", onClick: handleGenerate },
        { label: "Cancel", onClick: () => closeDialog("submapTool") }
      ]}
    >
      <p className="-submap-tool-dialog__font-weight-bold">
        This operation is destructive and irreversible. It will create a completely new map based on the current one.
        Don't forget to save the .map file to your machine first!
      </p>

      <div className="-submap-tool-dialog__display-flex--flex-direction-column--gap-0-5em">
        <div data-tip="Set points (cells) number of the submap" className="-submap-tool-dialog__display-flex--gap-1em">
          <div>Points number</div>
          <div>
            <input
              id="submapPointsInput"
              type="range"
              min="1"
              max="13"
              value={pointsValue}
              onChange={e => setPointsValue(Number(e.target.value))}
            />
            <output id="submapPointsFormatted" style={{ color: cellsColor, marginLeft: "0.5em" }}>
              {cells / 1000}K
            </output>
          </div>
        </div>

        <div data-tip="Check to fit burg styles (icon and label size) to the submap scale">
          <input
            type="checkbox"
            className="checkbox"
            id="submapRescaleBurgStyles"
            checked={rescaleBurgStyles}
            onChange={e => setRescaleBurgStyles(e.target.checked)}
          />
          <label htmlFor="submapRescaleBurgStyles" className="checkbox-label">
            Rescale burg styles
          </label>
        </div>
      </div>
    </Dialog>
  );
};
