import type React from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { loadMapUrlDialogStore, useLoadMapUrlDialogState } from "../../store/loadMapUrlDialogState";
import { Dialog } from "./Dialog";

const URL_PATTERN = /(ftp|http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-/]))?/;

export const LoadMapFromUrlDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useLoadMapUrlDialogState(s => s.isOpen);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  const close = () => {
    setUrl("");
    setError("");
    loadMapUrlDialogStore.getState().close();
  };

  const load = () => {
    if (!URL_PATTERN.test(url)) {
      setError(t("dialogs.load.invalidUrl"));
      return;
    }
    loadMapUrlDialogStore.getState().onLoad(url);
    close();
  };

  return (
    <Dialog
      isOpen={isOpen}
      title={t("dialogs.titles.loadMapFromUrl")}
      onClose={close}
      buttons={[
        { label: t("common.load"), onClick: load },
        { label: t("common.cancel"), onClick: close }
      ]}
    >
      <div>
        <label>
          {t("dialogs.load.fromUrlLabel")}
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://e-cloud.com/test.map"
          />
        </label>
        {error && <div>{error}</div>}
        <p>
          <i>{t("dialogs.load.corsNote")}</i>
        </p>
      </div>
    </Dialog>
  );
};
