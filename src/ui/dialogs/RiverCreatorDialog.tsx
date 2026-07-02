import type React from "react";
import { addRiver, closeRiverCreator, getCellFlux, setCellFlux } from "../../controllers/rivers-creator";
import { useDialogState } from "../../store/dialogState";
import { useRiverCreatorStore } from "../../store/riverCreatorStore";
import { Dialog } from "./Dialog";

export const RiverCreatorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("riverCreator"));
  const riverCells = useRiverCreatorStore(state => state.riverCells);
  const removeCell = useRiverCreatorStore(state => state.removeCell);

  const handleFluxChange = (cell: number, value: string) => {
    setCellFlux(cell, Number(value));
  };

  return (
    <Dialog isOpen={isOpen} title="River Creator" onClose={closeRiverCreator}>
      <div id="riverCreatorBody" className="table">
        {riverCells.map(cell => (
          <div key={cell} className="editorLine" data-cell={cell}>
            <span>Cell {cell}</span>
            <span data-tip="Set flux affects river width" className="-river-creator-dialog__margin-left-0-4em">
              Flux
            </span>
            <input
              type="number"
              min="0"
              defaultValue={getCellFlux(cell)}
              className="editFlux -river-creator-dialog__width-5em"
              onChange={e => handleFluxChange(cell, e.target.value)}
            />
            <span
              data-tip="Remove the cell"
              className="icon-trash-empty pointer"
              onClick={() => removeCell(cell)}
            ></span>
          </div>
        ))}
      </div>
      <div id="riverCreatorFooter" className="fmg-dialog-footer">
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
