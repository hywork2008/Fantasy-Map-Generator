import type React from "react";
import { useTranslation } from "react-i18next";
import { generationErrorDialogStore, useGenerationErrorDialogState } from "../../store/generationErrorDialogState";
import { Dialog } from "./Dialog";

export const GenerationErrorDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useGenerationErrorDialogState(s => s.isOpen);
  const errorText = useGenerationErrorDialogState(s => s.errorText);
  const { onCleanup, onRegenerate } = generationErrorDialogStore.getState();

  const close = () => generationErrorDialogStore.getState().close();

  return (
    <Dialog
      isOpen={isOpen}
      title={t("dialogs.titles.generationError")}
      onClose={close}
      buttons={[
        {
          label: t("dialogs.errors.cleanupData"),
          onClick: () => {
            close();
            onCleanup();
          }
        },
        {
          label: t("dialogs.errors.regenerate"),
          onClick: () => {
            close();
            onRegenerate();
          }
        },
        { label: t("common.ignore"), onClick: close }
      ]}
    >
      <div>
        <p>{t("dialogs.errors.generationBody")}</p>
        <p>{t("dialogs.errors.generationCritical")}</p>
        <p id="errorBox">{errorText}</p>
      </div>
    </Dialog>
  );
};
