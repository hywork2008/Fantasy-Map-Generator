import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { FrontierStatusPanel } from "../components/tabs/FrontierStatusPanel";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const FrontierOperationsDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("frontierOperations"));

  return (
    <Dialog
      isOpen={isOpen}
      title="Frontier Operations"
      onClose={() => closeDialog("frontierOperations")}
      style={{ minWidth: "320px" }}
    >
      <FrontierStatusPanel />
    </Dialog>
  );
};
