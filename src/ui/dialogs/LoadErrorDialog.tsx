import type React from "react";
import { useTranslation } from "react-i18next";
import { loadErrorDialogStore, useLoadErrorDialogState } from "../../store/loadErrorDialogState";
import { VERSION } from "../../versioning";
import { Dialog } from "./Dialog";

export const LoadErrorDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useLoadErrorDialogState(s => s.isOpen);
  const errorText = useLoadErrorDialogState(s => s.errorText);
  const mapVersion = useLoadErrorDialogState(s => s.mapVersion);
  const { onClearCache, onSelectFile, onNewMap } = loadErrorDialogStore.getState();

  const close = () => loadErrorDialogStore.getState().close();

  return (
    <Dialog
      isOpen={isOpen}
      title={t("dialogs.titles.loadingError")}
      onClose={close}
      buttons={[
        {
          label: t("dialogs.errors.clearCache"),
          onClick: () => {
            close();
            onClearCache();
          }
        },
        {
          label: t("dialogs.errors.selectFile"),
          onClick: () => {
            close();
            onSelectFile();
          }
        },
        {
          label: t("dialogs.errors.newMap"),
          onClick: () => {
            close();
            onNewMap();
          }
        },
        { label: t("common.cancel"), onClick: close }
      ]}
    >
      <div>
        <p>{t("dialogs.errors.loadBody")}</p>
        <p>{t("dialogs.errors.loadVersions", { mapVersion, generatorVersion: VERSION })}</p>
        <p id="errorBox">{errorText}</p>
      </div>
    </Dialog>
  );
};
