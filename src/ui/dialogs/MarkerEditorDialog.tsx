import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { showElementLockTip } from "../../utils/uiHelpers";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const MarkerEditorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("markerEditor"));

  return (
    <Dialog isOpen={isOpen} title="Marker Editor" onClose={() => closeDialog("markerEditor")}>
      <div id="markerBody" style={{ paddingBottom: "0.3em" }}>
        <div data-tip="Marker type. Style changes will apply to all markers of the same type. Leave blank if the marker is unique">
          <div className="label">Type:</div>
          <input id="markerType" style={{ width: "10.3em" }} />
        </div>

        <div data-tip="Marker icon" style={{ display: "flex", alignItems: "center" }}>
          <div className="label">Icon:</div>
          <div id="markerIcon" style={{ fontSize: "1.5em", width: "3.7em" }}>
            👑
          </div>
          <button type="button" id="markerIconSelect" style={{ width: "5em" }}>
            select
          </button>
        </div>

        <div data-tip="Marker marker element and icon sizes in pixels">
          <div className="label">Size:</div>
          <input
            data-tip="Marker element size in pixels"
            id="markerSize"
            type="number"
            min="2"
            max="500"
            style={{ width: "5em" }}
          />
          <input
            data-tip="Marker icon sizes in pixels"
            id="markerIconSize"
            type="number"
            min="2"
            max="20"
            step="0.5"
            style={{ width: "5em" }}
          />
        </div>

        <div data-tip="Marker icon shift (by X and by Y axis), percent. Set to 50 to position icon in center">
          <div className="label">Icon shift:</div>
          <input id="markerIconShiftX" type="number" min="0" max="100" step="1" style={{ width: "5em" }} />
          <input id="markerIconShiftY" type="number" min="0" max="100" step="1" style={{ width: "5em" }} />
        </div>

        <div data-tip="Marker pin shape">
          <div className="label">Pin shape:</div>
          <select id="markerPin" style={{ width: "10.3em" }}>
            <option value="bubble">Bubble</option>
            <option value="pin">Pin</option>
            <option value="square">Square</option>
            <option value="squarish">Squarish</option>
            <option value="diamond">Diamond</option>
            <option value="hex">Hex</option>
            <option value="hexy">Hexy</option>
            <option value="shieldy">Shieldy</option>
            <option value="shield">Shield</option>
            <option value="pentagon">Pentagon</option>
            <option value="heptagon">Heptagon</option>
            <option value="circle">Circle</option>
            <option value="no">No</option>
          </select>
        </div>

        <div data-tip="Pin fill and stroke colors">
          <div className="label">Pin colors:</div>
          <input id="markerFill" type="color" style={{ width: "5em", height: "1.6em" }} />
          <input id="markerStroke" type="color" style={{ width: "5em", height: "1.6em" }} />
        </div>
      </div>

      <div id="markerFooter">
        <button type="button" id="markerNotes" data-tip="Edit place legend (notes)" className="icon-edit"></button>
        <button
          type="button"
          id="markerLock"
          className="icon-lock-open"
          onMouseOver={e => showElementLockTip(e.nativeEvent)}
        ></button>
        <button
          type="button"
          id="markerAdd"
          data-tip="Add additional marker of that type"
          className="icon-plus"
        ></button>
        <button
          id="markerRemove"
          data-tip="Remove the marker"
          data-shortcut="Delete"
          className="icon-trash fastDelete"
          type="button"
        ></button>
      </div>
    </Dialog>
  );
};
