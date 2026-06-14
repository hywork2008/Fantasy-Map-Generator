import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const LakeEditorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("lakeEditor"));

  return (
    <Dialog isOpen={isOpen} title="Lake Editor" onClose={() => closeDialog("lakeEditor")}>
      <div id="lakeBody" style={{ paddingBottom: "0.3em" }}>
        <div>
          <div className="label" style={{ width: "4.8em" }}>
            Name:
          </div>
          <span
            id="lakeNameCulture"
            data-tip="Generate culture-specific name for the lake"
            className="icon-book pointer"
          ></span>
          <span id="lakeNameRandom" data-tip="Generate random name for the lake" className="icon-globe pointer"></span>
          <input id="lakeName" data-tip="Type to rename the lake" autoCorrect="off" spellCheck="false" />
          <span data-tip="Speak the name. You can change voice and language in options" className="speaker">
            🔊
          </span>
        </div>

        <div data-tip="Type to change lake type (group)">
          <div className="label" style={{ width: "4.8em" }}>
            Type:
          </div>
          <span id="lakeGroupRemove" data-tip="Remove the group" className="icon-trash-empty pointer"></span>
          <span
            id="lakeGroupAdd"
            data-tip="Create a new type (group) for the lake"
            className="icon-plus pointer"
          ></span>
          <select id="lakeGroup" data-tip="Select lake type (group)"></select>
          <input
            id="lakeGroupName"
            placeholder="type name"
            data-tip="Provide a name for the new group"
            style={{ display: "none" }}
          />
          <span
            id="lakeEditStyle"
            data-tip="Edit lake group style in Style Editor"
            className="icon-brush pointer"
          ></span>
        </div>

        <div data-tip="Lake area in selected units">
          <div className="label">Area:</div>
          <input id="lakeArea" disabled />
        </div>

        <div data-tip="Lake shore length in selected units">
          <div className="label">Shore length:</div>
          <input id="lakeShoreLength" disabled />
        </div>

        <div data-tip="Lake elevation in selected units">
          <div className="label">Elevation:</div>
          <input id="lakeElevation" disabled />
        </div>

        <div data-tip="Lake average depth in selected units">
          <div className="label">Average depth:</div>
          <input id="lakeAverageDepth" disabled />
        </div>

        <div data-tip="Lake maximum depth in selected units">
          <div className="label">Max depth:</div>
          <input id="lakeMaxDepth" disabled />
        </div>

        <div data-tip="Lake water supply. If supply > evaporation and there is an outlet, the lake water is fresh. If supply is very low, the lake becomes dry">
          <div className="label">Supply:</div>
          <input id="lakeFlux" disabled />
        </div>

        <div data-tip="Evaporation from lake surface. If evaporation > supply, the lake water is saline. If difference is high, the lake becomes dry">
          <div className="label">Evaporation:</div>
          <input id="lakeEvaporation" disabled />
        </div>

        <div data-tip="Number of lake inlet rivers">
          <div className="label">Inlets:</div>
          <input id="lakeInlets" disabled />
        </div>

        <div data-tip="Lake outlet river">
          <div className="label">Outlet:</div>
          <input id="lakeOutlet" disabled />
        </div>
      </div>

      <div id="lakeBottom">
        <button
          type="button"
          id="lakeLegend"
          data-tip="Edit free text notes (legend) for the lake"
          className="icon-edit"
        ></button>
      </div>
    </Dialog>
  );
};
