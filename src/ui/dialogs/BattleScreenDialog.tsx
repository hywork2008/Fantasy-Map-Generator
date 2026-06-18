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
          <div id="battleFooter">
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
        </div>
      </div>
    </Dialog>
  );
};
