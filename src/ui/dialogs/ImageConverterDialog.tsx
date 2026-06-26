import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const ImageConverterDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("imageConverter"));

  return (
    <Dialog isOpen={isOpen} title="ImageConverter" onClose={() => closeDialog("imageConverter")}>
      <div id="imageConverterContainer">
        <div>
          <div id="convertImageButtons">
            <button type="button" id="convertImageLoad" data-tip="Load image to convert" className="icon-upload" />
            <button
              type="button"
              id="convertAutoLum"
              data-tip="Auto-assign colors based on liminosity (good for monochrome images)"
              className="icon-adjust"
            />
            <button
              type="button"
              id="convertAutoHue"
              data-tip="Auto-assign colors based on hue (good for colored images)"
              className="icon-paint-roller"
            />
            <button
              type="button"
              id="convertAutoFMG"
              data-tip="Auto-assign colors using generator scheme (for exported colored heightmaps)"
              className="icon-layer-group"
            />
            <button
              type="button"
              id="convertColorsButton"
              data-tip="Set maximum number of colors"
              className="icon-signal"
            />
            <input id="convertColors" defaultValue={100} style={{ display: "none" }} />
            <button
              type="button"
              id="convertCancel"
              data-tip="Cancel the conversion. Previous heightmap will be restored"
              className="icon-cancel"
            />
          </div>
          <div data-tip="Set opacity of the loaded image" style={{ paddingTop: "0.4em" }}>
            <i>Overlay opacity:</i>
            <br />
            <input
              id="convertOverlay"
              type="range"
              min={0}
              max={1}
              step=".01"
              defaultValue={0}
              style={{ width: "12.6em" }}
            />
            <input
              id="convertOverlayNumber"
              type="number"
              min={0}
              max={1}
              step=".01"
              defaultValue={0}
              style={{ width: "4.2em" }}
            />
          </div>
          <div
            data-tip="Select a color below and assign a height value for it"
            id="colorsSelect"
            style={{ display: "none" }}
          >
            <i>Set height: </i>
            <span id="colorsSelectValue" />
            <span>
              (<span id="colorsSelectFriendly">0</span>)
            </span>
            <br />
            <div id="imageConverterPalette" />
          </div>
          <div data-tip="Select a color to re-assign the height value" id="colorsAssigned" style={{ display: "none" }}>
            <i>
              Assigned colors (<span id="colorsAssignedNumber" />
              ):
            </i>
            <div id="colorsAssignedContainer" className="colorsContainer" />
          </div>
          <div data-tip="Select a color to assign a height value" id="colorsUnassigned" style={{ display: "none" }}>
            <i>
              Unassigned colors (<span id="colorsUnassignedNumber" />
              ):
            </i>
            <div id="colorsUnassignedContainer" className="colorsContainer" />
          </div>
          <button
            type="button"
            id="convertComplete"
            data-tip="Complete the conversion. All unassigned colors will be considered as ocean"
            style={{ margin: "0.4em 0" }}
            className="glow"
          >
            Complete the conversion
          </button>
        </div>
      </div>
    </Dialog>
  );
};
