import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const ReligionsEditorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("religionsEditor"));

  return (
    <Dialog isOpen={isOpen} title="Religions Editor" onClose={() => closeDialog("religionsEditor")}>
      <div id="religionsEditor">
        <div
          id="religionsHeader"
          className="header"
          style={{ gridTemplateColumns: "13em 6em 7em 18em 6em 7em 6em 7em" }}
        >
          <div data-tip="Click to sort by religion name" className="sortable alphabetically" data-sortby="name">
            Religion&nbsp;
          </div>
          <div
            data-tip="Click to sort by religion type"
            className="sortable alphabetically icon-sort-name-down"
            data-sortby="type"
          >
            Type&nbsp;
          </div>
          <div data-tip="Click to sort by religion form" className="sortable alphabetically" data-sortby="form">
            Form&nbsp;
          </div>
          <div data-tip="Click to sort by supreme deity" className="sortable alphabetically hide" data-sortby="deity">
            Supreme Deity&nbsp;
          </div>
          <div data-tip="Click to sort by religion area" className="sortable hide" data-sortby="area">
            Area&nbsp;
          </div>
          <div
            data-tip="Click to sort by number of believers (religion area population)"
            className="sortable hide"
            data-sortby="population"
          >
            Believers&nbsp;
          </div>
          <div
            data-tip="Click to sort by potential extent type"
            className="sortable alphabetically hide"
            data-sortby="expansion"
          >
            Potential&nbsp;
          </div>
          <div data-tip="Click to sort by expansionism" className="sortable hide" data-sortby="expansionism">
            Expansion&nbsp;
          </div>
        </div>

        <div id="religionsBody" className="table" data-type="absolute" />

        <div id="religionsTotal" className="totalLine">
          <div data-tip="Total number of organized religions" style={{ marginLeft: 12 }}>
            Organized:&nbsp;<span id="religionsOrganized">0</span>
          </div>
          <div data-tip="Total number of heresies" style={{ marginLeft: 12 }}>
            Heresies:&nbsp;<span id="religionsHeresies">0</span>
          </div>
          <div data-tip="Total number of cults" style={{ marginLeft: 12 }}>
            Cults:&nbsp;<span id="religionsCults">0</span>
          </div>
          <div data-tip="Total number of folk religions" style={{ marginLeft: 12 }}>
            Folk:&nbsp;<span id="religionsFolk">0</span>
          </div>
          <div data-tip="Total land area" style={{ marginLeft: 12 }}>
            Land Area:&nbsp;<span id="religionsFooterArea">0</span>
          </div>
          <div data-tip="Total number of believers (population)" style={{ marginLeft: 12 }}>
            Believers:&nbsp;<span id="religionsFooterPopulation">0</span>
          </div>
        </div>

        <div id="religionsFooter">
          <button type="button" id="religionsEditorRefresh" data-tip="Refresh the Editor" className="icon-cw" />
          <button
            type="button"
            id="religionsEditStyle"
            data-tip="Edit religions style in Style Editor"
            className="icon-adjust"
          />
          <button type="button" id="religionsLegend" data-tip="Toggle Legend box" className="icon-list-bullet" />
          <button
            type="button"
            id="religionsPercentage"
            data-tip="Toggle percentage / absolute values display mode"
            className="icon-percent"
          />
          <button
            type="button"
            id="religionsHeirarchy"
            data-tip="Show religions hierarchy tree"
            className="icon-sitemap"
          />
          <button
            type="button"
            id="religionsExtinct"
            data-tip="Show/hide extinct religions (religions without cells)"
            className="icon-eye-off"
          />
          <button type="button" id="religionsManually" data-tip="Manually re-assign religions" className="icon-brush" />
          <div id="religionsManuallyButtons" style={{ display: "none" }}>
            <div
              data-tip="Change brush size. Shortcuts: + or ] to increase; - or [ to decrease"
              style={{ marginBlock: "0.3em" }}
            >
              <slider-input id="religionsBrush" min="1" max="100" value="15">
                Brush size:
              </slider-input>
            </div>
            <button type="button" id="religionsManuallyApply" data-tip="Apply assignment" className="icon-check" />
            <button type="button" id="religionsManuallyCancel" data-tip="Cancel assignment" className="icon-cancel" />
            <div
              data-tip="When enabled, only cells without religion can be painted"
              style={{ display: "inline-block" }}
            >
              <input id="religionsManuallyProtect" className="checkbox" type="checkbox" />
              <label htmlFor="religionsManuallyProtect" className="checkbox-label">
                <i>do not overwrite existing</i>
              </label>
            </div>
          </div>
          <button
            type="button"
            id="religionsAdd"
            data-tip="Add a new religion. Hold Shift to add multiple"
            className="icon-plus"
          />
          <button
            type="button"
            id="religionsExport"
            data-tip="Download religions-related data"
            className="icon-download"
          />
          <button
            type="button"
            id="religionsRecalculate"
            data-tip="Recalculate religions based on current values of growth-related attributes"
            className="icon-retweet"
          />
          <span data-tip="Allow religion center, extent, and expansionism changes to take an immediate effect">
            <input id="religionsAutoChange" className="checkbox" type="checkbox" />
            <label htmlFor="religionsAutoChange" className="checkbox-label">
              <i>auto-apply changes</i>
            </label>
          </span>
        </div>
      </div>
    </Dialog>
  );
};
