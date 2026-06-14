import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const BattleScreenDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("battleScreen"));

  return (
    <Dialog isOpen={isOpen} title="Battle Screen" onClose={() => closeDialog("battleScreen")}>
      <div id="battleScreenContainer">
        <div>
          <div id="battleBody">
            <div className="template" style={{ display: "none" }} id="battlePhases_field">
              <button
                type="button"
                data-tip="Skirmish phase. Ranged units excel"
                data-phase="skirmish"
                className="icon-button-skirmish"
              />
              <button
                type="button"
                data-tip="Melee phase. Melee units excel"
                data-phase="melee"
                className="icon-button-melee"
              />
              <button
                type="button"
                data-tip="Pursue phase. Mounted units excel"
                data-phase="pursue"
                className="icon-button-pursue"
              />
              <button
                type="button"
                data-tip="Retreat phase. Units strength reduced"
                data-phase="retreat"
                className="icon-button-retreat"
              />
            </div>
            <div className="template" style={{ display: "none" }} id="battlePhases_naval">
              <button
                type="button"
                data-tip="Shelling phase. Naval artillery bombardment of enemy fleet"
                data-phase="shelling"
                className="icon-button-shelling"
              />
              <button
                type="button"
                data-tip="Boarding phase. Melee units go aboard"
                data-phase="boarding"
                className="icon-button-boarding"
              />
              <button
                type="button"
                data-tip="Сhase phase. Naval units pursue and rarely shell enemy fleet"
                data-phase="chase"
                className="icon-button-chase"
              />
              <button
                type="button"
                data-tip="Withdrawal phase. Naval units try to escape enemy fleet"
                data-phase="withdrawal"
                className="icon-button-withdrawal"
              />
            </div>
            <div className="template" style={{ display: "none" }} id="battlePhases_siege_attackers">
              <button
                type="button"
                data-tip="Blockade phase. Prepare or hold the blockade"
                data-phase="blockade"
                className="icon-button-blockade"
              />
              <button
                type="button"
                data-tip="Bombardment phase. Attack enemy with machinery units"
                data-phase="bombardment"
                className="icon-button-bombardment"
              />
              <button
                type="button"
                data-tip="Storming phase. Storm enemy town. Melee units excel"
                data-phase="storming"
                className="icon-button-storming"
              />
              <button
                type="button"
                data-tip="Looting phase. Plunder the town. Units strength increased"
                data-phase="looting"
                className="icon-button-looting"
              />
              <button
                type="button"
                data-tip="Retreat phase. Units strength reduced"
                data-phase="retreat"
                className="icon-button-retreat"
              />
            </div>
            <div className="template" style={{ display: "none" }} id="battlePhases_siege_defenders">
              <button
                type="button"
                data-tip="Sheltering phase. Hide behind the walls and wait"
                data-phase="sheltering"
                className="icon-button-sheltering"
              />
              <button
                type="button"
                data-tip="Sortie phase. Make a sortie from besieged town. Melee units excel"
                data-phase="sortie"
                className="icon-button-sortie"
              />
              <button
                type="button"
                data-tip="Bombardment phase. Attack enemy with machinery units"
                data-phase="bombardment"
                className="icon-button-bombardment"
              />
              <button
                type="button"
                data-tip="Defense phase. Ranged and melee units excel"
                data-phase="defense"
                className="icon-button-defense"
              />
              <button
                type="button"
                data-tip="Surrendering phase. Give up the defense. Units strength reduced"
                data-phase="surrendering"
                className="icon-button-surrendering"
              />
              <button
                type="button"
                data-tip="Pursue phase. Mounted units excel"
                data-phase="pursue"
                className="icon-button-pursue"
              />
            </div>
            <div className="template" style={{ display: "none" }} id="battlePhases_ambush_attackers">
              <button
                type="button"
                data-tip="Shock phase. Units strength reduced"
                data-phase="shock"
                className="icon-button-shock"
              />
              <button
                type="button"
                data-tip="Melee phase. Melee units excel"
                data-phase="melee"
                className="icon-button-melee"
              />
              <button
                type="button"
                data-tip="Pursue phase. Mounted units excel"
                data-phase="pursue"
                className="icon-button-pursue"
              />
              <button
                type="button"
                data-tip="Retreat phase. Units strength reduced"
                data-phase="retreat"
                className="icon-button-retreat"
              />
            </div>
            <div className="template" style={{ display: "none" }} id="battlePhases_ambush_defenders">
              <button
                type="button"
                data-tip="Surprice attack phase. Units strength increased, ranged units excel"
                data-phase="surprise"
                className="icon-button-surprise"
              />
              <button
                type="button"
                data-tip="Melee phase. Melee units excel"
                data-phase="melee"
                className="icon-button-melee"
              />
              <button
                type="button"
                data-tip="Pursue phase. Mounted units excel"
                data-phase="pursue"
                className="icon-button-pursue"
              />
              <button
                type="button"
                data-tip="Retreat phase. Units strength reduced"
                data-phase="retreat"
                className="icon-button-retreat"
              />
            </div>
            <div className="template" style={{ display: "none" }} id="battlePhases_landing_attackers">
              <button
                type="button"
                data-tip="Landing phase. Amphibious attack. Units are vulnerable against prepared defense"
                data-phase="landing"
                className="icon-button-landing"
              />
              <button
                type="button"
                data-tip="Melee phase. Melee units excel"
                data-phase="melee"
                className="icon-button-melee"
              />
              <button
                type="button"
                data-tip="Pursue phase. Mounted units excel"
                data-phase="pursue"
                className="icon-button-pursue"
              />
              <button
                type="button"
                data-tip="Flee phase. Units strength reduced"
                data-phase="flee"
                className="icon-button-flee"
              />
            </div>
            <div className="template" style={{ display: "none" }} id="battlePhases_landing_defenders">
              <button
                type="button"
                data-tip="Shock phase. Units are not prepared for a defense"
                data-phase="shock"
                className="icon-button-shock"
              />
              <button
                type="button"
                data-tip="Defense phase. Prepared defense. Units strength increased"
                data-phase="defense"
                className="icon-button-defense"
              />
              <button
                type="button"
                data-tip="Melee phase. Melee units excel"
                data-phase="melee"
                className="icon-button-melee"
              />
              <button
                type="button"
                data-tip="Waiting phase. Cannot pursue fleeing naval"
                data-phase="waiting"
                className="icon-button-waiting"
              />
              <button
                type="button"
                data-tip="Pursue phase. Try to intercept fleeing attackers. Mounted units excel"
                data-phase="pursue"
                className="icon-button-pursue"
              />
              <button
                type="button"
                data-tip="Retreat phase. Units strength reduced"
                data-phase="retreat"
                className="icon-button-retreat"
              />
            </div>
            <div className="template" style={{ display: "none" }} id="battlePhases_air">
              <button
                type="button"
                data-tip="Maneuvering phase. Units strength reduced"
                data-phase="maneuvering"
                className="icon-button-maneuvering"
              />
              <button
                type="button"
                data-tip="Dogfight phase. Units strength increased"
                data-phase="dogfight"
                className="icon-button-dogfight"
              />
              <button
                type="button"
                data-tip="Pursue phase. Units strength increased"
                data-phase="pursue"
                className="icon-button-pursue"
              />
              <button
                type="button"
                data-tip="Retreat phase. Units strength reduced"
                data-phase="retreat"
                className="icon-button-retreat"
              />
            </div>
            <div style={{ fontSize: "1.2em", fontWeight: "bold", width: "unset" }}>
              <span>Attackers</span>
              <div style={{ float: "right", fontSize: "0.7em" }}>
                <meter
                  id="battleMorale_attackers"
                  data-tip="Attackers morale: "
                  min={0}
                  max={100}
                  low={33}
                  high={66}
                  optimum={80}
                />
                <div
                  id="battlePower_attackers"
                  data-tip="Attackers strength during this phase. Strength defines dealt damage"
                  style={{ display: "inline-block", textAlign: "center" }}
                  className="icon-button-power"
                />
                <div style={{ display: "inline-block" }}>
                  <button type="button" id="battlePhase_attackers" style={{ width: "3.2em" }} />
                  <div className="battlePhases" style={{ display: "none" }} />
                </div>
                <button
                  type="button"
                  id="battleDie_attackers"
                  data-tip="Random factor for attackers. Click to re-roll"
                  style={{ padding: "0.1em 0.2em", width: "3.2em" }}
                  className="icon-button-die"
                />
              </div>
            </div>
            <table id="battleAttackers" />
            <div style={{ fontSize: "1.2em", fontWeight: "bold", width: "unset" }}>
              <span>Defenders</span>
              <div style={{ float: "right", fontSize: "0.7em" }}>
                <meter
                  id="battleMorale_defenders"
                  data-tip="Defenders morale: "
                  min={0}
                  max={100}
                  low={33}
                  high={66}
                  optimum={80}
                />
                <div
                  id="battlePower_defenders"
                  data-tip="Defenders strength during this phase. Strength defines dealt damage"
                  style={{ display: "inline-block", textAlign: "center" }}
                  className="icon-button-power"
                />
                <div style={{ display: "inline-block" }}>
                  <button type="button" id="battlePhase_defenders" style={{ width: "3.2em" }} />
                  <div className="battlePhases" style={{ display: "none" }} />
                </div>
                <button
                  type="button"
                  id="battleDie_defenders"
                  data-tip="Random factor for defenders. Click to re-roll"
                  style={{ padding: "0.1em 0.2em", width: "3.2em" }}
                  className="icon-button-die"
                />
              </div>
            </div>
            <table id="battleDefenders" />
          </div>
          <div id="battleBottom">
            <button type="button" id="battleType" data-tip="Battle type. Click to change" />
            <div className="battleTypes" style={{ display: "none" }}>
              <button
                data-tip="Field Battle: a standard type of combat"
                data-type="field"
                className="icon-button-field"
                type="button"
              />
              <button
                data-tip="Naval Battle: naval units combat"
                data-type="naval"
                className="icon-button-naval"
                type="button"
              />
              <button
                data-tip="Siege: burg blockade and storming"
                data-type="siege"
                className="icon-button-siege"
                type="button"
              />
              <button
                data-tip="Ambush: surprise attack"
                data-type="ambush"
                className="icon-button-ambush"
                type="button"
              />
              <button
                data-tip="Landing: amphibious attack"
                data-type="landing"
                className="icon-button-landing"
                type="button"
              />
              <button
                data-tip="Air Battle: maneuring fight of avia units"
                data-type="air"
                className="icon-button-air"
                type="button"
              />
            </div>
            <button type="button" id="battleNameShow" data-tip="Set battle name" className="icon-font" />
            <div id="battleNameSection" style={{ display: "none" }}>
              <button type="button" id="battleNameHide" data-tip="Hide the battle name section" className="icon-font" />
              <input id="battleNamePlace" data-tip="Type place name" style={{ width: "30%" }} />
              <input id="battleNameFull" data-tip="Type full battle name" style={{ width: "46%" }} />
              <button
                type="button"
                id="battleNameCulture"
                data-tip="Generate culture-specific name for place and battle"
                className="icon-book"
              />
              <button
                type="button"
                id="battleNameRandom"
                data-tip="Generate random name for place and battle"
                className="icon-globe"
              />
            </div>
            <button
              type="button"
              id="battleAddRegiment"
              data-tip="Add regiment to the battle"
              className="icon-user-plus"
            />
            <button type="button" id="battleRoll" data-tip="Roll dice to update random factor" className="icon-die" />
            <button type="button" id="battleRun" data-tip="Iterate battle" className="icon-play" />
            <button
              type="button"
              id="battleApply"
              data-tip="End battle: apply current results and close the screen"
              className="icon-check"
            />
            <button
              type="button"
              id="battleCancel"
              data-tip="Cancel battle: roll back results and close the screen"
              className="icon-cancel"
            />
            <button type="button" id="battleWiki" data-tip="Open Battle Simulation Tutorial" className="icon-info" />
          </div>
          <div id="brushesPanel" className="dialog stable" style={{ display: "none" }}>
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
          <div id="templateEditor" className="dialog stable" style={{ display: "none" }}>
            <div id="templateTop">
              <i>Select template: </i>
              <select
                id="templateSelect"
                style={{ width: "16em" }}
                data-prev="templateCustom"
                data-tip="Select base template"
                defaultValue="custom"
              >
                <option value="custom">Custom</option>
                <option value="volcano">Volcano</option>
                <option value="highIsland">High Island</option>
                <option value="lowIsland">Low Island</option>
                <option value="continents">Continents</option>
                <option value="archipelago">Archipelago</option>
                <option value="atoll">Atoll</option>
                <option value="mediterranean">Mediterranean</option>
                <option value="peninsula">Peninsula</option>
                <option value="pangea">Pangea</option>
                <option value="isthmus">Isthmus</option>
                <option value="shattered">Shattered</option>
                <option value="taklamakan">Taklamakan</option>
                <option value="oldWorld">Old World</option>
                <option value="fractious">Fractious</option>
              </select>
            </div>
            <div id="templateTools">
              <button data-type="Hill" data-tip="Hill: small blob" type="button">
                H
              </button>
              <button data-type="Pit" data-tip="Pit: round depression" type="button">
                P
              </button>
              <button data-type="Range" data-tip="Range: elongated elevation" type="button">
                R
              </button>
              <button data-type="Trough" data-tip="Trough: elongated depression" type="button">
                T
              </button>
              <button data-type="Strait" data-tip="Strait: centered vertical or horizontal depression" type="button">
                S
              </button>
              <button data-type="Mask" data-tip="Mask: lower cells near edges or in map center" type="button">
                M
              </button>
              <button data-type="Invert" data-tip="Invert heightmap along the axes" type="button">
                I
              </button>
              <button data-type="Add" data-tip="Add or subtract value from all heights in range" type="button">
                +
              </button>
              <button data-type="Multiply" data-tip="Multiply all heights in range by factor" type="button">
                *
              </button>
              <button
                data-type="Smooth"
                data-tip="Smooth the map replacing cell heights by an average values of its neighbors"
                type="button"
              >
                ~
              </button>
            </div>
            <div id="templateBody" data-changed={0} className="table" style={{ padding: "2px 0" }}>
              <div data-type="Hill">
                <div className="icon-check" data-tip="Click to skip the step" />
                <div style={{ width: "4em" }}>Hill</div>
                <i className="icon-trash-empty pointer" data-tip="Remove the step" />
                <i className="icon-resize-vertical" data-tip="Drag to reorder" />
                <span>
                  y:
                  <input
                    className="templateY"
                    data-tip="Y axis position in percentage (minY-maxY or Y)"
                    defaultValue="47-53"
                  />
                </span>
                <span>
                  x:
                  <input
                    className="templateX"
                    data-tip="X axis position in percentage (minX-maxX or X)"
                    defaultValue="65-75"
                  />
                </span>
                <span>
                  h:
                  <input
                    className="templateHeight"
                    data-tip="Blob maximum height, use hyphen to get a random number in range"
                    defaultValue="90-100"
                  />
                </span>
                <span>
                  n:
                  <input
                    className="templateCount"
                    data-tip="Blobs to add, use hyphen to get a random number in range"
                    defaultValue={1}
                  />
                </span>
              </div>
            </div>
            <div id="templateBottom">
              <button type="button" id="templateRun" data-tip="Execute the template" className="icon-play-circled2" />
              <button type="button" id="templateUndo" data-tip="Undo the latest action" className="icon-ccw" disabled />
              <button type="button" id="templateRedo" data-tip="Redo the action" className="icon-cw" disabled />
              <button
                type="button"
                id="templateSave"
                data-tip="Download the template as a text file"
                className="icon-download"
              />
              <button
                type="button"
                id="templateLoad"
                data-tip="Open previously downloaded template"
                className="icon-upload"
              />
              <button
                type="button"
                id="templateCA"
                data-tip="Find or share custom template on Cartography Assets portal"
                className="icon-drafting-compass"
              />
              <button
                type="button"
                id="templateTutorial"
                data-tip="Open Template Editor Tutorial"
                className="icon-info"
              />
              <label data-tip="Lock seed (click on lock icon) if you want template to generate the same heightmap each time">
                Seed:{" "}
                <input
                  id="templateSeed"
                  defaultValue=""
                  type="number"
                  min={1}
                  max={999999999}
                  step={1}
                  style={{ width: "8em" }}
                />
                <i data-locked={0} id="lock_templateSeed" className="icon-lock-open" />
              </label>
            </div>
          </div>
          <div id="imageConverter" className="dialog stable" style={{ display: "none" }}>
            <div id="convertImageButtons">
              <button type="button" id="convertImageLoad" data-tip="Load image to convert" className="icon-upload" />
              <button
                type="button"
                id="convertAutoLum"
                data-tip="Auto-assign colors based on liminosity (good for monochrome images)"
                className="icon-adjust"
              />
              <button
                type="button"
                id="convertAutoHue"
                data-tip="Auto-assign colors based on hue (good for colored images)"
                className="icon-paint-roller"
              />
              <button
                type="button"
                id="convertAutoFMG"
                data-tip="Auto-assign colors using generator scheme (for exported colored heightmaps)"
                className="icon-layer-group"
              />
              <button
                type="button"
                id="convertColorsButton"
                data-tip="Set maximum number of colors"
                className="icon-signal"
              />
              <input id="convertColors" defaultValue={100} style={{ display: "none" }} />
              <button
                type="button"
                id="convertCancel"
                data-tip="Cancel the conversion. Previous heightmap will be restored"
                className="icon-cancel"
              />
            </div>
            <div data-tip="Set opacity of the loaded image" style={{ paddingTop: "0.4em" }}>
              <i>Overlay opacity:</i>
              <br />
              <input
                id="convertOverlay"
                type="range"
                min={0}
                max={1}
                step=".01"
                defaultValue={0}
                style={{ width: "12.6em" }}
              />
              <input
                id="convertOverlayNumber"
                type="number"
                min={0}
                max={1}
                step=".01"
                defaultValue={0}
                style={{ width: "4.2em" }}
              />
            </div>
            <div
              data-tip="Select a color below and assign a height value for it"
              id="colorsSelect"
              style={{ display: "none" }}
            >
              <i>Set height: </i>
              <span id="colorsSelectValue" />
              <span>
                (<span id="colorsSelectFriendly">0</span>)
              </span>
              <br />
              <div id="imageConverterPalette" />
            </div>
            <div
              data-tip="Select a color to re-assign the height value"
              id="colorsAssigned"
              style={{ display: "none" }}
            >
              <i>
                Assigned colors (<span id="colorsAssignedNumber" />
                ):
              </i>
              <div id="colorsAssignedContainer" className="colorsContainer" />
            </div>
            <div data-tip="Select a color to assign a height value" id="colorsUnassigned" style={{ display: "none" }}>
              <i>
                Unassigned colors (<span id="colorsUnassignedNumber" />
                ):
              </i>
              <div id="colorsUnassignedContainer" className="colorsContainer" />
            </div>
            <button
              type="button"
              id="convertComplete"
              data-tip="Complete the conversion. All unassigned colors will be considered as ocean"
              style={{ margin: "0.4em 0" }}
              className="glow"
            >
              Complete the conversion
            </button>
          </div>
          <div id="biomesEditor" className="dialog stable" style={{ display: "none" }}>
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
            <div id="biomesFooter" className="totalLine">
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
            <div id="biomesBottom">
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
          <div id="provincesEditor" className="dialog stable" style={{ display: "none" }}>
            <div
              id="provincesHeader"
              className="header"
              style={{ gridTemplateColumns: "11em 8em 8em 6em 6em 6em 8em" }}
            >
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
            <div id="provincesFooter" className="totalLine">
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
            <div id="provincesBottom">
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
                <button
                  type="button"
                  id="provincesManuallyCancel"
                  data-tip="Cancel assignment"
                  className="icon-cancel"
                />
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
          <div id="diplomacyEditor" className="dialog stable" style={{ display: "none" }}>
            <div id="diplomacyHeader" className="header" style={{ gridTemplateColumns: "15em 6em" }}>
              <div data-tip="Click to sort by state name" className="sortable alphabetically" data-sortby="name">
                State&nbsp;
              </div>
              <div
                data-tip="Click to sort by diplomatical relations"
                className="sortable alphabetically"
                data-sortby="relations"
              >
                Relations&nbsp;
              </div>
            </div>
            <div id="diplomacyBodySection" className="table" />
            <div className="info-line">
              Click on state name to see relations.
              <br />
              Click on relations name to change it
            </div>
            <div id="diplomacyBottom" style={{ marginTop: "0.1em" }}>
              <button type="button" id="diplomacyEditorRefresh" data-tip="Refresh the Editor" className="icon-cw" />
              <button
                type="button"
                id="diplomacyEditStyle"
                data-tip="Edit states (including diplomacy view) style in Style Editor"
                className="icon-adjust"
              />
              <button
                type="button"
                id="diplomacyRegenerate"
                data-tip="Regenerate diplomatical relations"
                className="icon-retweet"
              />
              <button
                type="button"
                id="diplomacyReset"
                data-tip="Reset diplomatical relations of selected state to Neutral"
                className="icon-eraser"
              />
              <button
                type="button"
                id="diplomacyHistory"
                data-tip="Show relations history"
                className="icon-hourglass-1"
              />
              <button
                type="button"
                id="diplomacyShowMatrix"
                data-tip="Show relations matrix"
                className="icon-list-bullet"
              />
              <button
                type="button"
                id="diplomacyExport"
                data-tip="Save state relations matrix as a text file (.csv)"
                className="icon-download"
              />
            </div>
          </div>
          <div id="namesbaseEditor" className="dialog stable textual" style={{ display: "none" }}>
            <div id="namesbaseBasesTop">
              <span>Select base: </span>
              <select id="namesbaseSelect" data-tip="Select base to edit" style={{ width: "12em" }} defaultValue={0} />
              <span style={{ marginLeft: 2 }}>Names data: </span>
            </div>
            <div id="namesbaseBody" style={{ marginBlock: 2, width: "auto" }}>
              <textarea
                id="namesbaseTextarea"
                data-base={0}
                rows={13}
                data-tip="Names data: a comma separated list of source names used for names generation"
                placeholder="Provide a names data: a comma separated list of source names"
                autoCorrect="off"
                spellCheck="false"
                style={{ resize: "none" }}
                defaultValue={""}
              />
              <div>
                <span>Name: </span>
                <input
                  id="namesbaseName"
                  data-tip="Type to change a base name"
                  placeholder="Base name"
                  autoCorrect="off"
                  spellCheck="false"
                  style={{ width: "12em" }}
                />
                <span>Length: </span>
                <input id="namesbaseMin" data-tip="Recommended minimum name length" type="number" min={2} max={100} />
                <input
                  id="namesbaseMax"
                  data-tip="Recommended maximum name length"
                  type="number"
                  min={2}
                  defaultValue={10}
                />
                <span>Doubled: </span>
                <input
                  id="namesbaseDouble"
                  data-tip="Populate with letters that can be used twice in a row (geminates)"
                  autoCorrect="off"
                  spellCheck="false"
                  style={{ width: "10em" }}
                />
              </div>
              <fieldset>
                <legend>Generated examples:</legend>
                <div id="namesbaseExamples" data-tip="Examples. Click to re-generate" />
              </fieldset>
            </div>
            <div id="namesbaseBottom">
              <button
                type="button"
                id="namesbaseUpdateExamples"
                data-tip="Re-generate examples based on provided data"
                className="icon-arrows-cw"
              />
              <button type="button" id="namesbaseAdd" data-tip="Add new namesbase" className="icon-plus" />
              <button
                type="button"
                id="namesbaseDefault"
                data-tip="Restore default namesbase"
                className="icon-cancel"
              />
              <button
                type="button"
                id="namesbaseDownload"
                data-tip="Download namesbase to PC"
                className="icon-download"
              />
              <button
                type="button"
                id="namesbaseUpload"
                data-tip="Upload a namesbase from PC, replacing the current set"
                className="icon-upload"
              />
              <button
                type="button"
                id="namesbaseUploadExtend"
                data-tip="Upload a namesbase from PC, extending the current set"
                className="icon-up-circled2"
              />
              <button
                type="button"
                id="namesbaseCA"
                data-tip="Find or share custom namesbase on Cartography Assets portal"
                className="icon-drafting-compass"
              />
              <button
                type="button"
                id="namesbaseAnalyze"
                data-tip="Analyze namesbase to get a validity and quality overview"
                className="icon-flask"
              />
              <button
                type="button"
                id="namesbaseSpeak"
                data-tip="Speak the examples. You can change voice and language in options"
                className="icon-voice"
              />
            </div>
          </div>
          <div id="zonesEditor" className="dialog stable" style={{ display: "none" }}>
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
            <div id="zonesFooter" className="totalLine">
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
            <div id="zonesBottom">
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
          <div id="notesEditor" className="dialog stable" style={{ display: "none" }}>
            <div style={{ marginBottom: "0.3em" }}>
              <strong>Element: </strong>
              <select id="notesSelect" data-tip="Select element id" style={{ width: "12em" }} />
              <strong>Element name: </strong>
              <input
                id="notesName"
                data-tip="Set element name"
                autoCorrect="off"
                spellCheck="false"
                style={{ width: "16em" }}
              />
              <span data-tip="Speak the name. You can change voice and language in options" className="speaker">
                🔊
              </span>
            </div>
            <div id="notesLegend" contentEditable="true" />
            <div style={{ marginTop: "0.3em" }}>
              <button type="button" id="notesFocus" data-tip="Focus on selected object" className="icon-target" />
              <button type="button" id="notesGenerateWithAi" data-tip="Generate note with AI" className="icon-robot" />
              <button
                type="button"
                id="notesPin"
                data-tip="Toggle notes box dispay: hide or do not hide the box on mouse move"
                className="icon-pin"
              />
              <button type="button" id="notesDownload" data-tip="Download notes to PC" className="icon-download" />
              <button type="button" id="notesUpload" data-tip="Upload notes from PC" className="icon-upload" />
              <button type="button" id="notesRemove" data-tip="Remove this note" className="icon-trash fastDelete" />
            </div>
          </div>
          <div id="aiGenerator" className="dialog stable" style={{ display: "none" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3em", width: "100%" }}>
              <textarea
                id="aiGeneratorResult"
                placeholder="Generated text will appear here"
                cols={30}
                rows={10}
                defaultValue={""}
              />
              <textarea id="aiGeneratorPrompt" placeholder="Type a prompt here" cols={30} rows={5} defaultValue={""} />
              <div style={{ display: "flex", alignItems: "center", gap: "1em" }}>
                <label htmlFor="aiGeneratorModel">
                  Model:
                  <select id="aiGeneratorModel" />
                </label>
                <label
                  htmlFor="aiGeneratorTemperature"
                  data-tip="Temperature controls response randomness; higher values mean more creativity, lower values mean more predictability"
                >
                  Temperature:
                  <input id="aiGeneratorTemperature" type="number" min={-1} max={2} step=".1" className="icon-key" />
                </label>
                <label htmlFor="aiGeneratorKey">
                  Key:
                  <input
                    id="aiGeneratorKey"
                    placeholder="Enter API key"
                    className="icon-key"
                    data-tip="Enter API key. Note: the Generator doesn't store the key or any generated data"
                  />
                  <button
                    type="button"
                    id="aiGeneratorKeyHelp"
                    className="icon-help-circled"
                    data-tip="Click to see the usage instructions"
                  ></button>
                </label>
              </div>
            </div>
          </div>
          <div id="emblemEditor" className="dialog stable" style={{ display: "none" }}>
            <svg viewBox="0 0 200 200" aria-hidden="true">
              <use id="emblemImage" />
            </svg>
            <div id="emblemBody">
              <div>
                <b id="emblemArmiger" />
              </div>
              <hr />
              <div data-tip="Select state">
                <div className="label">State:</div>
                <select id="emblemStates" />
              </div>
              <div data-tip="Select province in state">
                <div className="label">Province:</div>
                <select id="emblemProvinces" />
              </div>
              <div data-tip="Select burg in province or state">
                <div className="label">Burg:</div>
                <select id="emblemBurgs" />
              </div>
              <hr />
              <div data-tip="Select shape of the emblem">
                <div className="label">Shape:</div>
                <select id="emblemShapeSelector">
                  <optgroup label="Basic">
                    <option value="heater">Heater</option>
                    <option value="spanish">Spanish</option>
                    <option value="french">French</option>
                  </optgroup>
                  <optgroup label="Regional">
                    <option value="horsehead">Horsehead</option>
                    <option value="horsehead2">Horsehead Edgy</option>
                    <option value="polish">Polish</option>
                    <option value="hessen">Hessen</option>
                    <option value="swiss">Swiss</option>
                  </optgroup>
                  <optgroup label="Historical">
                    <option value="boeotian">Boeotian</option>
                    <option value="roman">Roman</option>
                    <option value="kite">Kite</option>
                    <option value="oldFrench">Old French</option>
                    <option value="renaissance">Renaissance</option>
                    <option value="baroque">Baroque</option>
                  </optgroup>
                  <optgroup label="Specific">
                    <option value="targe">Targe</option>
                    <option value="targe2">Targe2</option>
                    <option value="pavise">Pavise</option>
                    <option value="wedged">Wedged</option>
                  </optgroup>
                  <optgroup label="Banner">
                    <option value="flag">Flag</option>
                    <option value="pennon">Pennon</option>
                    <option value="guidon">Guidon</option>
                    <option value="banner">Banner</option>
                    <option value="dovetail">Dovetail</option>
                    <option value="gonfalon">Gonfalon</option>
                    <option value="pennant">Pennant</option>
                  </optgroup>
                  <optgroup label="Simple">
                    <option value="round">Round</option>
                    <option value="oval">Oval</option>
                    <option value="vesicaPiscis">Vesica Piscis</option>
                    <option value="square">Square</option>
                    <option value="diamond">Diamond</option>
                  </optgroup>
                  <optgroup label="Fantasy">
                    <option value="fantasy1">Fantasy1</option>
                    <option value="fantasy2">Fantasy2</option>
                    <option value="fantasy3">Fantasy3</option>
                    <option value="fantasy4">Fantasy4</option>
                    <option value="fantasy5">Fantasy5</option>
                  </optgroup>
                  <optgroup label="Middle Earth">
                    <option value="noldor">Noldor</option>
                    <option value="gondor">Gondor</option>
                    <option value="easterling">Easterling</option>
                    <option value="erebor">Erebor</option>
                    <option value="ironHills">Iron Hills</option>
                    <option value="urukHai">UrukHai</option>
                    <option value="moriaOrc">Moria Orc</option>
                  </optgroup>
                </select>
              </div>
              <div data-tip="Set size of particular Emblem. To hide set to 0. To change the entire category go to Menu ⭢ Style ⭢ Emblems">
                <div className="label" style={{ width: "2.8em" }}>
                  Size:
                </div>
                <input id="emblemSizeSlider" type="range" min={0} max={5} step=".1" style={{ width: "7em" }} />
                <input id="emblemSizeNumber" type="number" min={0} max={5} step=".1" />
              </div>
            </div>
            <div id="emblemsBottom">
              <button type="button" id="emblemsRegenerate" data-tip="Regenerate emblem" className="icon-shuffle" />
              <button
                type="button"
                id="emblemsArmoria"
                data-tip="Edit the emblem in Armoria - dedicated heraldry editor. Download emblem and upload it back map the generator"
                className="icon-brush"
              />
              <button
                type="button"
                id="emblemsDownload"
                data-tip="Set size, select file format and download emblem image"
                className="icon-download"
              />
              <button
                type="button"
                id="emblemsUpload"
                data-tip="Upload png, jpg or svg image from Armoria or other sources as emblem"
                className="icon-upload"
              />
              <button
                type="button"
                id="emblemsGallery"
                data-tip="Download emblems gallery as html document (open in browser; downloading takes some time)"
                className="icon-layer-group"
              />
              <button
                type="button"
                id="emblemsFocus"
                data-tip="Show emblem associated area or place"
                className="icon-target"
              />
            </div>
            <div id="emblemUploadControl" className="hidden">
              <button
                type="button"
                id="emblemsUploadImage"
                data-tip="Upload SVG or PNG image from any source. Make sure background is transparent"
              >
                Any image
              </button>
              <button
                type="button"
                id="emblemsUploadSVG"
                data-tip="Upload prepared SVG image (SVG from Armoria or SVG processed with 'Optimize vector' tool)"
              >
                Prepared SVG
              </button>
              <a
                href="https://www.iloveimg.com/compress-image"
                target="_blank"
                data-tip="Use external tool to compress/resize raster images before upload"
                rel="noopener"
              >
                Comperess raster
              </a>
              <span> | </span>
              <a
                href="https://jakearchibald.github.io/svgomg"
                target="_blank"
                data-tip="Use external tool to optimize vector images before upload"
                rel="noopener"
              >
                Optimize vector
              </a>
            </div>
            <div id="emblemDownloadControl" className="hidden">
              <input
                id="emblemsDownloadSize"
                data-tip="Set image size in pixels"
                type="number"
                defaultValue={500}
                step={100}
                min={100}
                max={10000}
              />
              <button
                type="button"
                id="emblemsDownloadSVG"
                data-tip="Download as SVG: scalable vector image. Best quality, can be opened in browser or Inkscape"
              >
                SVG
              </button>
              <button
                type="button"
                id="emblemsDownloadPNG"
                data-tip="Download as PNG: lossless raster image with transparent background"
              >
                PNG
              </button>
              <button
                type="button"
                id="emblemsDownloadJPG"
                data-tip="Download as JPG: lossy compressed raster image with solid white background"
              >
                JPG
              </button>
            </div>
          </div>
          <div id="unitsEditor" className="dialog stable" style={{ display: "none" }}>
            <div id="unitsBody" style={{ marginLeft: "1.1em" }}>
              <div className="unitsHeader" style={{ marginTop: "0.4em" }}>
                <span className="icon-map-signs" />
                <label>Distance:</label>
              </div>
              <div data-tip="Select a distance unit or provide a custom name">
                <label>Distance unit:</label>
                <select id="distanceUnitInput" data-stored="distanceUnit" defaultValue="mi">
                  <option value="mi">Mile (mi)</option>
                  <option value="km">Kilometer (km)</option>
                  <option value="lg">League (lg)</option>
                  <option value="vr">Versta (vr)</option>
                  <option value="nmi">Nautical mile (nmi)</option>
                  <option value="nlg">Nautical league (nlg)</option>
                  <option value="custom_name">Custom name</option>
                </select>
              </div>
              <div data-tip="Select how many distance units are in one pixel">
                <i data-locked={0} id="lock_distanceScale" className="icon-lock-open" />
                <slider-input
                  id="distanceScaleInput"
                  data-stored="distanceScale"
                  min=".01"
                  max={20}
                  step=".1"
                  value={3}
                >
                  <label>1 map pixel:</label>
                </slider-input>
              </div>
              <div data-tip="Area unit name, type &quot;square&quot; to add ² to the distance unit">
                <label>Area unit:</label>
                <input id="areaUnit" data-stored="areaUnit" type="text" defaultValue="square" />
              </div>
              <div className="unitsHeader">
                <span className="icon-signal" />
                <label>Altitude:</label>
              </div>
              <div data-tip="Select an altitude unit or provide a custom name">
                <label>Height unit:</label>
                <select id="heightUnit" data-stored="heightUnit" defaultValue="ft">
                  <option value="ft">Feet (ft)</option>
                  <option value="m">Meters (m)</option>
                  <option value="f">Fathoms (f)</option>
                  <option value="custom_name">Custom name</option>
                </select>
              </div>
              <div data-tip="Set height exponent, i.e. a value for altitude change sharpness. Altitude affects temperature and hence biomes">
                <slider-input
                  id="heightExponentInput"
                  data-stored="heightExponent"
                  min="1.5"
                  max="2.2"
                  step=".01"
                  value={2}
                >
                  <label>Exponent:</label>
                </slider-input>
              </div>
              <div className="unitsHeader" data-tip="Select Temperature scale">
                <span className="icon-temperature-high" />
                <label>Temperature:</label>
              </div>
              <div>
                <label>Temperature scale:</label>
                <select id="temperatureScale" data-stored="temperatureScale" defaultValue="°C">
                  <option value="°C">degree Celsius (°C)</option>
                  <option value="°F">degree Fahrenheit (°F)</option>
                  <option value="K">Kelvin (K)</option>
                  <option value="°R">degree Rankine (°R)</option>
                  <option value="°De">degree Delisle (°De)</option>
                  <option value="°N">degree Newton (°N)</option>
                  <option value="°Ré">degree Réaumur (°Ré)</option>
                  <option value="°Rø">degree Rømer (°Rø)</option>
                </select>
              </div>
              <div className="unitsHeader">
                <span className="icon-male" />
                <label>Population:</label>
              </div>
              <div data-tip="Set how many people are in one population point">
                <slider-input
                  id="populationRateInput"
                  data-stored="populationRate"
                  min={10}
                  max={10000}
                  step={10}
                  value={1000}
                >
                  <label>1 population point:</label>
                </slider-input>
              </div>
              <div data-tip="Set urban population modifier. Change to increase or descrese burgs population">
                <slider-input id="urbanizationInput" data-stored="urbanization" min=".01" max={5} step=".01" value={1}>
                  <label>Urbanization rate:</label>
                </slider-input>
              </div>
              <div data-tip="Set urban density: average population per building in Medieval Fantasy City Generator">
                <slider-input id="urbanDensityInput" data-stored="urbanDensity" min={1} max={200} step={1} value={10}>
                  <label>Urban density:</label>
                </slider-input>
              </div>
            </div>
            <div id="unitsBottom">
              <button
                type="button"
                id="addLinearRuler"
                data-tip="Click to place a linear measurer (ruler)"
                className="icon-ruler"
              />
              <button
                type="button"
                id="addOpisometer"
                data-tip="Drag to measure a curve length (opisometer)"
                className="icon-drafting-compass"
              />
              <button
                type="button"
                id="addRouteOpisometer"
                data-tip="Drag to measure a curve length that sticks to routes (route opisometer)"
              >
                <svg width="0.88em" height="0.88em" aria-hidden="true">
                  <use xlinkHref="#icon-route" />
                </svg>
              </button>
              <button
                type="button"
                id="addPlanimeter"
                data-tip="Drag to measure a polygon area (planimeter)"
                className="icon-draw-polygon"
              />
              <button
                type="button"
                id="removeRulers"
                data-tip="Remove all rulers from the map. Click on ruler label to remove a ruler separately"
                className="icon-trash"
              />
              <button type="button" id="unitsRestore" data-tip="Restore default units settings" className="icon-ccw" />
            </div>
          </div>
          <div id="burgsOverview" className="dialog stable" style={{ display: "none" }}>
            <div
              id="burgsHeader"
              className="header"
              style={{ gridTemplateColumns: "9em 7em 7.5em 7.2em 6.5em 7em 6em" }}
            >
              <div data-tip="Click to sort by burg name" className="sortable alphabetically" data-sortby="name">
                Burg
              </div>
              <div data-tip="Click to sort by province name" className="sortable alphabetically" data-sortby="province">
                Province
              </div>
              <div data-tip="Click to sort by state name" className="sortable alphabetically" data-sortby="state">
                State
              </div>
              <div data-tip="Click to sort by culture name" className="sortable alphabetically" data-sortby="culture">
                Culture
              </div>
              <div data-tip="Click to sort by culture group" className="sortable alphabetically" data-sortby="group">
                Group
              </div>
              <div
                data-tip="Click to sort by burg population"
                className="sortable icon-sort-number-down"
                data-sortby="population"
              >
                Population
              </div>
              <div data-tip="Click to sort by burg features" className="sortable alphabetically" data-sortby="features">
                Features&nbsp;
              </div>
            </div>
            <div id="burgsBody" className="table" />
            <div
              id="burgsFilters"
              data-tip="Apply a filter"
              style={{ paddingBlock: "0.1em", display: "flex", gap: "0.5em", width: "100%" }}
            >
              <label htmlFor="burgsSearch" data-tip="Filter by name, province, state, culture, or group">
                Search: <input id="burgsSearch" type="search" />
              </label>
              <label htmlFor="burgsFilterState">
                State:
                <select id="burgsFilterState" />
              </label>
              <label htmlFor="burgsFilterCulture">
                Culture:
                <select id="burgsFilterCulture" />
              </label>
            </div>
            <div id="burgsFooter" className="totalLine">
              <div data-tip="Burgs displayed" style={{ marginLeft: 4 }}>
                Burgs:&nbsp;<span id="burgsFooterBurgs">0 of 0</span>
              </div>
              <div data-tip="Average population" style={{ marginLeft: 14 }}>
                Average population:&nbsp;<span id="burgsFooterPopulation">0</span>
              </div>
            </div>
            <div id="burgsBottom">
              <button type="button" id="burgsOverviewRefresh" data-tip="Refresh the Editor" className="icon-cw" />
              <button type="button" id="burgsGroupsEditorButton" data-tip="Edit burg groups" className="icon-cog" />
              <button type="button" id="burgsChart" data-tip="Show burgs bubble chart" className="icon-chart-area" />
              <button
                type="button"
                id="regenerateBurgNames"
                data-tip="Regenerate burg names based on assigned culture"
                className="icon-retweet"
              />
              <button
                type="button"
                id="addNewBurg"
                data-tip="Add a new burg. Hold Shift to add multiple"
                className="icon-plus"
              />
              <button
                type="button"
                id="burgsExport"
                data-tip="Save burgs-related data as a text file (.csv)"
                className="icon-download"
              />
              <button type="button" id="burgNamesImport" data-tip="Rename burgs in bulk" className="icon-upload" />
              <button type="button" id="burgsLockAll" data-tip="Lock or unlock all burgs" className="icon-lock" />
              <button
                type="button"
                id="burgsRemoveAll"
                data-tip="Remove all unlocked burgs except for capitals. To remove a capital remove its state first"
                className="icon-trash"
              />
            </div>
          </div>
          <div id="burgGroupsEditor" className="dialog stable" style={{ display: "none" }}>
            <form id="burgGroupsForm">
              <table className="table">
                <thead>
                  <tr>
                    <th data-tip="Rendering order: higher values are rendered on top">Order</th>
                    <th data-tip="Type group name">Name</th>
                    <th data-tip="Burg preview generator">Preview generator</th>
                    <th data-tip="Set min population constraint" colSpan={3}>
                      Population
                    </th>
                    <th data-tip="Select allowed biomes">Biomes</th>
                    <th data-tip="Select allowed states">States</th>
                    <th data-tip="Select allowed cultures">Cultures</th>
                    <th data-tip="Select allowed religions">Religions</th>
                    <th data-tip="Select allowed features">Features</th>
                    <th data-tip="Number of burgs in group">Count</th>
                    <th data-tip="Activate/deactivate group">Active</th>
                    <th data-tip="Select group to be assigned if burg doesn't pass the criteria for other groups">
                      Default
                    </th>
                  </tr>
                </thead>
                <tbody id="burgGroupsBody" />
              </table>
            </form>
          </div>
          <div id="routesOverview" className="dialog stable" style={{ display: "none" }}>
            <div id="routesHeader" className="header" style={{ gridTemplateColumns: "17em 8em 8em" }}>
              <div data-tip="Click to sort by route name" className="sortable alphabetically" data-sortby="name">
                Route&nbsp;
              </div>
              <div data-tip="Click to sort by route group" className="sortable alphabetically" data-sortby="group">
                Group&nbsp;
              </div>
              <div
                data-tip="Click to sort by route length"
                className="sortable icon-sort-number-down"
                data-sortby="length"
              >
                Length&nbsp;
              </div>
            </div>
            <div id="routesBody" className="table" />
            <div id="routesFooter" className="totalLine">
              <div data-tip="Routes number" style={{ marginLeft: 4 }}>
                Routes:&nbsp;<span id="routesFooterNumber">0</span>
              </div>
              <div data-tip="Average length" style={{ marginLeft: 12 }}>
                Average length:&nbsp;<span id="routesFooterLength">0</span>
              </div>
            </div>
            <div id="routesBottom">
              <button type="button" id="routesOverviewRefresh" data-tip="Refresh the Editor" className="icon-cw" />
              <button
                type="button"
                id="routesCreateNew"
                data-tip="Create a new route selecting route cells"
                className="icon-map-pin"
              />
              <button
                type="button"
                id="routesExport"
                data-tip="Save routes-related data as a text file (.csv)"
                className="icon-download"
              />
              <button type="button" id="routesLockAll" data-tip="Lock or unlock all routes" className="icon-lock" />
              <button
                type="button"
                id="routesRemoveAll"
                data-tip="Remove all unlocked routes (locked routes are kept)"
                className="icon-trash"
              />
              <label htmlFor="routesSearch" data-tip="Filter by name or group" style={{ marginLeft: "0.2em" }}>
                Search: <input id="routesSearch" type="search" />
              </label>
            </div>
          </div>
          <div id="riversOverview" className="dialog stable" style={{ display: "none" }}>
            <div id="riversHeader" className="header" style={{ gridTemplateColumns: "9em 4em 7em 5em 5em 9em" }}>
              <div data-tip="Click to sort by river name" className="sortable alphabetically" data-sortby="name">
                River&nbsp;
              </div>
              <div data-tip="Click to sort by river type name" className="sortable alphabetically" data-sortby="type">
                Type&nbsp;
              </div>
              <div
                data-tip="Click to sort by discharge (flux in m3/s)"
                className="sortable icon-sort-number-down"
                data-sortby="discharge"
              >
                Discharge&nbsp;
              </div>
              <div data-tip="Click to sort by river length" className="sortable" data-sortby="length">
                Length&nbsp;
              </div>
              <div data-tip="Click to sort by river mouth width" className="sortable" data-sortby="width">
                Width&nbsp;
              </div>
              <div data-tip="Click to sort by river basin" className="sortable alphabetically" data-sortby="basin">
                Basin&nbsp;
              </div>
            </div>
            <div id="riversBody" className="table" />
            <div id="riversFooter" className="totalLine">
              <div data-tip="Rivers number" style={{ marginLeft: 4 }}>
                Rivers:&nbsp;<span id="riversFooterNumber">0</span>
              </div>
              <div data-tip="Average discharge" style={{ marginLeft: 12 }}>
                Average discharge:&nbsp;<span id="riversFooterDischarge">0</span>
              </div>
              <div data-tip="Average length" style={{ marginLeft: 12 }}>
                Length:&nbsp;<span id="riversFooterLength">0</span>
              </div>
              <div data-tip="Average mouth width" style={{ marginLeft: 12 }}>
                Width:&nbsp;<span id="riversFooterWidth">0</span>
              </div>
            </div>
            <div id="riversBottom">
              <button type="button" id="riversOverviewRefresh" data-tip="Refresh the Editor" className="icon-cw" />
              <button
                type="button"
                id="addNewRiver"
                data-tip="Automatically add river starting from clicked cell. Hold Shift to add multiple"
                className="icon-plus"
              />
              <button
                type="button"
                id="riverCreateNew"
                data-tip="Create a new river selecting river cells"
                className="icon-map-pin"
              />
              <button
                type="button"
                id="riversBasinHighlight"
                data-tip="Toggle basin highlight mode"
                className="icon-sitemap"
              />
              <button
                type="button"
                id="riversExport"
                data-tip="Save rivers-related data as a text file (.csv)"
                className="icon-download"
              />
              <button type="button" id="riversRemoveAll" data-tip="Remove all rivers" className="icon-trash" />
              <label htmlFor="riversSearch" data-tip="Filter by name, type or basin" style={{ marginLeft: "0.2em" }}>
                Search: <input id="riversSearch" type="search" />
              </label>
            </div>
          </div>
          <div id="militaryOverview" className="dialog stable" style={{ display: "none" }}>
            <div id="militaryHeader" className="header">
              <div data-tip="State name. Click to sort" className="sortable alphabetically" data-sortby="state">
                State&nbsp;
              </div>
              <div
                data-tip="Total military personnel (considering crew). Click to sort"
                id="militaryTotal"
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
            <div id="militaryFooter" className="totalLine">
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
            <div id="militaryBottom">
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
          <div id="regimentsOverview" className="dialog stable" style={{ display: "none" }}>
            <div id="regimentsHeader" className="header">
              <div data-tip="State name. Click to sort" className="sortable alphabetically" data-sortby="state">
                State&nbsp;
              </div>
              <div
                data-tip="Regiment emblem and name. Click to sort by name"
                className="sortable alphabetically"
                data-sortby="name"
              >
                Name&nbsp;
              </div>
              <div
                data-tip="Total military personnel (not considering crew). Click to sort"
                id="regimentsTotal"
                className="sortable icon-sort-number-down"
                data-sortby="total"
              >
                Total&nbsp;
              </div>
            </div>
            <div id="regimentsBody" className="table" data-type="absolute" />
            <div id="regimentsBottom">
              <button
                type="button"
                id="regimentsOverviewRefresh"
                data-tip="Refresh the overview screen"
                className="icon-cw"
              />
              <button
                type="button"
                id="regimentsPercentage"
                data-tip="Toggle percentage / absolute values views"
                className="icon-percent"
              />
              <button type="button" id="regimentsAddNew" data-tip="Add new Regiment" className="icon-user-plus" />
              <div data-tip="Select state" style={{ display: "inline-block" }}>
                <span>State: </span>
                <select id="regimentsFilter" />
              </div>
              <button
                type="button"
                id="regimentsExport"
                data-tip="Save military-related data as a text file (.csv)"
                className="icon-download"
              />
            </div>
          </div>
          <div id="militaryOptions" className="dialog stable" style={{ display: "none" }}>
            <div className="table">
              <table id="militaryOptionsTable">
                <thead>
                  <tr>
                    <th data-tip="Unit icon">Icon</th>
                    <th data-tip="Unit name. If name is changed for existing unit, old unit will be replaced">
                      Unit name
                    </th>
                    <th style={{ width: "5em" }} data-tip="Select allowed biomes">
                      Biomes
                    </th>
                    <th style={{ width: "5em" }} data-tip="Select allowed states">
                      States
                    </th>
                    <th style={{ width: "5em" }} data-tip="Select allowed cultures">
                      Cultures
                    </th>
                    <th style={{ width: "5em" }} data-tip="Select allowed religions">
                      Religions
                    </th>
                    <th data-tip="Conscription percentage for rural population">Rural</th>
                    <th data-tip="Conscription percentage for urban population">Urban</th>
                    <th data-tip="Average number of people in crew (used for total personnel calculation)">Crew</th>
                    <th data-tip="Unit military power (used for battle simulation)">Power</th>
                    <th data-tip="Unit type to apply special rules on forces recalculation">Type</th>
                    <th data-tip="Check if unit is separate and can be stacked only with units of the same type">
                      Separate
                    </th>
                  </tr>
                </thead>
                <tbody />
              </table>
            </div>
          </div>
          <div id="markersOverview" className="dialog stable" style={{ display: "none" }}>
            <div id="markersHeader" className="header" style={{ gridTemplateColumns: "15em 1em 3em" }}>
              <div data-tip="Click to sort by marker type" className="sortable alphabetically" data-sortby="type">
                Type&nbsp;
              </div>
              <div
                id="markersInverPin"
                style={{ color: "#6e5e66" }}
                data-tip="Click to invert pin state for all markers"
                className="icon-pin pointer"
              />
              <div
                id="markersInverLock"
                style={{ color: "#6e5e66" }}
                data-tip="Click to invert lock state for all markers"
                className="icon-lock pointer"
              />
            </div>
            <div id="markersBody" className="table" />
            <div>
              <label htmlFor="markersSearch" data-tip="Filter by type">
                Search: <input id="markersSearch" type="search" />
              </label>
            </div>
            <div id="markersFooter" className="totalLine">
              <div data-tip="Markers number">
                Markers: <span id="markersFooterNumber">0</span> of <span id="markersFooterTotal">0</span>
              </div>
            </div>
            <div id="markersBottom">
              <button
                type="button"
                id="markersOverviewRefresh"
                data-tip="Refresh the Overview screen"
                className="icon-cw"
              />
              <input type="hidden" id="addedMarkerType" name="addedMarkerType" defaultValue="" />
              <span id="markerTypeSelectorWrapper">
                <button type="button" id="markerTypeSelector" data-tip="Select marker type for newly added markers.">
                  ❓
                </button>
                <div id="markerTypeSelectMenu" />
              </span>
              <button
                type="button"
                id="markersAddFromOverview"
                data-tip="Add a new marker. Hold Shift to add multiple"
                className="icon-plus"
              />
              <button
                type="button"
                id="markersGenerationConfig"
                data-tip="Config markers generation options"
                className="icon-cog"
              />
              <button
                type="button"
                id="markersRemoveAll"
                data-tip="Remove all unlocked markers"
                className="icon-trash"
              />
              <button
                type="button"
                id="markersExport"
                data-tip="Save markers data as a text file (.csv)"
                className="icon-download"
              />
            </div>
          </div>
          <div id="styleSaver" className="dialog stable textual" style={{ display: "none" }}>
            <div id="styleSaverHeader" style={{ padding: "2px 0" }}>
              <span>Preset name:</span>
              <input
                id="styleSaverName"
                data-tip="Enter style preset name"
                placeholder="Preset name"
                style={{ width: "12em" }}
                required
              />
              <span
                id="styleSaverTip"
                data-tip="Shows whether there is already a preset with this name"
                className="italic"
              />
            </div>
            <div id="styleSaverBody" style={{ padding: "2px 0", width: "100%" }}>
              <span>Style JSON:</span>
              <textarea
                id="styleSaverJSON"
                rows={18}
                data-tip="Style JSON is getting formed based the current settings, but can be entered manually"
                placeholder="Paste any valid style data in JSON format"
                autoCorrect="off"
                spellCheck="false"
                defaultValue={""}
              />
            </div>
            <div id="styleSaverBottom">
              <button
                type="button"
                id="styleSaverSave"
                data-tip="Save current JSON as a new style preset"
                className="icon-check"
              />
              <button
                type="button"
                id="styleSaverDownload"
                data-tip="Download the style as a .json file (can be opened in any text editor)"
                className="icon-download"
              />
              <button
                type="button"
                id="styleSaverLoad"
                data-tip="Open previously downloaded style file"
                className="icon-upload"
              />
              <button
                type="button"
                id="styleSaverCA"
                data-tip="Find or share custom style preset on Cartography Assets portal"
                className="icon-drafting-compass"
              />
            </div>
          </div>
          <div id="cellInfo" style={{ display: "none" }} className="dialog stable">
            <p>
              <b>Cell:</b> <span id="infoCell" /> <b>X:</b> <span id="infoX" /> <b>Y:</b> <span id="infoY" />
            </p>
            <p>
              <b>Latitude:</b> <span id="infoLat" />
            </p>
            <p>
              <b>Longitude:</b> <span id="infoLon" />
            </p>
            <p>
              <b>Geozone:</b> <span id="infoGeozone" />
            </p>
            <p>
              <b>Area:</b> <span id="infoArea">0</span>
            </p>
            <p>
              <b>Type:</b> <span id="infoFeature">n/a</span>
            </p>
            <p>
              <b>Precipitation:</b> <span id="infoPrec">0</span>
            </p>
            <p>
              <b>River:</b> <span id="infoRiver">no</span>
            </p>
            <p>
              <b>Population:</b> <span id="infoPopulation">0</span>
            </p>
            <p>
              <b>Elevation:</b> <span id="infoElevation">0</span>
            </p>
            <p>
              <b>Depth:</b> <span id="infoDepth">0</span>
            </p>
            <p>
              <b>Temperature:</b> <span id="infoTemp">0</span>
            </p>
            <p>
              <b>Biome:</b> <span id="infoBiome">n/a</span>
            </p>
            <p>
              <b>State:</b> <span id="infoState">n/a</span>
            </p>
            <p>
              <b>Province:</b> <span id="infoProvince">n/a</span>
            </p>
            <p>
              <b>Culture:</b> <span id="infoCulture">n/a</span>
            </p>
            <p>
              <b>Religion:</b> <span id="infoReligion">n/a</span>
            </p>
            <p>
              <b>Burg:</b> <span id="infoBurg">n/a</span>
            </p>
          </div>
          <div id="minimap" style={{ display: "none" }} className="dialog stable">
            <div id="minimapContent" />
          </div>
          <div id="options3d" className="dialog stable" style={{ display: "none" }}>
            <div id="options3dMesh" style={{ display: "none" }}>
              <div data-tip="Set map rotation speed. Set to 0 is you want to toggle off the rotation">
                <div>Rotation:</div>
                <input id="options3dMeshRotationRange" type="range" min={0} max={10} step=".1" />
                <input
                  id="options3dMeshRotationNumber"
                  type="number"
                  min={0}
                  max={10}
                  step=".1"
                  style={{ width: "4em" }}
                />
              </div>
              <div data-tip="Set height scale">
                <div>Height scale:</div>
                <input id="options3dScaleRange" type="range" min={0} max={100} />
                <input id="options3dScaleNumber" type="number" min={0} max={1000} style={{ width: "4em" }} />
              </div>
              <div data-tip="Set scene lightness">
                <div>Lightness:</div>
                <input id="options3dLightnessRange" type="range" min={0} max={100} />
                <input id="options3dLightnessNumber" type="number" min={0} max={500} style={{ width: "4em" }} />
              </div>
              <div data-tip="Set mesh texture resolution">
                <div>Texture resolution:</div>
                <select id="options3dMeshSkinResolution" style={{ width: "10em" }}>
                  <option value={512}>512x512px</option>
                  <option value={1024}>1024x1024px</option>
                  <option value={2048}>2048x2048px</option>
                  <option value={4096}>4096x4096px</option>
                  <option value={8192}>8192x8192px</option>
                </select>
              </div>
              <div data-tip="Quick preset lighting for different times of day" style={{ marginTop: "0.4em" }}>
                <label>Time of day:</label>
                <select id="options3dTimeOfDay" style={{ width: "10em", marginBottom: "0.3em" }} defaultValue="noon">
                  <option value="custom">Custom</option>
                  <option value="dawn">Dawn</option>
                  <option value="noon">Noon</option>
                  <option value="evening">Evening</option>
                  <option value="night">Night</option>
                </select>
              </div>
              <div data-tip="Set sun position (x, y) and color" style={{ marginTop: "0.4em" }}>
                <label>Sun position and color:</label>
                <div style={{ display: "flex", gap: "0.2em" }}>
                  <input
                    id="options3dSunX"
                    type="number"
                    min={-2500}
                    max={2500}
                    step={100}
                    style={{ width: "4.7em" }}
                  />
                  <input id="options3dSunY" type="number" min={0} max={5000} step={100} style={{ width: "4.7em" }} />
                  <input id="options3dSunColor" type="color" style={{ padding: 0, height: "1.5em", border: "none" }} />
                </div>
              </div>
              <div data-tip="Toggle 3d labels" style={{ margin: "0.6em 0 0.3em -0.2em" }}>
                <input id="options3dMeshLabels3d" className="checkbox" type="checkbox" />
                <label htmlFor="options3dMeshLabels3d" className="checkbox-label">
                  <i>Show 3D labels</i>
                </label>
              </div>
              <div data-tip="Toggle sky mode" style={{ margin: "0.6em 0 0.3em -0.2em" }}>
                <input id="options3dMeshSkyMode" className="checkbox" type="checkbox" />
                <label htmlFor="options3dMeshSkyMode" className="checkbox-label">
                  <i>Show sky and extend water</i>
                </label>
              </div>
              <div
                data-tip="Increases the polygon count to smooth the sharp points. Please note that it can take some time to calculate"
                style={{ margin: "0.6em 0 0.3em -0.2em" }}
              >
                <input id="options3dSubdivide" className="checkbox" type="checkbox" />
                <label htmlFor="options3dSubdivide" className="checkbox-label">
                  <i>
                    Smooth geometry <small style={{ color: "darkred" }}>[slow]</small>
                  </i>
                </label>
              </div>
              <div data-tip="Toggle wireframe mode" style={{ margin: "0.6em 0 0.3em -0.2em" }}>
                <input id="options3dMeshWireframeMode" className="checkbox" type="checkbox" />
                <label htmlFor="options3dMeshWireframeMode" className="checkbox-label">
                  <i>Show wireframe</i>
                </label>
              </div>
              <div data-tip="Set sky and water color" id="options3dColorSection" style={{ display: "none" }}>
                <span>Sky:</span>
                <input
                  id="options3dMeshSky"
                  type="color"
                  style={{ width: "4.4em", height: "1em", border: 0, padding: 0, margin: "0 0.2em" }}
                />
                <span>Water:</span>
                <input
                  id="options3dMeshWater"
                  type="color"
                  style={{ width: "4.4em", height: "1em", border: 0, padding: 0, margin: "0 0.2em" }}
                />
              </div>
            </div>
            <div id="options3dGlobe" style={{ display: "none" }}>
              <div data-tip="Set globe rotation speed. Set to 0 is you want to toggle off the rotation">
                <div>Rotation:</div>
                <input id="options3dGlobeRotationRange" type="range" min={0} max={10} step=".1" />
                <input
                  id="options3dGlobeRotationNumber"
                  type="number"
                  min={0}
                  max={10}
                  step=".1"
                  style={{ width: "4em" }}
                />
              </div>
              <div data-tip="Set globe texture resolution">
                <div>Texture resolution:</div>
                <select id="options3dGlobeResolution" style={{ width: "5em" }}>
                  <option value="0.5">0.5x</option>
                  <option value={1}>1x</option>
                  <option value={2}>2x</option>
                  <option value={4}>4x</option>
                  <option value={8}>8x</option>
                </select>
              </div>
              <div
                data-tip="Equirectangular projection is used: distortion is maximum on poles. Use map with aspect ratio 2:1 for best result"
                style={{ fontStyle: "italic", margin: "0.2em 0" }}
              >
                Equirectangular projection is used
              </div>
            </div>
            <div id="options3dBottom" style={{ marginTop: "0.2em" }}>
              <button type="button" id="options3dUpdate" data-tip="Update the scene" className="icon-cw" />
              <button
                type="button"
                data-tip="Configure world and map size and climate settings"
                className="icon-globe"
              />
              <button
                type="button"
                id="options3dSave"
                data-tip="Save screenshot of the 3d scene"
                className="icon-button-screenshot"
              />
              <button
                type="button"
                id="options3dOBJSave"
                data-tip="Save OBJ file of the 3d scene"
                className="icon-download"
              />
            </div>
          </div>
          <div id="preview3d" className="dialog stable" style={{ display: "none", padding: 0 }} />
        </div>
      </div>
    </Dialog>
  );
};
