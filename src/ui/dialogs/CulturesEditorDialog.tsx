import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { SliderInput } from "../components/SliderInput";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const CulturesEditorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("culturesEditor"));

  return (
    <Dialog isOpen={isOpen} title="Cultures Editor" onClose={() => closeDialog("culturesEditor")}>
      <div id="culturesEditor">
        <div id="culturesHeader" className="header" style={{ gridTemplateColumns: "10em 7em 9em 4em 8em 5em 7em 8em" }}>
          <div data-tip="Click to sort by culture name" className="sortable alphabetically" data-sortby="name">
            Culture&nbsp;
          </div>
          <div data-tip="Click to sort by type" className="sortable alphabetically" data-sortby="type">
            Type&nbsp;
          </div>
          <div data-tip="Click to sort by culture namesbase" className="sortable" data-sortby="base">
            Namesbase&nbsp;
          </div>
          <div data-tip="Click to sort by culture cells count" className="sortable hide" data-sortby="cells">
            Cells&nbsp;
          </div>
          <div data-tip="Click to sort by expansionism" className="sortable hide" data-sortby="expansionism">
            Expansion&nbsp;
          </div>
          <div data-tip="Click to sort by culture area" className="sortable hide" data-sortby="area">
            Area&nbsp;
          </div>
          <div
            data-tip="Click to sort by culture population"
            className="sortable hide icon-sort-number-down"
            data-sortby="population"
          >
            Population&nbsp;
          </div>
          <div
            data-tip="Click to sort by culture emblems shape"
            className="sortable alphabetically hide"
            data-sortby="emblems"
          >
            Emblems&nbsp;
          </div>
        </div>

        <div id="culturesBody" className="table" data-type="absolute" />

        <div id="culturesTotal" className="totalLine">
          <div data-tip="Cultures number" style={{ marginLeft: 12 }}>
            Cultures:&nbsp;<span id="culturesFooterCultures">0</span>
          </div>
          <div data-tip="Total land cells number" style={{ marginLeft: 12 }}>
            Cells:&nbsp;<span id="culturesFooterCells">0</span>
          </div>
          <div data-tip="Total land area" style={{ marginLeft: 12 }}>
            Land Area:&nbsp;<span id="culturesFooterArea">0</span>
          </div>
          <div data-tip="Total population" style={{ marginLeft: 12 }}>
            Population:&nbsp;<span id="culturesFooterPopulation">0</span>
          </div>
        </div>

        <div id="culturesFooter">
          <button type="button" id="culturesEditorRefresh" data-tip="Refresh the Editor" className="icon-cw" />
          <button
            type="button"
            id="culturesEditStyle"
            data-tip="Edit cultures style in Style Editor"
            className="icon-adjust"
          />
          <button type="button" id="culturesLegend" data-tip="Toggle Legend box" className="icon-list-bullet" />
          <button
            type="button"
            id="culturesPercentage"
            data-tip="Toggle percentage / absolute values display mode"
            className="icon-percent"
          />
          <button
            type="button"
            id="culturesHeirarchy"
            data-tip="Show cultures hierarchy tree"
            className="icon-sitemap"
          />
          <button type="button" id="culturesManually" data-tip="Manually re-assign cultures" className="icon-brush" />
          <div id="culturesManuallyButtons" style={{ display: "none" }}>
            <div
              data-tip="Change brush size. Shortcuts: + / ] to increase; - / [ to decrease"
              style={{ marginBlock: "0.3em" }}
            >
              <SliderInput id="culturesBrush" min="1" max="100" value="15">
                Brush size:
              </SliderInput>
            </div>
            <button type="button" id="culturesManuallyUndo" data-tip="Undo last brush stroke" className="icon-ccw" />
            <button type="button" id="culturesManuallyApply" data-tip="Apply assignment" className="icon-check" />
            <button type="button" id="culturesManuallyCancel" data-tip="Cancel assignment" className="icon-cancel" />
          </div>
          <button
            type="button"
            id="culturesEditNamesBase"
            data-tip="Edit a database used for names generation"
            className="icon-font"
          />
          <button
            type="button"
            id="culturesAdd"
            data-tip="Add a new culture. Hold Shift to add multiple"
            className="icon-plus"
          />
          <button
            type="button"
            id="culturesExport"
            data-tip="Download cultures-related data"
            className="icon-download"
          />
          <button type="button" id="culturesImport" data-tip="Upload cultures-related data" className="icon-upload" />
          <input id="culturesCSVToLoad" type="file" style={{ display: "none" }} accept=".csv" />
          <button
            type="button"
            id="culturesRecalculate"
            data-tip="Recalculate cultures based on current values of growth-related attributes"
            className="icon-retweet"
          />
          <span
            data-tip="Allow culture centers, expansion and type changes to take an immediate effect"
            style={{ display: "inline-flex" }}
          >
            <input id="culturesAutoChange" className="checkbox" type="checkbox" />
            <label htmlFor="culturesAutoChange" className="checkbox-label">
              <i>auto-apply changes</i>
            </label>
          </span>
        </div>
      </div>
    </Dialog>
  );
};
