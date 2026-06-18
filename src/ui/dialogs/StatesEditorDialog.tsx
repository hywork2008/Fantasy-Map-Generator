import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const StatesEditorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("statesEditor"));

  return (
    <Dialog isOpen={isOpen} title="States Editor" onClose={() => closeDialog("statesEditor")}>
      <div id="statesEditor">
        <div
          id="statesHeader"
          className="header"
          style={{ gridTemplateColumns: "11em 8em 7em 7em 6em 6em 8em 6em 7em 6em" }}
        >
          <div data-tip="Click to sort by state name" className="sortable alphabetically" data-sortby="name">
            State&nbsp;
          </div>
          <div data-tip="Click to sort by state form name" className="sortable alphabetically" data-sortby="form">
            Form&nbsp;
          </div>
          <div data-tip="Click to sort by capital name" className="sortable alphabetically" data-sortby="capital">
            Capital&nbsp;
          </div>
          <div
            data-tip="Click to sort by state dominant culture"
            className="sortable alphabetically hide"
            data-sortby="culture"
          >
            Culture&nbsp;
          </div>
          <div data-tip="Click to sort by state burgs count" className="sortable hide" data-sortby="burgs">
            Burgs&nbsp;
          </div>
          <div
            data-tip="Click to sort by state area"
            className="sortable hide icon-sort-number-down"
            data-sortby="area"
          >
            Area&nbsp;
          </div>
          <div data-tip="Click to sort by state population" className="sortable hide" data-sortby="population">
            Population&nbsp;
          </div>
          <div
            data-tip="Click to sort by state type"
            className="sortable alphabetically hidden show hide"
            data-sortby="type"
          >
            Type&nbsp;
          </div>
          <div
            data-tip="Click to sort by state expansion value"
            className="sortable hidden show hide"
            data-sortby="expansionism"
          >
            Expansion&nbsp;
          </div>
          <div data-tip="Click to sort by state cells count" className="sortable hidden show hide" data-sortby="cells">
            Cells&nbsp;
          </div>
        </div>

        <div id="statesBodySection" className="table" data-type="absolute" />

        <div id="statesTotal" className="totalLine">
          <div data-tip="States number" style={{ marginLeft: 5 }}>
            States:&nbsp;<span id="statesFooterStates">0</span>
          </div>
          <div data-tip="Total land cells number" style={{ marginLeft: 12 }}>
            Cells:&nbsp;<span id="statesFooterCells">0</span>
          </div>
          <div data-tip="Total burgs number" style={{ marginLeft: 12 }}>
            Burgs:&nbsp;<span id="statesFooterBurgs">0</span>
          </div>
          <div data-tip="Total land area" style={{ marginLeft: 12 }}>
            Land Area:&nbsp;<span id="statesFooterArea">0</span>
          </div>
          <div data-tip="Total population" style={{ marginLeft: 12 }}>
            Population:&nbsp;<span id="statesFooterPopulation">0</span>
          </div>
        </div>

        <div id="statesFooter">
          <button type="button" id="statesEditorRefresh" data-tip="Refresh the Editor" className="icon-cw" />
          <button
            type="button"
            id="statesEditStyle"
            data-tip="Edit states style in Style Editor"
            className="icon-adjust"
          />
          <button type="button" id="statesLegend" data-tip="Toggle Legend box" className="icon-list-bullet" />
          <button
            type="button"
            id="statesPercentage"
            data-tip="Toggle percentage / absolute values views"
            className="icon-percent"
          />
          <button type="button" id="statesChart" data-tip="Show states bubble chart" className="icon-chart-area" />
          <button
            type="button"
            id="statesRegenerate"
            data-tip="Show the regeneration menu and more data"
            className="icon-cog-alt"
          />
          <div id="statesRegenerateButtons" style={{ display: "none" }}>
            <button
              type="button"
              id="statesRegenerateBack"
              data-tip="Hide the regeneration menu"
              className="icon-cog-alt"
            />
            <button
              type="button"
              id="statesRandomize"
              data-tip="Randomize states Expansion value and re-calculate states and provinces"
              className="icon-shuffle"
            />
            <div
              data-tip="Additional growth rate. Defines how many land cells remain neutral"
              style={{ display: "inline-block" }}
            >
              <slider-input id="statesGrowthRate" min=".1" max="3" step=".05" value="1">
                Growth rate:
              </slider-input>
            </div>
            <button
              type="button"
              id="statesRecalculate"
              data-tip="Recalculate states based on current values of growth-related attributes"
              className="icon-retweet"
            />
            <div
              data-tip="Allow states neutral distance, expansion and type changes to take an immediate effect"
              style={{ display: "inline-block" }}
            >
              <input id="statesAutoChange" className="checkbox" type="checkbox" />
              <label htmlFor="statesAutoChange" className="checkbox-label">
                <i>auto-apply changes</i>
              </label>
            </div>
            <div
              data-tip="Allow system to change state labels when states data is changed"
              style={{ display: "inline-block" }}
            >
              <input id="adjustLabels" className="checkbox" type="checkbox" />
              <label htmlFor="adjustLabels" className="checkbox-label">
                <i>auto-change labels</i>
              </label>
            </div>
          </div>
          <button type="button" id="statesManually" data-tip="Manually re-assign states" className="icon-brush" />
          <div id="statesManuallyButtons" style={{ display: "none" }}>
            <div
              data-tip="Change brush size. Shortcuts: + / ] to increase; - / [ to decrease"
              style={{ marginBlock: "0.3em" }}
            >
              <slider-input id="statesBrush" min="1" max="100" value="15">
                Brush size:
              </slider-input>
            </div>
            <button type="button" id="statesManuallyUndo" data-tip="Undo last brush stroke" className="icon-ccw" />
            <button type="button" id="statesManuallyApply" data-tip="Apply assignment" className="icon-check" />
            <button type="button" id="statesManuallyCancel" data-tip="Cancel assignment" className="icon-cancel" />
            <div data-tip="When enabled, only neutral cells can be painted" style={{ display: "inline-block" }}>
              <input id="statesManuallyProtect" className="checkbox" type="checkbox" />
              <label htmlFor="statesManuallyProtect" className="checkbox-label">
                <i>do not overwrite existing</i>
              </label>
            </div>
          </div>
          <button
            type="button"
            id="statesAdd"
            data-tip="Add a new state. Hold Shift to add multiple"
            className="icon-plus"
          />
          <button
            type="button"
            id="statesMerge"
            data-tip="Merge several states into one"
            className="icon-layer-group"
          />
          <button
            type="button"
            id="statesExport"
            data-tip="Save state-related data as a text file (.csv)"
            className="icon-download"
          />
        </div>
      </div>
    </Dialog>
  );
};
