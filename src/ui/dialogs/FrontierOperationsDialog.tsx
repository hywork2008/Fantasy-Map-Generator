import type React from "react";
import { useTranslation } from "react-i18next";
import { useDialogState } from "../../store/dialogState";
import { FrontierStatusPanel } from "../components/tabs/FrontierStatusPanel";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const FrontierOperationsDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("frontierOperations"));

  return (
    <Dialog
      isOpen={isOpen}
      title={t("dialogs.titles.frontierOperations")}
      onClose={() => closeDialog("frontierOperations")}
      style={{ minWidth: "320px" }}
    >
      <FrontierStatusPanel />
    </Dialog>
  );
};
