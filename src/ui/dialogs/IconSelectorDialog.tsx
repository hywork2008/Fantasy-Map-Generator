import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const IconSelectorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("iconSelector"));

  return (
    <Dialog isOpen={isOpen} title="Select icon" onClose={() => closeDialog("iconSelector")}>
      <div>
        <b>Unicode emojis</b>
        <div style={{ fontStyle: "italic" }}>
          <span>Select from the list or paste a Unicode character here: </span>
          <input id="iconInput" style={{ width: "2.5em" }} />
          <span>
            . See{" "}
            <a href="https://emojidb.org" target="_blank" rel="noreferrer">
              EmojiDB
            </a>{" "}
            to search for emojis
          </span>
        </div>
        <table
          id="iconTable"
          className="table pointer"
          style={{ fontSize: "2em", textAlign: "center", width: "100%" }}
        ></table>
      </div>

      <div style={{ marginTop: "0.5em" }}>
        <b>External images</b>
        <div style={{ fontStyle: "italic" }}>
          <span>Paste link to the image here: </span>
          <input id="imageInput" style={{ width: "20em" }} />
          <button id="addImage" type="button">
            Add
          </button>
        </div>
        <div id="addedIcons" className="pointer" style={{ display: "flex", flexWrap: "wrap", maxWidth: "420px" }}></div>
      </div>
    </Dialog>
  );
};
