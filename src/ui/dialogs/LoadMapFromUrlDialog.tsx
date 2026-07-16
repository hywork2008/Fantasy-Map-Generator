import type React from "react";
import { useState } from "react";
import { loadMapUrlDialogStore, useLoadMapUrlDialogState } from "../../store/loadMapUrlDialogState";
import { Dialog } from "./Dialog";

const URL_PATTERN = /(ftp|http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-/]))?/;

export const LoadMapFromUrlDialog: React.FC = () => {
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
      setError("Please provide a valid URL");
      return;
    }
    loadMapUrlDialogStore.getState().onLoad(url);
    close();
  };

  return (
    <Dialog
      isOpen={isOpen}
      title="Load map from URL"
      onClose={close}
      buttons={[
        { label: "Load", onClick: load },
        { label: "Cancel", onClick: close }
      ]}
    >
      <div>
        <label>
          Provide URL to map file:
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://e-cloud.com/test.map"
          />
        </label>
        {error && <div>{error}</div>}
        <p>
          <i>
            Please note server should allow CORS for file to be loaded. If CORS is not allowed, save file to Dropbox and
            provide a direct link
          </i>
        </p>
      </div>
    </Dialog>
  );
};
