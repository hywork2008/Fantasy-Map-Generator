import type React from "react";
import { useDialogState } from "../../../../store/dialogState";
import { SliderInput } from "../../../../ui/components/SliderInput";
import { Dialog } from "../../../../ui/dialogs/Dialog";
import { closeDialog } from "../../../../ui/dialogs/dialogService";

export const TradeAnimationDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("tradeAnimationEditor"));

  return (
    <Dialog isOpen={isOpen} title="Trade Animation" onClose={() => closeDialog("tradeAnimationEditor")}>
      <div id="tradeAnimationEditorContainer" style={{ padding: "0.5em", minWidth: "20em" }}>
        <div data-tip="Select which trade types to display">
          <label htmlFor="tradeAnimationDisplayType">Display:</label>
          <select id="tradeAnimationDisplayType" style={{ marginLeft: "0.5em" }}>
            <option value="both">Both local and global</option>
            <option value="local">Local only</option>
            <option value="global">Global only</option>
          </select>
        </div>

        <div data-tip="Maximum number of trade markers animated simultaneously" style={{ marginTop: "0.4em" }}>
          <label htmlFor="tradeAnimationConcurrent">Concurrent:</label>
          <SliderInput id="tradeAnimationConcurrent" min="1" max="200" step="1" value="30" onChange={() => {}} />
        </div>

        <div data-tip="Duration of a single trade journey in milliseconds" style={{ marginTop: "0.4em" }}>
          <label htmlFor="tradeAnimationDuration">Duration (ms):</label>
          <SliderInput id="tradeAnimationDuration" min="50" max="2000" step="10" value="250" onChange={() => {}} />
        </div>

        <div
          data-tip="Multiplier applied to duration for overland segments (land is slower than sea)"
          style={{ marginTop: "0.4em" }}
        >
          <label htmlFor="tradeAnimationLandModifier">Land modifier:</label>
          <SliderInput id="tradeAnimationLandModifier" min="1" max="20" step="1" value="5" onChange={() => {}} />
        </div>

        <div data-tip="Pause duration at segment boundaries (ms)" style={{ marginTop: "0.4em" }}>
          <label htmlFor="tradeAnimationSegmentPause">Segment pause (ms):</label>
          <SliderInput id="tradeAnimationSegmentPause" min="0" max="5000" step="100" value="1000" onChange={() => {}} />
        </div>

        <div data-tip="Size of trade markers in pixels" style={{ marginTop: "0.4em" }}>
          <label htmlFor="tradeAnimationMarkerSize">Marker size:</label>
          <SliderInput id="tradeAnimationMarkerSize" min="1" max="20" step="1" value="4" onChange={() => {}} />
        </div>

        <div id="tradeAnimationBottom" style={{ marginTop: "0.8em" }}>
          <button type="button" id="tradeAnimationApply" data-tip="Apply settings and restart animation">
            Apply
          </button>
          <button type="button" id="tradeAnimationRestart" data-tip="Restart the animation" className="icon-cw" />
          <button
            type="button"
            id="tradeAnimationStop"
            data-tip="Stop the animation"
            className="icon-stop"
            style={{ marginLeft: "0.3em" }}
          />
        </div>
      </div>
    </Dialog>
  );
};
