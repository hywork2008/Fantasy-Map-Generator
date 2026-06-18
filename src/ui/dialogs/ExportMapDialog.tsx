import type React from "react";
import { useEffect, useRef } from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";

export const ExportMapDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("exportMapData"));
  const closeDialog = useDialogState(state => state.closeDialog);
  const showLabelsRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && showLabelsRef.current) {
      const hideLabels = document.getElementById("hideLabels") as HTMLInputElement | null;
      if (hideLabels) {
        showLabelsRef.current.checked = !hideLabels.checked;
      }
    }
  }, [isOpen]);

  return (
    <Dialog
      isOpen={isOpen}
      title="Export map data"
      onClose={() => closeDialog("exportMapData")}
      buttons={[{ label: "Close", onClick: () => closeDialog("exportMapData") }]}
      style={{ width: "26em" }}
    >
      <div id="exportMapData">
        <div style={{ marginBottom: "0.3em", fontWeight: "bold" }}>Download image</div>
        <div>
          <button type="button" data-tip="Download the map as vector image (open directly in browser or Inkscape)">
            .svg
          </button>
          <button type="button" data-tip="Download visible part of the map as .png (lossless compressed)">
            .png
          </button>
          <button type="button" data-tip="Download visible part of the map as .jpeg (lossy compressed) image">
            .jpeg
          </button>
          <button type="button" data-tip="Split map into smaller png tiles and download as zip archive">
            tiles
          </button>
          <span data-tip="Check to not allow system to automatically hide labels">
            <input
              id="showLabels"
              ref={showLabelsRef}
              className="checkbox"
              type="checkbox"
              onChange={e => {
                const hideLabels = document.getElementById("hideLabels") as HTMLInputElement | null;
                if (hideLabels) {
                  hideLabels.checked = !e.target.checked;
                }
              }}
            />
            <label htmlFor="showLabels" className="checkbox-label" style={{ marginLeft: "1.2em" }}>
              <i>show labels</i>
            </label>
          </span>
        </div>
      </div>
    </Dialog>
  );
};
