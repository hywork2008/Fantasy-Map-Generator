import type React from "react";
import { useTranslation } from "react-i18next";
import { closeDialog, Dialog, useDialogState } from "../../../hostUi";

export const ProductionChainsDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("productionChains"));

  return (
    <Dialog
      isOpen={isOpen}
      title={t("extensions.titles.productionChains")}
      onClose={() => closeDialog("productionChains")}
    >
      <div id="productionChainsContent" />
    </Dialog>
  );
};
