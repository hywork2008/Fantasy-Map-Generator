import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const BrushesPanelDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("brushesPanel"));

  return (
    <Dialog isOpen={isOpen} title="Brushes Panel" onClose={() => closeDialog("brushesPanel")}>
      <div id="brushesPanelContainer">
        <div>
          <div id="brushesButtons" style={{ display: "inline-block" }}>
            <button
              type="button"
              id="brushRaise"
              data-tip="Raise brush: increase height of cells in radius by Power value"
            >
              <svg viewBox="15 15 70 70" height="1em" width="1.6em" aria-hidden="true">
                <path d="m20,39 h60 M50,85 v-35 l-12,8 m12,-8 l12,8" fill="none" stroke="#000" strokeWidth={5} />
              </svg>
            </button>
            <button
              type="button"
              id="brushElevate"
              data-tip="Elevate brush: drag to gradually increase height of cells in radius by Power value"
            >
              <svg viewBox="15 15 70 70" height="1em" width="1.6em" aria-hidden="true">
                <path
                  d="m20,50 q30,-35 60,0 M50,85 v-35 l-12,8 m12,-8 l12,8"
                  fill="none"
                  stroke="#000"
                  strokeWidth={5}
                />
              </svg>
            </button>
            <button
              type="button"
              id="brushLower"
              data-tip="Lower brush: drag to decrease height of cells in radius by Power value"
            >
              <svg viewBox="15 15 70 70" height="1em" width="1.6em" aria-hidden="true">
                <path d="M50,30 v35 l-12,-8 m12,8 l12,-8 M20,78 h60" fill="none" stroke="#000" strokeWidth={5} />
              </svg>
            </button>
            <button
              type="button"
              id="brushDepress"
              data-tip="Depress brush: drag to gradually decrease height of cells in radius by Power value"
            >
              <svg viewBox="15 15 70 70" height="1em" width="1.6em" aria-hidden="true">
                <path
                  d="M50,30 v35 l-12,-8 m12,8 l12,-8 M20,63 q30,35 60,0"
                  fill="none"
                  stroke="#000"
                  strokeWidth={5}
                />
              </svg>
            </button>
            <button
              type="button"
              id="brushAlign"
              data-tip="Align brush: drag to set height of cells in radius to height of the cell at mousepoint"
            >
              <svg viewBox="15 15 70 70" height="1em" width="1.6em" aria-hidden="true">
                <path d="m20,50 h56 m0,20 h-56" fill="none" stroke="#000" strokeWidth={5} />
              </svg>
            </button>
            <button
              type="button"
              id="brushSmooth"
              data-tip="Smooth brush: drag to level height of cells in radius to height of adjacent cells"
            >
              <svg viewBox="15 15 70 70" height="1em" width="1.6em" aria-hidden="true">
                <path d="m15,60 q15,-15 30,0 q15,15 35,0" fill="none" stroke="#000" strokeWidth={5} />
              </svg>
            </button>
            <button
              type="button"
              id="brushDisrupt"
              data-tip="Disrupt brush: drag to randomize height of cells in radius based on Power value"
            >
              <svg viewBox="15 15 70 70" height="1em" width="1.6em" aria-hidden="true">
                <path d="m15,63 l15,-13 15,20 15,-20 15,19 15,-14" fill="none" stroke="#000" strokeWidth={5} />
              </svg>
            </button>
            <button
              type="button"
              id="brushFill"
              data-tip="Fill: click enclosed water or same-height land area to create a cone blob"
            >
              <svg viewBox="20 10 60 60" height="1em" width="1.6em" aria-hidden="true">
                <path d="M30,70 h40 M30,70 q0,-20 20,-20 q20,0 20,20" fill="none" stroke="#000" strokeWidth={5} />
                <path d="M50,20 v25 M50,20 l-10,8 M50,20 l10,8" fill="none" stroke="#000" strokeWidth={5} />
              </svg>
            </button>
            <button type="button" id="brushLine" data-tip="Line: select two points to change heights along the line">
              <svg viewBox="0 -5 100 100" height="1em" width="1.6em" aria-hidden="true">
                <path d="M0 90 L100 10" fill="none" stroke="#000" strokeWidth={7} />
              </svg>
            </button>
          </div>
          <div id="brushesSliders" style={{ display: "none" }}>
            <div data-tip="Change brush size. Shortcut: + to increase; – to decrease">
              <slider-input id="heightmapBrushRadius" min={1} max={100} value={25}>
                <div style={{ width: "3.5em" }}>Radius:</div>
              </slider-input>
            </div>
            <div data-tip="Change brush power">
              <slider-input id="heightmapBrushPower" min={1} max={10} value={5}>
                <div style={{ width: "3.5em" }}>Power:</div>
              </slider-input>
            </div>
          </div>
          <div id="lineSlider" style={{ display: "none" }}>
            <div data-tip="Change tool power. Shortcut: + to increase; – to decrease">
              <slider-input id="heightmapLinePower" min={-100} max={100} value={30}>
                <div style={{ width: "3.5em" }}>Power:</div>
              </slider-input>
            </div>
          </div>
          <div data-tip="Restrict brush to specific cell types" style={{ marginBottom: "0.6em" }}>
            <label htmlFor="cellTypeFilter">
              <i>Cells to change:</i>
            </label>
            <select id="cellTypeFilter" defaultValue="all">
              <option value="all">all cells</option>
              <option value="land">only land cells</option>
              <option value="water">only water cells</option>
            </select>
          </div>
          <div id="modifyButtons">
            <button
              type="button"
              id="undo"
              data-tip="Undo the latest action (Ctrl + Z)"
              className="icon-ccw"
              disabled
            />
            <button type="button" id="redo" data-tip="Redo the action (Ctrl + Y)" className="icon-cw" disabled />
            <button type="button" id="rescaleShow" data-tip="Show rescaler slider" className="icon-exchange" />
            <button
              type="button"
              id="rescaleCondShow"
              data-tip="Rescaler: change height if condition is fulfilled"
              className="icon-if"
            />
            <button type="button" id="smoothHeights" data-tip="Smooth all heights a bit" className="icon-smooth" />
            <button
              type="button"
              id="disruptHeights"
              data-tip="Disrupt (randomize) heights a bit"
              className="icon-disrupt"
            />
            <button
              type="button"
              id="brushClear"
              data-tip="Set height for all cells to 0 (erase the map)"
              className="icon-eraser"
            />
          </div>
          <div id="rescaleSection" style={{ display: "none" }}>
            <button type="button" id="rescaleHide" data-tip="Hide rescaler slider" className="icon-exchange" />
            <input
              id="rescaler"
              data-tip="Change height for all cells"
              type="range"
              min={-10}
              max={10}
              step={1}
              defaultValue={0}
            />
          </div>
          <div
            id="rescaleCondSection"
            data-tip="If height is greater or equal to X and less or equal to Y, then perform an operation Z with operand V"
            style={{ display: "none" }}
          >
            <button type="button" id="rescaleCondHide" data-tip="Hide rescaler" className="icon-if" />
            <label>h ≥</label>
            <input id="rescaleLower" defaultValue={20} type="number" min={0} max={100} />
            <label>≤</label>
            <input id="rescaleHigher" defaultValue={100} type="number" min={1} max={100} />
            <label>⇒</label>
            <select id="conditionSign" defaultValue="multiply">
              <option value="multiply">×</option>
              <option value="divide">÷</option>
              <option value="add">+</option>
              <option value="subtract">-</option>
              <option value="exponent">^</option>
            </select>
            <input id="rescaleModifier" type="number" defaultValue="0.9" min={0} max="1.5" step="0.01" />
            <button
              type="button"
              id="rescaleExecute"
              data-tip="Click to perform an operation"
              className="icon-play-circled2"
            />
          </div>
        </div>
      </div>
    </Dialog>
  );
};
