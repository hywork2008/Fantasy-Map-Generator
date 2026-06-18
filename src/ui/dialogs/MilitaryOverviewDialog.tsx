import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const MilitaryOverviewDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("militaryOverview"));

  return (
    <Dialog isOpen={isOpen} title="Military Overview" onClose={() => closeDialog("militaryOverview")}>
      <div id="militaryOverviewContainer">
        <div>
          <div id="militaryHeader" className="header">
            <div data-tip="State name. Click to sort" className="sortable alphabetically" data-sortby="state">
              State&nbsp;
            </div>
            <div
              data-tip="Total military personnel (considering crew). Click to sort"
              id="militaryTotalColumn"
              className="sortable icon-sort-number-down"
              data-sortby="total"
            >
              Total&nbsp;
            </div>
            <div data-tip="State population. Click to sort" className="sortable" data-sortby="population">
              Population&nbsp;
            </div>
            <div
              data-tip="Military personnel rate (% of state population). Depends on war alert. Click to sort"
              className="sortable"
              data-sortby="rate"
            >
              Rate&nbsp;
            </div>
            <div
              data-tip="War Alert. Modifier to military forces number, depends of political situation. Click to sort"
              className="sortable"
              data-sortby="alert"
            >
              War Alert&nbsp;
            </div>
          </div>
          <div id="militaryBody" className="table" data-type="absolute" />
          <div id="militaryTotal" className="totalLine">
            <div data-tip="States number" style={{ marginLeft: 4 }}>
              States:&nbsp;<span id="militaryFooterStates">0</span>
            </div>
            <div data-tip="Total military forces" style={{ marginLeft: 14 }}>
              Total forces:&nbsp;<span id="militaryFooterForcesTotal">0</span>
            </div>
            <div data-tip="Average military forces per state" style={{ marginLeft: 14 }}>
              Average forces:&nbsp;<span id="militaryFooterForces">0</span>
            </div>
            <div data-tip="Average forces rate per state" style={{ marginLeft: 14 }}>
              Average rate:&nbsp;<span id="militaryFooterRate">0%</span>
            </div>
            <div data-tip="Average War Alert" style={{ marginLeft: 14 }}>
              Average alert:&nbsp;<span id="militaryFooterAlert">0</span>
            </div>
          </div>
          <div id="militaryFooter">
            <button
              type="button"
              id="militaryOverviewRefresh"
              data-tip="Refresh the overview screen"
              className="icon-cw"
            />
            <button type="button" id="militaryOptionsButton" data-tip="Edit Military units" className="icon-cog" />
            <button
              type="button"
              id="militaryRegimentsList"
              data-tip="Show regiments list"
              className="icon-list-bullet"
            />
            <button
              type="button"
              id="militaryPercentage"
              data-tip="Toggle percentage / absolute values views"
              className="icon-percent"
            />
            <button
              type="button"
              id="militaryOverviewRecalculate"
              data-tip="Recalculate military forces based on current options"
              className="icon-retweet"
            />
            <button
              type="button"
              id="militaryExport"
              data-tip="Save military-related data as a text file (.csv)"
              className="icon-download"
            />
            <button type="button" id="militaryWiki" data-tip="Open Military Forces Tutorial" className="icon-info" />
          </div>
        </div>
      </div>
    </Dialog>
  );
};
