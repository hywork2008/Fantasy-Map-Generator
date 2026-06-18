import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const ReliefEditorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("reliefEditor"));

  return (
    <Dialog isOpen={isOpen} title="Relief Editor" onClose={() => closeDialog("reliefEditor")}>
      <div id="reliefTools" data-tip="Select mode of operation">
        <div className="reliefEditorLabel">Mode:</div>
        <button
          type="button"
          id="reliefIndividual"
          data-tip="Edit individual selected icon"
          className="icon-info pressed"
        ></button>
        <button type="button" id="reliefBulkAdd" data-tip="Place icons in a bulk" className="icon-brush"></button>
        <button type="button" id="reliefBulkRemove" data-tip="Remove icons in a bulk" className="icon-eraser"></button>

        <div style={{ marginLeft: "4.6em" }}>Set:</div>
        <select id="reliefEditorSet">
          <option value="simple">Simple</option>
          <option value="colored">Colored</option>
          <option value="gray">Gray</option>
        </select>
      </div>

      <div id="reliefSizeDiv" data-tip="Set icon size for individual icon or for bulk placement">
        <div className="reliefEditorLabel">Size:</div>
        <input
          id="reliefSize"
          type="range"
          min="2"
          max="50"
          defaultValue="5"
          onInput={e => {
            const num = document.getElementById("reliefSizeNumber") as HTMLInputElement;
            if (num) num.value = e.currentTarget.value;
          }}
        />
        <input
          id="reliefSizeNumber"
          type="number"
          min="2"
          defaultValue="5"
          onInput={e => {
            const r = document.getElementById("reliefSize") as HTMLInputElement;
            if (r) r.value = e.currentTarget.value;
          }}
        />
      </div>

      <div id="reliefRadiusDiv" data-tip="Set brush radius for icons placement on deletion" style={{ display: "none" }}>
        <div className="reliefEditorLabel">Radius:</div>
        <input
          id="reliefRadius"
          type="range"
          min="1"
          max="100"
          defaultValue="15"
          onInput={e => {
            const num = document.getElementById("reliefRadiusNumber") as HTMLInputElement;
            if (num) num.value = e.currentTarget.value;
          }}
        />
        <input
          id="reliefRadiusNumber"
          type="number"
          min="1"
          defaultValue="15"
          onInput={e => {
            const r = document.getElementById("reliefRadius") as HTMLInputElement;
            if (r) r.value = e.currentTarget.value;
          }}
        />
      </div>

      <div id="reliefSpacingDiv" data-tip="Set spacing between relief icons" style={{ display: "none" }}>
        <div className="reliefEditorLabel">Spacing:</div>
        <input
          id="reliefSpacing"
          type="range"
          min="2"
          max="20"
          defaultValue="5"
          onInput={e => {
            const num = document.getElementById("reliefSpacingNumber") as HTMLInputElement;
            if (num) num.value = e.currentTarget.value;
          }}
        />
        <input
          id="reliefSpacingNumber"
          type="number"
          min="2"
          defaultValue="5"
          onInput={e => {
            const r = document.getElementById("reliefSpacing") as HTMLInputElement;
            if (r) r.value = e.currentTarget.value;
          }}
        />
      </div>

      <div id="reliefIconsDiv" data-tip="Select icon">
        <div data-type="simple" style={{ display: "none" }}>
          <svg data-type="#relief-mount-1" data-tip="Select Mountain icon" aria-hidden="true">
            <use href="#relief-mount-1" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-hill-1" data-tip="Select Hill icon" aria-hidden="true">
            <use href="#relief-hill-1" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-deciduous-1" data-tip="Select Deciduous Tree icon" aria-hidden="true">
            <use href="#relief-deciduous-1" x="-25%" y="-25%" width="60" height="60"></use>
          </svg>
          <svg data-type="#relief-conifer-1" data-tip="Select Conifer Tree icon" aria-hidden="true">
            <use href="#relief-conifer-1" x="-25%" y="-25%" width="60" height="60"></use>
          </svg>
          <svg data-type="#relief-palm-1" data-tip="Select Palm icon" aria-hidden="true">
            <use href="#relief-palm-1" x="-25%" y="-25%" width="60" height="60"></use>
          </svg>
          <svg data-type="#relief-acacia-1" data-tip="Select Acacia icon" aria-hidden="true">
            <use href="#relief-acacia-1" x="-25%" y="-25%" width="60" height="60"></use>
          </svg>
          <svg data-type="#relief-swamp-1" data-tip="Select Swamp icon" aria-hidden="true">
            <use href="#relief-swamp-1" x="-50%" y="-50%" width="80" height="80"></use>
          </svg>
          <svg data-type="#relief-grass-1" data-tip="Select Grass icon" aria-hidden="true">
            <use href="#relief-grass-1" x="-100%" y="-100%" width="120" height="120"></use>
          </svg>
          <svg data-type="#relief-dune-1" data-tip="Select Dune icon" aria-hidden="true">
            <use href="#relief-dune-1" x="-25%" y="-25%" width="60" height="60"></use>
          </svg>
        </div>

        <div data-type="colored" style={{ display: "none" }}>
          <svg data-type="#relief-mount-2" data-tip="Select Mountain icon" aria-hidden="true">
            <use href="#relief-mount-2" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-mount-3" data-tip="Select Mountain icon" aria-hidden="true">
            <use href="#relief-mount-3" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-mount-4" data-tip="Select Mountain icon" aria-hidden="true">
            <use href="#relief-mount-4" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-mount-5" data-tip="Select Mountain icon" aria-hidden="true">
            <use href="#relief-mount-5" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-mount-6" data-tip="Select Mountain icon" aria-hidden="true">
            <use href="#relief-mount-6" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-mount-7" data-tip="Select Mountain icon" aria-hidden="true">
            <use href="#relief-mount-7" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-mountSnow-1" data-tip="Select Snow Mountain icon" aria-hidden="true">
            <use href="#relief-mountSnow-1" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-mountSnow-2" data-tip="Select Snow Mountain icon" aria-hidden="true">
            <use href="#relief-mountSnow-2" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-mountSnow-3" data-tip="Select Snow Mountain icon" aria-hidden="true">
            <use href="#relief-mountSnow-3" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-mountSnow-4" data-tip="Select Snow Mountain icon" aria-hidden="true">
            <use href="#relief-mountSnow-4" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-mountSnow-5" data-tip="Select Snow Mountain icon" aria-hidden="true">
            <use href="#relief-mountSnow-5" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-mountSnow-6" data-tip="Select Snow Mountain icon" aria-hidden="true">
            <use href="#relief-mountSnow-6" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-vulcan-1" data-tip="Select Volcano icon" aria-hidden="true">
            <use href="#relief-vulcan-1" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-vulcan-2" data-tip="Select Volcano icon" aria-hidden="true">
            <use href="#relief-vulcan-2" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-vulcan-3" data-tip="Select Volcano icon" aria-hidden="true">
            <use href="#relief-vulcan-3" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-hill-2" data-tip="Select Hill icon" aria-hidden="true">
            <use href="#relief-hill-2" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-hill-3" data-tip="Select Hill icon" aria-hidden="true">
            <use href="#relief-hill-3" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-hill-4" data-tip="Select Hill icon" aria-hidden="true">
            <use href="#relief-hill-4" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-hill-5" data-tip="Select Hill icon" aria-hidden="true">
            <use href="#relief-hill-5" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-dune-2" data-tip="Select Dune icon" aria-hidden="true">
            <use href="#relief-dune-2" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-deciduous-2" data-tip="Select Deciduous Tree icon" aria-hidden="true">
            <use href="#relief-deciduous-2" x="-25%" y="-25%" width="60" height="60"></use>
          </svg>
          <svg data-type="#relief-deciduous-3" data-tip="Select Deciduous Tree icon" aria-hidden="true">
            <use href="#relief-deciduous-3" x="-25%" y="-25%" width="60" height="60"></use>
          </svg>
          <svg data-type="#relief-conifer-2" data-tip="Select Conifer Tree icon" aria-hidden="true">
            <use href="#relief-conifer-2" x="-25%" y="-25%" width="60" height="60"></use>
          </svg>
          <svg data-type="#relief-coniferSnow-1" data-tip="Select Snow Conifer Tree icon" aria-hidden="true">
            <use href="#relief-coniferSnow-1" x="-25%" y="-25%" width="60" height="60"></use>
          </svg>
          <svg data-type="#relief-acacia-2" data-tip="Select Acacia icon" aria-hidden="true">
            <use href="#relief-acacia-2" x="-25%" y="-25%" width="60" height="60"></use>
          </svg>
          <svg data-type="#relief-palm-2" data-tip="Select Palm icon" aria-hidden="true">
            <use href="#relief-palm-2" x="-25%" y="-25%" width="60" height="60"></use>
          </svg>
          <svg data-type="#relief-grass-2" data-tip="Select Grass icon" aria-hidden="true">
            <use href="#relief-grass-2" x="-25%" y="-25%" width="60" height="60"></use>
          </svg>
          <svg data-type="#relief-swamp-2" data-tip="Select Swamp icon" aria-hidden="true">
            <use href="#relief-swamp-2" x="-25%" y="-25%" width="60" height="60"></use>
          </svg>
          <svg data-type="#relief-swamp-3" data-tip="Select Swamp icon" aria-hidden="true">
            <use href="#relief-swamp-3" x="-25%" y="-25%" width="60" height="60"></use>
          </svg>
          <svg data-type="#relief-cactus-1" data-tip="Select Cactus icon" aria-hidden="true">
            <use href="#relief-cactus-1" x="-25%" y="-25%" width="60" height="60"></use>
          </svg>
          <svg data-type="#relief-cactus-2" data-tip="Select Cactus icon" aria-hidden="true">
            <use href="#relief-cactus-2" x="-25%" y="-25%" width="60" height="60"></use>
          </svg>
          <svg data-type="#relief-cactus-3" data-tip="Select Cactus icon" aria-hidden="true">
            <use href="#relief-cactus-3" x="-25%" y="-25%" width="60" height="60"></use>
          </svg>
          <svg data-type="#relief-deadTree-1" data-tip="Select Dead Tree icon" aria-hidden="true">
            <use href="#relief-deadTree-1" x="-25%" y="-25%" width="60" height="60"></use>
          </svg>
          <svg data-type="#relief-deadTree-2" data-tip="Select Dead Tree icon" aria-hidden="true">
            <use href="#relief-deadTree-2" x="-25%" y="-25%" width="60" height="60"></use>
          </svg>
        </div>

        <div data-type="gray" style={{ display: "none" }}>
          <svg data-type="#relief-mount-2-bw" data-tip="Select Mountain icon" aria-hidden="true">
            <use href="#relief-mount-2-bw" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-mount-3-bw" data-tip="Select Mountain icon" aria-hidden="true">
            <use href="#relief-mount-3-bw" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-mount-4-bw" data-tip="Select Mountain icon" aria-hidden="true">
            <use href="#relief-mount-4-bw" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-mount-5-bw" data-tip="Select Mountain icon" aria-hidden="true">
            <use href="#relief-mount-5-bw" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-mount-6-bw" data-tip="Select Mountain icon" aria-hidden="true">
            <use href="#relief-mount-6-bw" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-mount-7-bw" data-tip="Select Mountain icon" aria-hidden="true">
            <use href="#relief-mount-7-bw" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-mountSnow-1-bw" data-tip="Select Snow Mountain icon" aria-hidden="true">
            <use href="#relief-mountSnow-1-bw" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-mountSnow-2-bw" data-tip="Select Snow Mountain icon" aria-hidden="true">
            <use href="#relief-mountSnow-2-bw" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-mountSnow-3-bw" data-tip="Select Snow Mountain icon" aria-hidden="true">
            <use href="#relief-mountSnow-3-bw" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-mountSnow-4-bw" data-tip="Select Snow Mountain icon" aria-hidden="true">
            <use href="#relief-mountSnow-4-bw" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-mountSnow-5-bw" data-tip="Select Snow Mountain icon" aria-hidden="true">
            <use href="#relief-mountSnow-5-bw" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-mountSnow-6-bw" data-tip="Select Snow Mountain icon" aria-hidden="true">
            <use href="#relief-mountSnow-6-bw" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-vulcan-1-bw" data-tip="Select Volcano icon" aria-hidden="true">
            <use href="#relief-vulcan-1-bw" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-vulcan-2-bw" data-tip="Select Volcano icon" aria-hidden="true">
            <use href="#relief-vulcan-2-bw" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-vulcan-3-bw" data-tip="Select Volcano icon" aria-hidden="true">
            <use href="#relief-vulcan-3-bw" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-hill-2-bw" data-tip="Select Hill icon" aria-hidden="true">
            <use href="#relief-hill-2-bw" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-hill-3-bw" data-tip="Select Hill icon" aria-hidden="true">
            <use href="#relief-hill-3-bw" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-hill-4-bw" data-tip="Select Hill icon" aria-hidden="true">
            <use href="#relief-hill-4-bw" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-hill-5-bw" data-tip="Select Hill icon" aria-hidden="true">
            <use href="#relief-hill-5-bw" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-dune-2-bw" data-tip="Select Dune icon" aria-hidden="true">
            <use href="#relief-dune-2-bw" width="40" height="40"></use>
          </svg>
          <svg data-type="#relief-deciduous-2-bw" data-tip="Select Deciduous Tree icon" aria-hidden="true">
            <use href="#relief-deciduous-2-bw" x="-25%" y="-25%" width="60" height="60"></use>
          </svg>
          <svg data-type="#relief-deciduous-3-bw" data-tip="Select Deciduous Tree icon" aria-hidden="true">
            <use href="#relief-deciduous-3-bw" x="-25%" y="-25%" width="60" height="60"></use>
          </svg>
          <svg data-type="#relief-conifer-2-bw" data-tip="Select Conifer Tree icon" aria-hidden="true">
            <use href="#relief-conifer-2-bw" x="-25%" y="-25%" width="60" height="60"></use>
          </svg>
          <svg data-type="#relief-coniferSnow-1-bw" data-tip="Select Snow Conifer Tree icon" aria-hidden="true">
            <use href="#relief-coniferSnow-1-bw" x="-25%" y="-25%" width="60" height="60"></use>
          </svg>
          <svg data-type="#relief-acacia-2-bw" data-tip="Select Acacia icon" aria-hidden="true">
            <use href="#relief-acacia-2-bw" x="-25%" y="-25%" width="60" height="60"></use>
          </svg>
          <svg data-type="#relief-palm-2-bw" data-tip="Select Palm icon" aria-hidden="true">
            <use href="#relief-palm-2-bw" x="-25%" y="-25%" width="60" height="60"></use>
          </svg>
          <svg data-type="#relief-grass-2-bw" data-tip="Select Grass icon" aria-hidden="true">
            <use href="#relief-grass-2-bw" x="-25%" y="-25%" width="60" height="60"></use>
          </svg>
          <svg data-type="#relief-swamp-2-bw" data-tip="Select Swamp icon" aria-hidden="true">
            <use href="#relief-swamp-2-bw" x="-25%" y="-25%" width="60" height="60"></use>
          </svg>
          <svg data-type="#relief-swamp-3-bw" data-tip="Select Swamp icon" aria-hidden="true">
            <use href="#relief-swamp-3-bw" x="-25%" y="-25%" width="60" height="60"></use>
          </svg>
          <svg data-type="#relief-cactus-1-bw" data-tip="Select Cactus icon" aria-hidden="true">
            <use href="#relief-cactus-1-bw" x="-25%" y="-25%" width="60" height="60"></use>
          </svg>
          <svg data-type="#relief-cactus-2-bw" data-tip="Select Cactus icon" aria-hidden="true">
            <use href="#relief-cactus-2-bw" x="-25%" y="-25%" width="60" height="60"></use>
          </svg>
          <svg data-type="#relief-cactus-3-bw" data-tip="Select Cactus icon" aria-hidden="true">
            <use href="#relief-cactus-3-bw" x="-25%" y="-25%" width="60" height="60"></use>
          </svg>
          <svg data-type="#relief-deadTree-1-bw" data-tip="Select Dead Tree icon" aria-hidden="true">
            <use href="#relief-deadTree-1-bw" x="-25%" y="-25%" width="60" height="60"></use>
          </svg>
          <svg data-type="#relief-deadTree-2-bw" data-tip="Select Dead Tree icon" aria-hidden="true">
            <use href="#relief-deadTree-2-bw" x="-25%" y="-25%" width="60" height="60"></use>
          </svg>
        </div>

        <svg id="reliefIconsSeletionAny" data-tip="Select any type of icons" aria-hidden="true">
          <text x="50%" y="50%">
            Any
          </text>
        </svg>
      </div>

      <div id="reliefFooter">
        <button
          type="button"
          id="reliefEditStyle"
          data-tip="Edit Relief Icons style in Style Editor"
          className="icon-adjust"
        ></button>
        <button type="button" id="reliefCopy" data-tip="Copy selected relief icon" className="icon-clone"></button>
        <button
          type="button"
          id="reliefMoveFront"
          data-tip="Move selected relief icon to front"
          className="icon-level-up"
        ></button>
        <button
          type="button"
          id="reliefMoveBack"
          data-tip="Move selected relief icon back"
          className="icon-level-down"
        ></button>
        <button
          id="reliefRemove"
          data-tip="Remove selected relief icon or icon type"
          data-shortcut="Delete"
          className="icon-trash fastDelete"
          type="button"
        ></button>
      </div>
    </Dialog>
  );
};
