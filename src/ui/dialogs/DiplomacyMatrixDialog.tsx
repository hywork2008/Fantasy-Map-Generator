import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const DiplomacyMatrixDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("diplomacyMatrix"));

  return (
    <Dialog isOpen={isOpen} title="Diplomacy Matrix" onClose={() => closeDialog("diplomacyMatrix")}>
      <div id="diplomacyMatrixBody" className="matrix-table"></div>
    </Dialog>
  );
};
