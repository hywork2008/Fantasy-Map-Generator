import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const MilitaryOptionsDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("militaryOptions"));

  return (
    <Dialog isOpen={isOpen} title="Military Options" onClose={() => closeDialog("militaryOptions")}>
      <div id="militaryOptionsContainer">
        <div>
          <div className="table">
            <table id="militaryOptionsTable">
              <thead>
                <tr>
                  <th data-tip="Unit icon">Icon</th>
                  <th data-tip="Unit name. If name is changed for existing unit, old unit will be replaced">
                    Unit name
                  </th>
                  <th style={{ width: "5em" }} data-tip="Select allowed biomes">
                    Biomes
                  </th>
                  <th style={{ width: "5em" }} data-tip="Select allowed states">
                    States
                  </th>
                  <th style={{ width: "5em" }} data-tip="Select allowed cultures">
                    Cultures
                  </th>
                  <th style={{ width: "5em" }} data-tip="Select allowed religions">
                    Religions
                  </th>
                  <th data-tip="Conscription percentage for rural population">Rural</th>
                  <th data-tip="Conscription percentage for urban population">Urban</th>
                  <th data-tip="Average number of people in crew (used for total personnel calculation)">Crew</th>
                  <th data-tip="Unit military power (used for battle simulation)">Power</th>
                  <th data-tip="Unit type to apply special rules on forces recalculation">Type</th>
                  <th data-tip="Check if unit is separate and can be stacked only with units of the same type">
                    Separate
                  </th>
                </tr>
              </thead>
              <tbody />
            </table>
          </div>
        </div>
      </div>
    </Dialog>
  );
};
