import type React from "react";
import { Trans, useTranslation } from "react-i18next";
import { saveMap } from "../../io/save";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";

export const SaveMapDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("saveMapData"));
  const closeDialog = useDialogState(state => state.closeDialog);

  return (
    <Dialog
      isOpen={isOpen}
      title={t("dialogs.titles.saveMap")}
      onClose={() => closeDialog("saveMapData")}
      buttons={[{ label: t("common.close"), onClick: () => closeDialog("saveMapData") }]}
    >
      <div>
        <strong>{t("dialogs.save.saveTo")}</strong>
        <button data-tip={t("dialogs.save.machineTip")} type="button" onClick={() => saveMap("machine")}>
          {t("dialogs.save.machine")}
        </button>
        <button type="button" data-tip={t("dialogs.save.dropboxTip")} onClick={() => saveMap("dropbox")}>
          {t("dialogs.save.dropbox")}
        </button>
        <button type="button" data-tip={t("dialogs.save.browserTip")} onClick={() => saveMap("storage")}>
          {t("dialogs.save.browser")}
        </button>
      </div>
      <p>
        <Trans i18nKey="dialogs.save.note" />
      </p>
    </Dialog>
  );
};
