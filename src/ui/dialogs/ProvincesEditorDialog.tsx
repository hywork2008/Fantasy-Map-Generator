import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const ProvincesEditorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("provincesEditor"));

  return (
    <Dialog isOpen={isOpen} title="Provinces Editor" onClose={() => closeDialog("provincesEditor")}>
      <div id="provincesEditorContainer">
        <div>
          <div id="provincesHeader" className="header" style={{ gridTemplateColumns: "11em 8em 8em 6em 6em 6em 8em" }}>
            <div data-tip="Click to sort by province name" className="sortable alphabetically" data-sortby="name">
              Province&nbsp;
            </div>
            <div
              data-tip="Click to sort by province form name"
              className="sortable alphabetically hide"
              data-sortby="form"
            >
              Form&nbsp;
            </div>
            <div
              data-tip="Click to sort by province capital"
              className="sortable alphabetically hide"
              data-sortby="capital"
            >
              Capital&nbsp;
            </div>
            <div data-tip="Click to sort by province owner" className="sortable alphabetically" data-sortby="state">
              State&nbsp;
            </div>
            <div data-tip="Click to sort by province burgs count" className="sortable hide" data-sortby="burgs">
              Burgs&nbsp;
            </div>
            <div data-tip="Click to sort by province area" className="sortable hide" data-sortby="area">
              Area&nbsp;
            </div>
            <div data-tip="Click to sort by province population" className="sortable hide" data-sortby="population">
              Population&nbsp;
            </div>
          </div>
          <div id="provincesBodySection" className="table" data-type="absolute" />
          <div id="provincesTotal" className="totalLine">
            <div data-tip="Provinces displayed" style={{ marginLeft: 4 }}>
              Provinces:&nbsp;<span id="provincesFooterNumber">0</span>
            </div>
            <div data-tip="Total burgs number" style={{ marginLeft: 12 }}>
              Burgs:&nbsp;<span id="provincesFooterBurgs">0</span>
            </div>
            <div data-tip="Average area" style={{ marginLeft: 14 }}>
              Mean area:&nbsp;<span id="provincesFooterArea">0</span>
            </div>
            <div data-tip="Average population" style={{ marginLeft: 14 }}>
              Mean population:&nbsp;<span id="provincesFooterPopulation">0</span>
            </div>
          </div>
          <div id="provincesFooter">
            <button type="button" id="provincesEditorRefresh" data-tip="Refresh the Editor" className="icon-cw" />
            <button
              type="button"
              id="provincesEditStyle"
              data-tip="Edit provinces style in Style Editor"
              className="icon-adjust"
            />
            <button
              type="button"
              id="provincesRecolor"
              data-tip="Recolor listed provinces based on state color"
              className="icon-paint-roller"
            />
            <button
              type="button"
              id="provincesPercentage"
              data-tip="Toggle percentage / absolute values views"
              className="icon-percent"
            />
            <button type="button" id="provincesChart" data-tip="Show provinces chart" className="icon-chart-area" />
            <button
              type="button"
              id="provincesToggleLabels"
              data-tip="Toggle province labels. Change size in Menu ⭢ Style ⭢ Provinces"
              className="icon-font"
            />
            <button
              type="button"
              id="provincesExport"
              data-tip="Save provinces-related data as a text file (.csv)"
              className="icon-download"
            />
            <button
              type="button"
              id="provincesManually"
              data-tip="Manually re-assign provinces"
              className="icon-brush"
            />
            <div id="provincesManuallyButtons" style={{ display: "none" }}>
              <div
                data-tip="Change brush size. Shortcut: + to increase; – to decrease"
                style={{ marginBlock: "0.3em" }}
              >
                Brush size:
                <slider-input id="provincesBrush" min={1} max={100} value={8} />
              </div>
              <button type="button" id="provincesManuallyApply" data-tip="Apply assignment" className="icon-check" />
              <button type="button" id="provincesManuallyCancel" data-tip="Cancel assignment" className="icon-cancel" />
            </div>
            <button
              type="button"
              id="provincesRelease"
              data-tip="Release all provinces. It will make all provinces with burgs independent"
              className="icon-flag"
            />
            <button
              type="button"
              id="provincesAdd"
              data-tip="Add a new province. Hold Shift to add multiple"
              className="icon-plus"
            />
            <button
              type="button"
              id="provincesMerge"
              data-tip="Merge several provinces into one"
              className="icon-layer-group"
            />
            <button
              type="button"
              id="provincesRemoveAll"
              data-tip="Remove all provinces. States will remain as they are"
              className="icon-trash"
            />
            <span>State: </span>
            <select id="provincesFilterState" />
          </div>
        </div>
      </div>
    </Dialog>
  );
};
