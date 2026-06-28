import type React from "react";
import { useBurgGroupSelectionState } from "../../store/burgGroupSelectionState";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";
import { FeaturesSelectionDialog } from "./FeaturesSelectionDialog";
import { SelectionDialog } from "./SelectionDialog";

export const BurgGroupsEditorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("burgGroupsEditor"));
  const selDialog = useBurgGroupSelectionState(s => s.dialog);
  const closeSelDialog = useBurgGroupSelectionState(s => s.close);

  return (
    <>
      <Dialog isOpen={isOpen} title="BurgGroups Editor" onClose={() => closeDialog("burgGroupsEditor")}>
        <div id="burgGroupsEditorContainer">
          <div>
            <form id="burgGroupsForm">
              <table className="table">
                <thead>
                  <tr>
                    <th data-tip="Rendering order: higher values are rendered on top">Order</th>
                    <th data-tip="Type group name">Name</th>
                    <th data-tip="Burg preview generator">Preview generator</th>
                    <th data-tip="Set min population constraint" colSpan={3}>
                      Population
                    </th>
                    <th data-tip="Select allowed biomes">Biomes</th>
                    <th data-tip="Select allowed states">States</th>
                    <th data-tip="Select allowed cultures">Cultures</th>
                    <th data-tip="Select allowed religions">Religions</th>
                    <th data-tip="Select allowed features">Features</th>
                    <th data-tip="Number of burgs in group">Count</th>
                    <th data-tip="Activate/deactivate group">Active</th>
                    <th data-tip="Select group to be assigned if burg doesn't pass the criteria for other groups">
                      Default
                    </th>
                  </tr>
                </thead>
                <tbody id="burgGroupsBody" />
              </table>
            </form>
          </div>
        </div>
      </Dialog>
      {selDialog?.kind === "items" && (
        <SelectionDialog
          isOpen={true}
          title={selDialog.title}
          byLabel={selDialog.byLabel}
          items={selDialog.items}
          initial={selDialog.initial}
          onApply={selDialog.onApply}
          onClose={closeSelDialog}
        />
      )}
      {selDialog?.kind === "features" && (
        <FeaturesSelectionDialog
          isOpen={true}
          initial={selDialog.initial}
          onApply={selDialog.onApply}
          onClose={closeSelDialog}
        />
      )}
    </>
  );
};
