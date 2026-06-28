import type React from "react";
import { loadErrorDialogStore, useLoadErrorDialogState } from "../../store/loadErrorDialogState";
import { VERSION } from "../../versioning";
import { Dialog } from "./Dialog";

export const LoadErrorDialog: React.FC = () => {
  const isOpen = useLoadErrorDialogState(s => s.isOpen);
  const errorText = useLoadErrorDialogState(s => s.errorText);
  const mapVersion = useLoadErrorDialogState(s => s.mapVersion);
  const { onClearCache, onSelectFile, onNewMap } = loadErrorDialogStore.getState();

  const close = () => loadErrorDialogStore.getState().close();

  return (
    <Dialog
      isOpen={isOpen}
      title="Loading error"
      onClose={close}
      style={{ maxWidth: "40em" }}
      buttons={[
        {
          label: "Clear cache",
          onClick: () => {
            close();
            onClearCache();
          }
        },
        {
          label: "Select file",
          onClick: () => {
            close();
            onSelectFile();
          }
        },
        {
          label: "New map",
          onClick: () => {
            close();
            onNewMap();
          }
        },
        { label: "Cancel", onClick: close }
      ]}
    >
      <div>
        <p>
          An error occurred while loading the map. Select a different file to load, generate a new random map or cancel
          the loading.
        </p>
        <p>
          Map version: {mapVersion}. Generator version: {VERSION}.
        </p>
        <p id="errorBox" style={{ fontFamily: "monospace", fontSize: "0.85em", wordBreak: "break-all" }}>
          {errorText}
        </p>
      </div>
    </Dialog>
  );
};
