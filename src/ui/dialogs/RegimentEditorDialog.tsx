import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const RegimentEditorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("regimentEditor"));

  return (
    <Dialog isOpen={isOpen} title="Regiment Editor" onClose={() => closeDialog("regimentEditor")}>
      <div id="regimentBody" style={{ paddingBottom: "0.3em" }}>
        <div style={{ paddingBottom: "0.2em" }}>
          <button type="button" id="regimentType" data-tip="Regiment type (land or naval). Click to change"></button>
          <input
            id="regimentName"
            data-tip="Type to rename the regiment"
            autoCorrect="off"
            spellCheck="false"
            style={{ width: "13em" }}
          />
          <span data-tip="Speak the name. You can change voice and language in options" className="speaker">
            🔊
          </span>
          <i
            id="regimentNameRestore"
            data-tip="Click to restore regiment's default name"
            className="icon-ccw pointer"
          ></i>
        </div>

        <div data-tip="Regiment emblem" style={{ display: "flex", alignItems: "center" }}>
          <div className="label">Emblem:</div>
          <div id="regimentEmblem" style={{ fontSize: "1.5em", width: "3.7em" }}></div>
          <button type="button" id="regimentEmblemChange" style={{ padding: 0, width: "4.5em" }}>
            change
          </button>
        </div>

        <div id="regimentComposition" className="table"></div>
      </div>

      <div id="regimentFooter">
        <button type="button" id="regimentAttack" data-tip="Attack foreign regiment" className="icon-target"></button>
        <button
          type="button"
          id="regimentAdd"
          data-tip="Create a new regiment or fleet"
          className="icon-user-plus"
        ></button>
        <button
          type="button"
          id="regimentSplit"
          data-tip="Split regiment into 2 separate ones"
          className="icon-half"
        ></button>
        <button
          id="regimentAttach"
          data-tip="Attach regiment to another one (include this regiment to another one)"
          className="icon-attach"
          type="button"
        ></button>
        <button
          id="regimentRegenerateLegend"
          data-tip="Regenerate legend for this regiment"
          className="icon-retweet"
          type="button"
        ></button>
        <button
          id="regimentLegend"
          data-tip="Edit free text notes (legend) for this regiment"
          className="icon-edit"
          type="button"
        ></button>
        <button
          id="regimentRemove"
          data-tip="Remove regiment"
          data-shortcut="Delete"
          className="icon-trash fastDelete"
          type="button"
        ></button>
      </div>
    </Dialog>
  );
};
