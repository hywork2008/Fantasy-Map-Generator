import type React from "react";
import { useTranslation } from "react-i18next";
import { closeIceEditor, iceEditorActions } from "../../controllers/ice-editor";
import { useIceEditorState } from "../../store/iceEditorState";
import { Dialog } from "./Dialog";

export const IceEditorDialog: React.FC = () => {
  const { t } = useTranslation();
  const { isOpen, type, size, isAdding } = useIceEditorState();

  if (!isOpen) return null;
  const isIceberg = type === "Iceberg";

  return (
    <Dialog isOpen={isOpen} title={t("dialogs.titles.editIce", { type })} onClose={closeIceEditor}>
      <button
        type="button"
        id="iceEditStyle"
        data-tip="Edit style in Style Editor"
        className="icon-brush"
        onClick={iceEditorActions.openStyleEditor}
      ></button>

      {isIceberg && (
        <>
          <button
            type="button"
            id="iceRandomize"
            data-tip="Randomize Iceberg shape"
            className="icon-shuffle"
            onClick={iceEditorActions.randomizeShape}
          ></button>
          <input
            id="iceSize"
            data-tip="Change Iceberg size"
            type="range"
            min=".05"
            max="2"
            step=".01"
            value={size}
            onChange={e => iceEditorActions.changeSize(Number(e.target.value))}
          />
        </>
      )}

      <button
        type="button"
        id="iceNew"
        data-tip="Add an Iceberg (click on map)"
        className={`icon-plus ${isAdding ? "pressed" : ""}`}
        onClick={iceEditorActions.toggleAdd}
      ></button>

      <button
        id="iceRemove"
        data-tip="Remove the element"
        data-shortcut="Delete"
        className="icon-trash fastDelete"
        type="button"
        onClick={iceEditorActions.removeIce}
      ></button>
    </Dialog>
  );
};
