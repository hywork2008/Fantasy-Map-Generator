import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const ZonesEditorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("zonesEditor"));

  return (
    <Dialog isOpen={isOpen} title="Zones Editor" onClose={() => closeDialog("zonesEditor")}>
      <div id="zonesEditorContainer">
        <div>
          <div id="customHeader" className="header" style={{ gridTemplateColumns: "13em 7em 6em 5em 9em" }}>
            <div data-tip="Zone description">Description&nbsp;</div>
            <div data-tip="Zone type">Type&nbsp;</div>
            <div data-tip="Zone cells count" className="hide">
              Cells&nbsp;
            </div>
            <div data-tip="Zone area" className="hide">
              Area&nbsp;
            </div>
            <div data-tip="Zone population" className="hide">
              Population&nbsp;
            </div>
          </div>
          <div id="zonesBodySection" className="table" data-type="absolute" />
          <div id="zonesTotal" className="totalLine">
            <div data-tip="Number of zones" style={{ marginLeft: 5 }}>
              Zones:&nbsp;<span id="zonesFooterNumber">0</span>
            </div>
            <div data-tip="Total cells number" style={{ marginLeft: 12 }}>
              Cells:&nbsp;<span id="zonesFooterCells">0</span>
            </div>
            <div data-tip="Total map area" style={{ marginLeft: 12 }}>
              Area:&nbsp;<span id="zonesFooterArea">0</span>
            </div>
            <div data-tip="Total map population" style={{ marginLeft: 12 }}>
              Population:&nbsp;<span id="zonesFooterPopulation">0</span>
            </div>
          </div>
          <div id="zonesFooter">
            <button type="button" id="zonesEditorRefresh" data-tip="Refresh the Editor" className="icon-cw" />
            <button
              type="button"
              id="zonesEditStyle"
              data-tip="Edit zones style in Style Editor"
              className="icon-adjust"
            />
            <button
              type="button"
              id="zonesLegend"
              data-tip="Toggle Legend box (shows all non-hidden zones)"
              className="icon-list-bullet"
            />
            <button
              type="button"
              id="zonesPercentage"
              data-tip="Toggle percentage / absolute values views"
              className="icon-percent"
            />
            <button type="button" id="zonesManually" data-tip="Re-assign zones" className="icon-brush" />
            <div id="zonesManuallyButtons" style={{ display: "none" }}>
              <div
                data-tip="Change brush size. Shortcut: + to increase; – to decrease"
                style={{ marginBlock: "0.3em" }}
              >
                Brush size:
                <slider-input id="zonesBrush" min={1} max={100} value={8} />
              </div>
              <div>
                <input id="zonesBrushLandOnly" className="checkbox" type="checkbox" defaultChecked />
                <label htmlFor="zonesBrushLandOnly" className="checkbox-label">
                  <i>Change land only</i>
                </label>
              </div>
              <div style={{ marginTop: "0.3em" }}>
                <button type="button" id="zonesManuallyApply" data-tip="Apply assignment" className="icon-check" />
                <button type="button" id="zonesManuallyCancel" data-tip="Cancel assignment" className="icon-cancel" />
                <button
                  type="button"
                  id="zonesRemove"
                  data-tip="Click to toggle the removal mode on brush dragging"
                  data-shortcut="Ctrl"
                  className="icon-eraser"
                />
              </div>
            </div>
            <button type="button" id="zonesAdd" data-tip="Add new zone layer" className="icon-plus" />
            <button type="button" id="zonesExport" data-tip="Download zones-related data" className="icon-download" />
            <div id="zonesFilters" data-tip="Show only zones of selected type" style={{ display: "inline-block" }}>
              Type:
              <select id="zonesFilterType" />
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
};
