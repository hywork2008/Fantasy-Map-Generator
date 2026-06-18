import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const RiverEditorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("riverEditor"));

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
          ></span>
          <span
            id="riverNameRandom"
            data-tip="Generate random name for the river"
            className="icon-globe pointer"
          ></span>
          <input id="riverName" data-tip="Type to rename the river" autoCorrect="off" spellCheck="false" />
          <span data-tip="Speak the name. You can change voice and language in options" className="speaker">
            🔊
          </span>
        </div>

        <div data-tip="Type to change river type (e.g. fork, creek, river, brook, stream)">
          <div className="label">Type:</div>
          <input id="riverType" autoCorrect="off" spellCheck="false" />
        </div>

        <div data-tip="Select parent river">
          <div className="label">Mainstem:</div>
          <select id="riverMainstem"></select>
        </div>

        <div data-tip="River drainage basin (watershed)">
          <div className="label">Basin:</div>
          <input id="riverBasin" disabled />
        </div>

        <div data-tip="River discharge (flux power)">
          <div className="label">Discharge:</div>
          <input id="riverDischarge" disabled />
        </div>

        <div data-tip="River length in selected units">
          <div className="label">Length:</div>
          <input id="riverLength" disabled />
        </div>

        <div data-tip="River mouth width in selected units">
          <div className="label">Mouth width:</div>
          <input id="riverWidth" disabled />
        </div>

        <div data-tip="River source additional width. Default value is 0">
          <div className="label">Source width:</div>
          <input id="riverSourceWidth" type="number" min="0" max="3" step=".01" />
        </div>

        <div data-tip="River width multiplier. Default value is 1">
          <div className="label">Width modifier:</div>
          <input id="riverWidthFactor" type="number" min=".1" max="4" step=".1" />
        </div>
      </div>

      <div id="riverFooter">
        <button
          id="riverCreateSelectingCells"
          data-tip="Create a new river selecting river cells"
          className="icon-map-pin"
          type="button"
        ></button>
        <button
          type="button"
          id="riverEditStyle"
          data-tip="Edit style for all rivers in Style Editor"
          className="icon-brush"
        ></button>
        <button
          id="riverElevationProfile"
          data-tip="Show the elevation profile for the river"
          className="icon-chart-area"
          type="button"
        ></button>
        <button
          type="button"
          id="riverLegend"
          data-tip="Edit free text notes (legend) for the river"
          className="icon-edit"
        ></button>
        <button
          id="riverRemove"
          data-tip="Remove river"
          data-shortcut="Delete"
          className="icon-trash fastDelete"
          type="button"
        ></button>
      </div>
    </Dialog>
  );
};
