import type React from "react";
import { useRef } from "react";
import { Trans, useTranslation } from "react-i18next";
import { connectToDropbox, loadURL } from "../../controllers/options";
import { createSharableDropboxLink, loadFromDropbox, quickLoad, uploadMap } from "../../io/load";
import { useDialogState } from "../../store/dialogState";
import { useLoadMapDialogState } from "../../store/loadMapDialogState";
import { Dialog } from "./Dialog";
import { closeDialog, closeDialogs } from "./dialogService";

export const LoadMapDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("loadMapData"));
  const isDropboxConnected = useLoadMapDialogState(state => state.isDropboxConnected);
  const isDropboxLoading = useLoadMapDialogState(state => state.isDropboxLoading);
  const dropboxStatus = useLoadMapDialogState(state => state.dropboxStatus);
  const dropboxFiles = useLoadMapDialogState(state => state.dropboxFiles);
  const selectedDropboxPath = useLoadMapDialogState(state => state.selectedDropboxPath);
  const setSelectedDropboxPath = useLoadMapDialogState(state => state.setSelectedDropboxPath);
  const sharableLinkUrl = useLoadMapDialogState(state => state.sharableLinkUrl);
  const sharableLinkLabel = useLoadMapDialogState(state => state.sharableLinkLabel);
  const isSharableLinkVisible = useLoadMapDialogState(state => state.isSharableLinkVisible);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasDropboxFiles = dropboxFiles.length > 0;
  const showDropboxSelect = isDropboxConnected;
  const showDropboxButtons = isDropboxConnected && hasDropboxFiles;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileToLoad = e.currentTarget.files?.[0];
    if (!fileToLoad) return;
    e.currentTarget.value = "";
    closeDialogs();
    uploadMap(fileToLoad);
  };

  const handleLoadFromMachine = () => {
    fileInputRef.current?.click();
  };

  return (
    <Dialog isOpen={isOpen} title={t("dialogs.titles.loadMap")} onClose={() => closeDialog("loadMapData")}>
      <input
        ref={fileInputRef}
        id="mapToLoad"
        type="file"
        accept=".fmg,.map,.gz"
        className="d-none"
        onChange={handleFileChange}
      />
      <div>
        <strong>{t("dialogs.load.loadFrom")}</strong>{" "}
        <button data-tip={t("dialogs.load.machineTip")} type="button" onClick={handleLoadFromMachine}>
          {t("dialogs.load.machine")}
        </button>{" "}
        <button data-tip={t("dialogs.load.urlTip")} type="button" onClick={() => loadURL()}>
          {t("dialogs.load.url")}
        </button>{" "}
        <button type="button" data-tip={t("dialogs.load.storageTip")} onClick={() => quickLoad()}>
          {t("dialogs.load.storage")}
        </button>
      </div>

      <p>
        <Trans i18nKey="dialogs.load.storageHint" />
      </p>

      <div id="loadFromDropbox">
        <p>
          {t("dialogs.load.dropboxIntro")}{" "}
          {!isDropboxConnected && (
            <button
              id="dropboxConnectButton"
              data-tip={t("dialogs.load.connectTip")}
              type="button"
              onClick={() => connectToDropbox()}
            >
              {t("common.connect")}
            </button>
          )}
        </p>

        {showDropboxSelect && (
          <select
            id="loadFromDropboxSelect"
            value={selectedDropboxPath}
            onChange={event => setSelectedDropboxPath(event.target.value)}
          >
            {hasDropboxFiles
              ? dropboxFiles.map(({ name, updated, size, path }) => {
                  const sizeMB = `${(size / 1024 / 1024).toFixed(2)} MB`;
                  const updatedOn = new Date(updated).toLocaleDateString();
                  const label = `${updatedOn}: ${name} [${sizeMB}]`;
                  return (
                    <option key={path} value={path}>
                      {label}
                    </option>
                  );
                })
              : [
                  <option key="status" value="" disabled>
                    {isDropboxLoading
                      ? t("dialogs.load.loading")
                      : (dropboxStatus ?? t("dialogs.load.saveToDropboxFirst"))}
                  </option>
                ]}
          </select>
        )}
        {showDropboxButtons && (
          <div id="loadFromDropboxButtons">
            <button type="button" data-tip={t("dialogs.load.loadFromDropboxTip")} onClick={() => loadFromDropbox()}>
              {t("common.load")}
            </button>{" "}
            <button data-tip={t("dialogs.load.shareTip")} type="button" onClick={() => createSharableDropboxLink()}>
              {t("common.share")}
            </button>
          </div>
        )}

        <div>
          <div id="sharableLinkContainer" style={{ display: isSharableLinkVisible ? "block" : "none" }}>
            <a id="sharableLink" href={sharableLinkUrl || "#"} target="_blank" rel="noreferrer">
              {sharableLinkLabel || " "}
            </a>
            <i data-tip={t("dialogs.load.copyLink")} className="icon-clone pointer"></i>
          </div>
        </div>
      </div>
    </Dialog>
  );
};
