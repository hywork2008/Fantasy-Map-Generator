import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const BiomesEditorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("biomesEditor"));

  return (
    <Dialog isOpen={isOpen} title="Biomes Editor" onClose={() => closeDialog("biomesEditor")}>
      <div id="biomesEditor">
        <div>
          <div id="biomesHeader" className="header" style={{ gridTemplateColumns: "13em 7em 5em 5em 7em" }}>
            <div data-tip="Click to sort by biome name" className="sortable alphabetically" data-sortby="name">
              Biome&nbsp;
            </div>
            <div data-tip="Click to sort by biome habitability" className="sortable hide" data-sortby="habitability">
              Habitability&nbsp;
            </div>
            <div
              data-tip="Click to sort by biome cells number"
              className="sortable hide icon-sort-number-down"
              data-sortby="cells"
            >
              Cells&nbsp;
            </div>
            <div data-tip="Click to sort by biome area" className="sortable hide" data-sortby="area">
              Area&nbsp;
            </div>
            <div data-tip="Click to sort by biome population" className="sortable hide" data-sortby="population">
              Population&nbsp;
            </div>
          </div>
          <div id="biomesBody" className="table" data-type="absolute" />
          <div id="biomesTotal" className="totalLine">
            <div data-tip="Number of land biomes" style={{ marginLeft: 12 }}>
              Biomes:&nbsp;<span id="biomesFooterBiomes">0</span>
            </div>
            <div data-tip="Total land cells number" style={{ marginLeft: 12 }}>
              Cells:&nbsp;<span id="biomesFooterCells">0</span>
            </div>
            <div data-tip="Total land area" style={{ marginLeft: 12 }}>
              Land Area:&nbsp;<span id="biomesFooterArea">0</span>
            </div>
            <div data-tip="Total population" style={{ marginLeft: 12 }}>
              Population:&nbsp;<span id="biomesFooterPopulation">0</span>
            </div>
          </div>
          <div id="biomesFooter">
            <button type="button" id="biomesEditorRefresh" data-tip="Refresh the Editor" className="icon-cw" />
            <button
              type="button"
              id="biomesEditStyle"
              data-tip="Edit biomes style in Style Editor"
              className="icon-adjust"
            />
            <button type="button" id="biomesLegend" data-tip="Toggle Legend box" className="icon-list-bullet" />
            <button
              type="button"
              id="biomesPercentage"
              data-tip="Toggle percentage / absolute values views"
              className="icon-percent"
            />
            <button
              type="button"
              id="biomesManually"
              data-tip="Manually re-assign biomes to not follow the default moisture/temperature pattern"
              className="icon-brush"
            />
            <div id="biomesManuallyButtons" style={{ display: "none" }}>
              <div
                data-tip="Change brush size. Shortcut: + to increase; – to decrease"
                style={{ marginBlock: "0.3em" }}
              >
                Brush size:
                <slider-input id="biomesBrush" min={1} max={100} value={15} />
              </div>
              <button
                type="button"
                id="biomesManuallyApply"
                data-tip="Apply current assignment"
                className="icon-check"
              />
              <button type="button" id="biomesManuallyCancel" data-tip="Cancel assignment" className="icon-cancel" />
            </div>
            <button type="button" id="biomesAdd" data-tip="Add a custom biome" className="icon-plus" />
            <button
              type="button"
              id="biomesRestore"
              data-tip="Restore the defaults and re-define biomes based on current moisture and temperature"
              className="icon-history"
            />
            <button
              type="button"
              id="biomesRegenerateReliefIcons"
              data-tip="Regenerate relief icons based on current biomes and elevation"
              className="icon-tree"
            />
            <button
              type="button"
              id="biomesExport"
              data-tip="Save biomes-related data as a text file (.csv)"
              className="icon-download"
            />
          </div>
        </div>
      </div>
    </Dialog>
  );
};
