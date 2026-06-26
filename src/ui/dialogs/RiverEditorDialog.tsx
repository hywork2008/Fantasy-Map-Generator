import type React from "react";
import { riverEditorActions } from "../../editors/rivers-editor";
import { useDialogState } from "../../store/dialogState";
import { useRiverEditorState } from "../../store/riverEditorState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const RiverEditorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("riverEditor"));
  const { name, type, parent, parentOptions, basin, discharge, lengthUI, widthUI, sourceWidth, widthFactor } =
    useRiverEditorState();

  return (
    <Dialog isOpen={isOpen} title="River Editor" onClose={() => closeDialog("riverEditor")}>
      <div id="riverBody" style={{ paddingBottom: "0.3em" }}>
        <div>
          <div className="label" style={{ width: "4.8em" }}>
            Name:
          </div>
          <span
            id="riverNameCulture"
            data-tip="Generate culture-specific name for the river"
            className="icon-book pointer"
            onClick={riverEditorActions.generateNameCulture}
          ></span>
          <span
            id="riverNameRandom"
            data-tip="Generate random name for the river"
            className="icon-globe pointer"
            onClick={riverEditorActions.generateNameRandom}
          ></span>
          <input
            id="riverName"
            data-tip="Type to rename the river"
            autoCorrect="off"
            spellCheck="false"
            value={name}
            onChange={e => riverEditorActions.changeName(e.target.value)}
          />
          <span data-tip="Speak the name. You can change voice and language in options" className="speaker">
            🔊
          </span>
        </div>

        <div data-tip="Type to change river type (e.g. fork, creek, river, brook, stream)">
          <div className="label">Type:</div>
          <input
            id="riverType"
            autoCorrect="off"
            spellCheck="false"
            value={type}
            onChange={e => riverEditorActions.changeType(e.target.value)}
          />
        </div>

        <div data-tip="Select parent river">
          <div className="label">Mainstem:</div>
          <select id="riverMainstem" value={parent} onChange={e => riverEditorActions.changeParent(e.target.value)}>
            {parentOptions.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div data-tip="River drainage basin (watershed)">
          <div className="label">Basin:</div>
          <input id="riverBasin" disabled value={basin} />
        </div>

        <div data-tip="River discharge (flux power)">
          <div className="label">Discharge:</div>
          <input id="riverDischarge" disabled value={discharge} />
        </div>

        <div data-tip="River length in selected units">
          <div className="label">Length:</div>
          <input id="riverLength" disabled value={lengthUI} />
        </div>

        <div data-tip="River mouth width in selected units">
          <div className="label">Mouth width:</div>
          <input id="riverWidth" disabled value={widthUI} />
        </div>

        <div data-tip="River source additional width. Default value is 0">
          <div className="label">Source width:</div>
          <input
            id="riverSourceWidth"
            type="number"
            min="0"
            max="3"
            step=".01"
            value={sourceWidth}
            onChange={e => riverEditorActions.changeSourceWidth(Number(e.target.value))}
          />
        </div>

        <div data-tip="River width multiplier. Default value is 1">
          <div className="label">Width modifier:</div>
          <input
            id="riverWidthFactor"
            type="number"
            min=".1"
            max="4"
            step=".1"
            value={widthFactor}
            onChange={e => riverEditorActions.changeWidthFactor(Number(e.target.value))}
          />
        </div>
      </div>

      <div id="riverFooter">
        <button
          id="riverCreateSelectingCells"
          data-tip="Create a new river selecting river cells"
          className="icon-map-pin"
          type="button"
          onClick={riverEditorActions.createRiver}
        ></button>
        <button
          type="button"
          id="riverEditStyle"
          data-tip="Edit style for all rivers in Style Editor"
          className="icon-brush"
          onClick={riverEditorActions.editStyle}
        ></button>
        <button
          id="riverElevationProfile"
          data-tip="Show the elevation profile for the river"
          className="icon-chart-area"
          type="button"
          onClick={riverEditorActions.showRiverElevationProfile}
        ></button>
        <button
          type="button"
          id="riverLegend"
          data-tip="Edit free text notes (legend) for the river"
          className="icon-edit"
          onClick={riverEditorActions.editRiverLegend}
        ></button>
        <button
          id="riverRemove"
          data-tip="Remove river"
          data-shortcut="Delete"
          className="icon-trash fastDelete"
          type="button"
          onClick={riverEditorActions.removeRiver}
        ></button>
      </div>
    </Dialog>
  );
};
