import type React from "react";
import { useTranslation } from "react-i18next";
// Need to import actions from heightmapEditor
import { HeightmapEditorActions } from "../../controllers/heightmapEditor";
import { useDialogState } from "../../store/dialogState";
import { setHeightmapEditorState, useHeightmapEditorState } from "../../store/heightmapEditorState";
import { SliderInput } from "../components/SliderInput";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const BrushesPanelDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("brushesPanel"));
  const {
    brushMode,
    brushRadius,
    brushPower,
    linePower,
    cellTypeFilter,
    rescaleMode,
    rescaleValue,
    rescaleLower,
    rescaleHigher,
    rescaleSign,
    rescaleModifier,
    canUndo,
    canRedo
  } = useHeightmapEditorState();

  const handleBrushClick = (mode: string) => {
    HeightmapEditorActions.toggleBrushMode(mode);
  };

  return (
    <Dialog isOpen={isOpen} title={t("dialogs.titles.brushesPanel")} onClose={() => closeDialog("brushesPanel")}>
      <div id="brushesPanelContainer">
        <div>
          <div id="brushesButtons" className="d-inline-block">
            <button
              type="button"
              className={brushMode === "brushRaise" ? "pressed" : ""}
              onClick={() => handleBrushClick("brushRaise")}
              data-tip="Raise brush: increase height of cells in radius by Power value"
            >
              <svg viewBox="15 15 70 70" height="1em" width="1.6em" aria-hidden="true">
                <path d="m20,39 h60 M50,85 v-35 l-12,8 m12,-8 l12,8" fill="none" stroke="#000" strokeWidth={5} />
              </svg>
            </button>
            <button
              type="button"
              className={brushMode === "brushElevate" ? "pressed" : ""}
              onClick={() => handleBrushClick("brushElevate")}
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
              className={brushMode === "brushLower" ? "pressed" : ""}
              onClick={() => handleBrushClick("brushLower")}
              data-tip="Lower brush: drag to decrease height of cells in radius by Power value"
            >
              <svg viewBox="15 15 70 70" height="1em" width="1.6em" aria-hidden="true">
                <path d="M50,30 v35 l-12,-8 m12,8 l12,-8 M20,78 h60" fill="none" stroke="#000" strokeWidth={5} />
              </svg>
            </button>
            <button
              type="button"
              className={brushMode === "brushDepress" ? "pressed" : ""}
              onClick={() => handleBrushClick("brushDepress")}
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
              className={brushMode === "brushAlign" ? "pressed" : ""}
              onClick={() => handleBrushClick("brushAlign")}
              data-tip="Align brush: drag to set height of cells in radius to height of the cell at mousepoint"
            >
              <svg viewBox="15 15 70 70" height="1em" width="1.6em" aria-hidden="true">
                <path d="m20,50 h56 m0,20 h-56" fill="none" stroke="#000" strokeWidth={5} />
              </svg>
            </button>
            <button
              type="button"
              className={brushMode === "brushSmooth" ? "pressed" : ""}
              onClick={() => handleBrushClick("brushSmooth")}
              data-tip="Smooth brush: drag to level height of cells in radius to height of adjacent cells"
            >
              <svg viewBox="15 15 70 70" height="1em" width="1.6em" aria-hidden="true">
                <path d="m15,60 q15,-15 30,0 q15,15 35,0" fill="none" stroke="#000" strokeWidth={5} />
              </svg>
            </button>
            <button
              type="button"
              className={brushMode === "brushDisrupt" ? "pressed" : ""}
              onClick={() => handleBrushClick("brushDisrupt")}
              data-tip="Disrupt brush: drag to randomize height of cells in radius based on Power value"
            >
              <svg viewBox="15 15 70 70" height="1em" width="1.6em" aria-hidden="true">
                <path d="m15,63 l15,-13 15,20 15,-20 15,19 15,-14" fill="none" stroke="#000" strokeWidth={5} />
              </svg>
            </button>
            <button
              type="button"
              className={brushMode === "brushFill" ? "pressed" : ""}
              onClick={() => handleBrushClick("brushFill")}
              data-tip="Fill: click enclosed water or same-height land area to create a cone blob"
            >
              <svg viewBox="20 10 60 60" height="1em" width="1.6em" aria-hidden="true">
                <path d="M30,70 h40 M30,70 q0,-20 20,-20 q20,0 20,20" fill="none" stroke="#000" strokeWidth={5} />
                <path d="M50,20 v25 M50,20 l-10,8 M50,20 l10,8" fill="none" stroke="#000" strokeWidth={5} />
              </svg>
            </button>
            <button
              type="button"
              className={brushMode === "brushLine" ? "pressed" : ""}
              onClick={() => handleBrushClick("brushLine")}
              data-tip="Line: select two points to change heights along the line"
            >
              <svg viewBox="0 -5 100 100" height="1em" width="1.6em" aria-hidden="true">
                <path d="M0 90 L100 10" fill="none" stroke="#000" strokeWidth={7} />
              </svg>
            </button>
          </div>
          <div style={{ display: brushMode && brushMode !== "brushLine" ? "block" : "none" }}>
            <div data-tip="Change brush size" style={{ display: brushMode === "brushFill" ? "none" : "block" }}>
              <SliderInput
                min={1}
                max={100}
                value={brushRadius}
                onChange={v => setHeightmapEditorState({ brushRadius: Number(v) })}
              >
                <div>Radius:</div>
              </SliderInput>
            </div>
            <div data-tip="Change brush power">
              <SliderInput
                min={1}
                max={10}
                value={brushPower}
                onChange={v => setHeightmapEditorState({ brushPower: Number(v) })}
              >
                <div>Power:</div>
              </SliderInput>
            </div>
          </div>
          <div style={{ display: brushMode === "brushLine" ? "block" : "none" }}>
            <div data-tip="Change tool power. Shortcut: + to increase; – to decrease">
              <SliderInput
                min={-100}
                max={100}
                value={linePower}
                onChange={v => setHeightmapEditorState({ linePower: Number(v) })}
              >
                <div>Power:</div>
              </SliderInput>
            </div>
          </div>
          <div data-tip="Restrict brush to specific cell types">
            <label htmlFor="cellTypeFilter">
              <i>Cells to change:</i>
            </label>
            <select
              id="cellTypeFilter"
              value={cellTypeFilter}
              onChange={e => setHeightmapEditorState({ cellTypeFilter: e.target.value as "all" | "land" | "water" })}
            >
              <option value="all">all cells</option>
              <option value="land">only land cells</option>
              <option value="water">only water cells</option>
            </select>
          </div>
          {rescaleMode === null && (
            <div>
              <button
                type="button"
                onClick={HeightmapEditorActions.undoHistory}
                data-tip="Undo the latest action (Ctrl + Z)"
                className="icon-ccw"
                disabled={!canUndo}
              />
              <button
                type="button"
                onClick={HeightmapEditorActions.redoHistory}
                data-tip="Redo the action (Ctrl + Y)"
                className="icon-cw"
                disabled={!canRedo}
              />
              <button
                type="button"
                onClick={() => setHeightmapEditorState({ rescaleMode: "slider" })}
                data-tip="Show rescaler slider"
                className="icon-exchange"
              />
              <button
                type="button"
                onClick={() => setHeightmapEditorState({ rescaleMode: "condition" })}
                data-tip="Rescaler: change height if condition is fulfilled"
                className="icon-if"
              />
              <button
                type="button"
                onClick={HeightmapEditorActions.smoothAllHeights}
                data-tip="Smooth all heights a bit"
                className="icon-smooth"
              />
              <button
                type="button"
                onClick={HeightmapEditorActions.disruptAllHeights}
                data-tip="Disrupt (randomize) heights a bit"
                className="icon-disrupt"
              />
              <button
                type="button"
                onClick={HeightmapEditorActions.startFromScratch}
                data-tip="Set height for all cells to 0 (erase the map)"
                className="icon-eraser"
              />
            </div>
          )}
          {rescaleMode === "slider" && (
            <div>
              <button
                type="button"
                onClick={() => setHeightmapEditorState({ rescaleMode: null })}
                data-tip="Hide rescaler slider"
                className="icon-exchange"
              />
              <input
                data-tip="Change height for all cells"
                type="range"
                min={-10}
                max={10}
                step={1}
                value={rescaleValue}
                onChange={e => {
                  const val = Number(e.target.value);
                  setHeightmapEditorState({ rescaleValue: val });
                }}
                onPointerUp={e => {
                  const val = Number(e.currentTarget.value);
                  if (val !== 0) HeightmapEditorActions.rescale(val);
                }}
                onKeyUp={e => {
                  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
                    const val = Number(e.currentTarget.value);
                    if (val !== 0) HeightmapEditorActions.rescale(val);
                  }
                }}
              />
            </div>
          )}
          {rescaleMode === "condition" && (
            <div data-tip="If height is greater or equal to X and less or equal to Y, then perform an operation Z with operand V">
              <button
                type="button"
                onClick={() => setHeightmapEditorState({ rescaleMode: null })}
                data-tip="Hide rescaler"
                className="icon-if"
              />
              <span>h ≥</span>
              <input
                value={rescaleLower}
                onChange={e => setHeightmapEditorState({ rescaleLower: Number(e.target.value) })}
                type="number"
                min={0}
                max={100}
              />
              <span>≤</span>
              <input
                value={rescaleHigher}
                onChange={e => setHeightmapEditorState({ rescaleHigher: Number(e.target.value) })}
                type="number"
                min={1}
                max={100}
              />
              <span>⇒</span>
              <select
                value={rescaleSign}
                onChange={e =>
                  setHeightmapEditorState({ rescaleSign: e.target.value as "multiply" | "divide" | "add" | "subtract" })
                }
              >
                <option value="multiply">×</option>
                <option value="divide">÷</option>
                <option value="add">+</option>
                <option value="subtract">-</option>
                <option value="exponent">^</option>
              </select>
              <input
                type="number"
                value={rescaleModifier}
                onChange={e => setHeightmapEditorState({ rescaleModifier: Number(e.target.value) })}
                min={0}
                max="1.5"
                step="0.01"
              />
              <button
                type="button"
                onClick={HeightmapEditorActions.rescaleWithCondition}
                data-tip="Click to perform an operation"
                className="icon-play-circled2"
              />
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
};
