import type React from "react";
import { routesEditorActions } from "../../controllers/routes-editor";
import { useRoutesEditorState } from "../../store/routesEditorState";
import { IconButton } from "../components/IconButton";
import { Dialog } from "./Dialog";

export const RoutesEditorDialog: React.FC = () => {
  const {
    isOpen,
    isCreatorOpen,
    routeName,
    routeGroup,
    routeLength,
    isWaterRoute,
    isLocked,
    isSplitMode,
    allGroups,
    creatorGroup,
    creatorPoints
  } = useRoutesEditorState();

  if (isOpen) {
    return (
      <Dialog isOpen={isOpen} title="Edit Route" onClose={routesEditorActions.closeRouteEditor}>
        <div id="routeEditor" className="editor-body">
          <div className="editor-row">
            <label htmlFor="routeName">Name:</label>
            <input
              id="routeName"
              type="text"
              value={routeName}
              onChange={e => routesEditorActions.changeName(e.target.value)}
            />
            <button
              type="button"
              id="routeGenerateName"
              className="icon-arrows-cw"
              data-tip="Click to generate a new name"
              onClick={routesEditorActions.generateName}
            />
          </div>

          <div className="editor-row">
            <label htmlFor="routeGroup">Group:</label>
            <select id="routeGroup" value={routeGroup} onChange={e => routesEditorActions.changeGroup(e.target.value)}>
              {allGroups.map(group => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
            <button
              type="button"
              id="routeGroupEdit"
              className="icon-pencil"
              data-tip="Click to edit route groups"
              onClick={routesEditorActions.editRouteGroups}
            />
            <button
              type="button"
              id="routeEditStyle"
              className="icon-brush"
              data-tip="Click to edit group style"
              onClick={routesEditorActions.editRouteGroupStyle}
            />
          </div>

          <div className="editor-row">
            <label htmlFor="routeLength">Length:</label>
            <span id="routeLength">{routeLength}</span>
          </div>

          <div className="editor-row d-flex">
            <button
              type="button"
              id="routeCreateSelectingCells"
              className="icon-plus"
              data-tip="Create a new route by clicking on cells"
              onClick={routesEditorActions.showCreationDialog}
            >
              New Route
            </button>
            <button
              type="button"
              id="routeSplit"
              className={`icon-scissors${isSplitMode ? " pressed" : ""}`}
              data-tip="Click to activate split mode. Then click on a route control point to split the route in two parts"
              onClick={routesEditorActions.toggleSplitMode}
            >
              Split
            </button>
            <button
              type="button"
              id="routeJoin"
              className="icon-link"
              data-tip="Join with another route"
              onClick={routesEditorActions.openJoinRoutesDialog}
            >
              Join
            </button>
            <button
              type="button"
              id="routeElevationProfile"
              className="icon-level-up"
              data-tip="Show route elevation profile"
              onClick={routesEditorActions.showRouteElevationProfile}
              style={{ display: isWaterRoute ? "none" : "inline-block" }}
            >
              Elevation
            </button>
            <button
              type="button"
              id="routeLegend"
              className="icon-list-bullet"
              data-tip="Edit route legend"
              onClick={routesEditorActions.editRouteLegend}
            >
              Legend
            </button>
            <button
              type="button"
              id="routeLock"
              className={isLocked ? "icon-lock" : "icon-lock-open"}
              data-tip="Lock/unlock route"
              onClick={routesEditorActions.toggleLockButton}
            >
              Lock
            </button>
            <button
              type="button"
              id="routeRemove"
              className="icon-trash-empty"
              data-tip="Remove route"
              onClick={routesEditorActions.removeRoute}
            >
              Remove
            </button>
          </div>
        </div>
      </Dialog>
    );
  }

  if (isCreatorOpen) {
    return (
      <Dialog isOpen={isCreatorOpen} title="Create Route" onClose={routesEditorActions.closeRouteCreator}>
        <div id="routeCreator" className="editor-body">
          <div className="editor-row">
            <label htmlFor="routeCreatorGroupSelect">Group:</label>
            <select
              id="routeCreatorGroupSelect"
              value={creatorGroup}
              onChange={e => routesEditorActions.changeCreatorGroup(e.target.value)}
            >
              {allGroups.map(group => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
            <button
              type="button"
              id="routeCreatorGroupEdit"
              className="icon-pencil"
              data-tip="Click to edit route groups"
              onClick={routesEditorActions.editRouteGroups}
            />
          </div>

          <div id="routeCreatorBody">
            {creatorPoints.map(pt => {
              const ptStr = `${pt.x}-${pt.y}-${pt.cellId}`;
              return (
                <div key={ptStr} className="d-grid">
                  <span>
                    <b>Cell</b>: {pt.cellId}
                  </span>
                  <span>
                    <b>X</b>: {pt.x}
                  </span>
                  <span>
                    <b>Y</b>: {pt.y}
                  </span>
                  <IconButton
                    data-tip="Remove the point"
                    className="icon-trash-empty pointer"
                    onClick={() => routesEditorActions.removeCreatorPoint(ptStr)}
                  />
                </div>
              );
            })}
          </div>

          <div className="editor-row d-flex">
            <button type="button" id="routeCreatorCancel" onClick={routesEditorActions.closeRouteCreator}>
              Cancel
            </button>
            <button
              type="button"
              id="routeCreatorComplete"
              className="primary"
              onClick={routesEditorActions.completeCreation}
            >
              Complete
            </button>
          </div>
        </div>
      </Dialog>
    );
  }

  return null;
};
