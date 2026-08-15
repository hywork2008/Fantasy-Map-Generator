import type React from "react";
import { useTranslation } from "react-i18next";
import { addRiver, closeRiverCreator, getCellFlux, setCellFlux } from "../../controllers/rivers-creator";
import { useDialogState } from "../../store/dialogState";
import { useRiverCreatorStore } from "../../store/riverCreatorStore";
import { IconButton } from "../components/IconButton";
import { Dialog } from "./Dialog";

export const RiverCreatorDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("riverCreator"));
  const riverCells = useRiverCreatorStore(state => state.riverCells);
  const removeCell = useRiverCreatorStore(state => state.removeCell);

  const handleFluxChange = (cell: number, value: string) => {
    setCellFlux(cell, Number(value));
  };

  return (
    <Dialog isOpen={isOpen} title={t("dialogs.titles.riverCreator")} onClose={closeRiverCreator}>
      <div id="riverCreatorBody" className="table">
        {riverCells.map(cell => (
          <div key={cell} data-cell={cell}>
            <span>Cell {cell}</span>
            <span data-tip="Set flux affects river width">Flux</span>
            <input
              type="number"
              min="0"
              defaultValue={getCellFlux(cell)}
              className="editFlux"
              onChange={e => handleFluxChange(cell, e.target.value)}
            />
            <IconButton
              data-tip="Remove the cell"
              className="icon-trash-empty pointer"
              onClick={() => removeCell(cell)}
            ></IconButton>
          </div>
        ))}
      </div>
      <div id="riverCreatorFooter" className="footer">
        <button
          type="button"
          id="riverCreatorComplete"
          data-tip="Complete river creation"
          className="icon-check"
          onClick={addRiver}
        ></button>
        <button
          type="button"
          id="riverCreatorCancel"
          data-tip="Cancel the creation"
          className="icon-cancel"
          onClick={closeRiverCreator}
        ></button>
      </div>
    </Dialog>
  );
};
