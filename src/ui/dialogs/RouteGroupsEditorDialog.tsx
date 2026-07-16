import type React from "react";
import { useEffect } from "react";
import { refreshRouteGroups, routeGroupsAddGroup, routeGroupsRemoveGroup } from "../../controllers/route-group-editor";
import { editStyle } from "../../controllers/style";
import { useDialogState } from "../../store/dialogState";
import { useRouteGroupsEditorStore } from "../../store/routeGroupsEditorStore";
import { IconButton } from "../components/IconButton";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const RouteGroupsEditorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("routeGroupsEditor"));
  const groups = useRouteGroupsEditorStore(state => state.groups);

  // When dialog is open, ensure data is fresh
  useEffect(() => {
    if (isOpen) {
      refreshRouteGroups();
    }
  }, [isOpen]);

  return (
    <Dialog isOpen={isOpen} title="Route Groups Editor" onClose={() => closeDialog("routeGroupsEditor")}>
      <div id="routeGroupsEditorBody" className="table">
        {groups.map(group => (
          <div key={group.id} data-id={group.id} className="states d-flex">
            <span>
              {group.id} ({group.count})
            </span>
            <div className="d-flex">
              <IconButton
                data-tip="Edit style"
                className="editStyle icon-brush pointer"
                onClick={() => editStyle("routes", group.id)}
              ></IconButton>
              <IconButton
                data-tip="Remove group"
                className="removeGroup icon-trash pointer"
                onClick={() => routeGroupsRemoveGroup(group.id)}
              ></IconButton>
            </div>
          </div>
        ))}
      </div>
      <div id="routeGroupsEditorFooter" className="footer">
        <button
          type="button"
          id="routeGroupsEditorAdd"
          data-tip="Add route group"
          className="icon-plus"
          onClick={routeGroupsAddGroup}
        ></button>
      </div>
    </Dialog>
  );
};
