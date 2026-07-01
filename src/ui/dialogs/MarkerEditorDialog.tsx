import type React from "react";
import { closeMarkerEditor, markersEditorActions } from "../../controllers/markers-editor";
import { showElementLockTip } from "../../services/tooltipService";
import { useMarkersEditorState } from "../../store/markersEditorState";
import { Dialog } from "./Dialog";

export const MarkerEditorDialog: React.FC = () => {
  const { isOpen, type, icon, iconSize, iconShiftX, iconShiftY, size, pin, fill, stroke, isLocked, isAdding } =
    useMarkersEditorState();

  if (!isOpen) return null;

  const isExternal = icon.startsWith("http") || icon.startsWith("data:image");

  return (
    <Dialog isOpen={isOpen} title="Marker Editor" onClose={closeMarkerEditor}>
      <div id="markerBody" className="-marker-editor-dialog__padding-bottom-0-3em">
        <div data-tip="Marker type. Style changes will apply to all markers of the same type. Leave blank if the marker is unique">
          <div className="label">Type:</div>
          <input
            id="markerType"
            className="-marker-editor-dialog__width-10-3em"
            value={type}
            onChange={e => markersEditorActions.changeMarkerType(e.target.value)}
          />
        </div>

        <div data-tip="Marker icon" className="-marker-editor-dialog__display-flex--align-items-center">
          <div className="label">Icon:</div>
          <div id="markerIcon" className="-marker-editor-dialog__font-size-1-5em--width-3-7em">
            {isExternal ? (
              <img src={icon} alt="marker icon" className="-marker-editor-dialog__width-1em--height-1em" />
            ) : (
              icon
            )}
          </div>
          <button
            type="button"
            id="markerIconSelect"
            className="-marker-editor-dialog__width-5em"
            onClick={markersEditorActions.changeMarkerIcon}
          >
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
            className="-marker-editor-dialog__width-5em"
            value={size}
            onChange={e => markersEditorActions.changeMarkerSize(Number(e.target.value))}
          />
          <input
            data-tip="Marker icon sizes in pixels"
            id="markerIconSize"
            type="number"
            min="2"
            max="20"
            step="0.5"
            className="-marker-editor-dialog__width-5em"
            value={iconSize}
            onChange={e => markersEditorActions.changeIconSize(Number(e.target.value))}
          />
        </div>

        <div data-tip="Marker icon shift (by X and by Y axis), percent. Set to 50 to position icon in center">
          <div className="label">Icon shift:</div>
          <input
            id="markerIconShiftX"
            type="number"
            min="0"
            max="100"
            step="1"
            className="-marker-editor-dialog__width-5em"
            value={iconShiftX}
            onChange={e => markersEditorActions.changeIconShiftX(Number(e.target.value))}
          />
          <input
            id="markerIconShiftY"
            type="number"
            min="0"
            max="100"
            step="1"
            className="-marker-editor-dialog__width-5em"
            value={iconShiftY}
            onChange={e => markersEditorActions.changeIconShiftY(Number(e.target.value))}
          />
        </div>

        <div data-tip="Marker pin shape">
          <div className="label">Pin shape:</div>
          <select
            id="markerPin"
            className="-marker-editor-dialog__width-10-3em"
            value={pin}
            onChange={e => markersEditorActions.changeMarkerPin(e.target.value)}
          >
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
          <input
            id="markerFill"
            type="color"
            className="-marker-editor-dialog__width-5em--height-1-6em"
            value={fill}
            onChange={e => markersEditorActions.changePinFill(e.target.value)}
          />
          <input
            id="markerStroke"
            type="color"
            className="-marker-editor-dialog__width-5em--height-1-6em"
            value={stroke}
            onChange={e => markersEditorActions.changePinStroke(e.target.value)}
          />
        </div>
      </div>

      <div id="markerFooter">
        <button
          type="button"
          id="markerNotes"
          data-tip="Edit place legend (notes)"
          className="icon-edit"
          onClick={markersEditorActions.editMarkerLegend}
        ></button>
        <button
          type="button"
          id="markerLock"
          className={isLocked ? "icon-lock" : "icon-lock-open"}
          onMouseOver={e => showElementLockTip(e.nativeEvent)}
          onClick={markersEditorActions.toggleMarkerLock}
        ></button>
        <button
          type="button"
          id="markerAdd"
          data-tip="Add additional marker of that type"
          className={`icon-plus ${isAdding ? "pressed" : ""}`}
          onClick={markersEditorActions.toggleAddMarker}
        ></button>
        <button
          id="markerRemove"
          data-tip="Remove the marker"
          data-shortcut="Delete"
          className="icon-trash fastDelete"
          type="button"
          onClick={markersEditorActions.confirmMarkerDeletion}
        ></button>
      </div>
    </Dialog>
  );
};
