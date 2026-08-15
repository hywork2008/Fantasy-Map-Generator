import type React from "react";
import { useTranslation } from "react-i18next";
import { burgsRenamingDialogStore, useBurgsRenamingDialogState } from "../../store/burgsRenamingDialogState";
import { Dialog } from "./Dialog";

export const BurgsRenamingDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useBurgsRenamingDialogState(s => s.isOpen);
  const close = () => burgsRenamingDialogStore.getState().close();

  const download = () => {
    burgsRenamingDialogStore.getState().onDownload();
  };

  const upload = () => {
    burgsRenamingDialogStore.getState().onUpload();
  };

  return (
    <Dialog
      isOpen={isOpen}
      title={t("dialogs.titles.burgsRenaming")}
      onClose={close}
      buttons={[
        { label: "Download", onClick: download },
        { label: "Upload", onClick: upload },
        { label: "Cancel", onClick: close }
      ]}
    >
      <p>
        Download burgs list as a text file, make changes and re-upload the file. Make sure the file is a plain text
        document with each name on its own line (the delimiter is CRLF). If you do not want to change the name, just
        leave it as is.
      </p>
    </Dialog>
  );
};
