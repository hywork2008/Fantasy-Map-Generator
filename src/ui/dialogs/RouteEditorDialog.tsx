import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { callWindowFn } from "../../utils/windowGlobals";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const RouteEditorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("routeEditor"));

  return (
    <Dialog isOpen={isOpen} title="Route Editor" onClose={() => closeDialog("routeEditor")}>
      <div id="routeBody" style={{ paddingBottom: "0.3em" }}>
        <div>
          <div className="label">Name:</div>
          <input id="routeName" data-tip="Type to rename the route" autoCorrect="off" spellCheck="false" />
          <span data-tip="Speak the name. You can change voice and language in options" className="speaker">
            🔊
          </span>
          <span id="routeGenerateName" data-tip="Generate route name" className="icon-globe pointer"></span>
        </div>

        <div data-tip="Select route group">
          <div className="label">Group:</div>
          <select id="routeGroup"></select>
          <span id="routeGroupEdit" data-tip="Edit route groups" className="icon-pencil pointer"></span>
          <span id="routeEditStyle" data-tip="Edit style for the route group" className="icon-brush pointer"></span>
        </div>

        <div data-tip="Route length in selected units">
          <div className="label">Length:</div>
          <input id="routeLength" disabled />
        </div>
      </div>

      <div id="routeBottom">
        <button
          id="routeCreateSelectingCells"
          data-tip="Create a new route selecting route cells"
          className="icon-map-pin"
          type="button"
        ></button>
        <button
          id="routeJoin"
          data-tip="Click to join the route to another route that starts or ends at the same cell"
          className="icon-link"
          type="button"
        ></button>
        <button
          id="routeSplit"
          data-tip="Click on a control point to split the route there"
          className="icon-unlink"
          type="button"
        ></button>
        <button
          id="routeElevationProfile"
          data-tip="Show the elevation profile for the route"
          className="icon-chart-area"
          type="button"
        ></button>
        <button
          type="button"
          id="routeLegend"
          data-tip="Edit free text notes (legend) for the route"
          className="icon-edit"
        ></button>
        <button
          type="button"
          id="routeLock"
          className="icon-lock-open"
          onMouseOver={e => callWindowFn("showElementLockTip", e)}
        ></button>
        <button
          id="routeRemove"
          data-tip="Remove route"
          data-shortcut="Delete"
          className="icon-trash fastDelete"
          type="button"
        ></button>
      </div>
    </Dialog>
  );
};
