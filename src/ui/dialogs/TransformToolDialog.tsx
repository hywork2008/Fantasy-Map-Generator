import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const TransformToolDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("transformTool"));

  return (
    <Dialog isOpen={isOpen} title="Transform Tool" onClose={() => closeDialog("transformTool")}>
      <div style={{ paddingTop: "0.5em", width: "40em", fontWeight: "bold" }}>
        This operation is destructive and irreversible. It will create a completely new map based on the current one.
        Don't forget to save the .map file to your machine first!
      </div>

      <div
        id="transformToolBody"
        style={{
          padding: "0.5em 0",
          width: "100%",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "repeat(5, 1fr)",
          alignItems: "center"
        }}
      >
        <div>Points number</div>
        <div>
          <input id="transformPointsInput" type="range" min="1" max="13" defaultValue="4" />
          <output id="transformPointsFormatted" style={{ color: "#053305" }}>
            10K
          </output>
        </div>

        <div>Shift</div>
        <div>
          <label>
            X: <input id="transformShiftX" type="number" size={4} defaultValue="0" />
          </label>
          <label>
            Y: <input id="transformShiftY" type="number" size={4} defaultValue="0" />
          </label>
        </div>

        <div>Rotate</div>
        <div>
          <input id="transformAngleInput" type="range" min="0" max="359" defaultValue="0" />
          <output id="transformAngleOutput">0</output>°
        </div>

        <div>Scale</div>
        <div>
          <input id="transformScaleInput" type="range" min="-25" max="25" defaultValue="0" />
          <output id="transformScaleResult">1</output>x
        </div>

        <div>Mirror</div>
        <div style={{ display: "flex", gap: "0.5em" }}>
          <input type="checkbox" className="checkbox" id="transformMirrorH" />
          <label htmlFor="transformMirrorH" className="checkbox-label">
            horizontally
          </label>
          <input type="checkbox" className="checkbox" id="transformMirrorV" />
          <label htmlFor="transformMirrorV" className="checkbox-label">
            vertically
          </label>
        </div>
      </div>

      <div id="transformPreview" style={{ position: "relative", overflow: "hidden", outline: "1px solid #666" }}>
        <canvas id="transformPreviewCanvas" style={{ position: "absolute", transformOrigin: "center" }}></canvas>
      </div>
    </Dialog>
  );
};
