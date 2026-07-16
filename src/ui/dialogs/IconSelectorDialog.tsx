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
        <div>
          <span>Select from the list or paste a Unicode character here: </span>
          <input id="iconInput" />
          <span>
            . See{" "}
            <a href="https://emojidb.org" target="_blank" rel="noreferrer">
              EmojiDB
            </a>{" "}
            to search for emojis
          </span>
        </div>
        <table id="iconTable" className="table pointer"></table>
      </div>

      <div>
        <b>External images</b>
        <div>
          <span>Paste link to the image here: </span>
          <input id="imageInput" />
          <button id="addImage" type="button">
            Add
          </button>
        </div>
        <div id="addedIcons" className="pointer d-flex"></div>
      </div>
    </Dialog>
  );
};
