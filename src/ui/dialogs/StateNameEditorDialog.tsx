import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const StateNameEditorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("stateNameEditor"));

  return (
    <Dialog isOpen={isOpen} title="State Name Editor" onClose={() => closeDialog("stateNameEditor")}>
      <div data-state="0" id="stateNameEditorContainer">
        <div>
          <div data-tip="State short name" className="label">
            Short name:
          </div>
          <input
            id="stateNameEditorShort"
            data-tip="Type to change the short name"
            autoCorrect="off"
            spellCheck="false"
            style={{ width: "11em" }}
          />
          <span data-tip="Speak the name. You can change voice and language in options" className="speaker">
            🔊
          </span>
          <span
            id="stateNameEditorShortCulture"
            data-tip="Generate culture-specific name"
            className="icon-book pointer"
          ></span>
          <span id="stateNameEditorShortRandom" data-tip="Generate random name" className="icon-globe pointer"></span>
        </div>

        <div data-tip="Select form name">
          <div data-tip="State form name" className="label">
            Form name:
          </div>
          <select id="stateNameEditorSelectForm" style={{ width: "11em" }}>
            <option value="">blank</option>
            <optgroup label="Monarchy">
              <option value="Beylik">Beylik</option>
              <option value="Despotate">Despotate</option>
              <option value="Dominion">Dominion</option>
              <option value="Duchy">Duchy</option>
              <option value="Emirate">Emirate</option>
              <option value="Empire">Empire</option>
              <option value="Horde">Horde</option>
              <option value="Grand Duchy">Grand Duchy</option>
              <option value="Heptarchy">Heptarchy</option>
              <option value="Khaganate">Khaganate</option>
              <option value="Khanate">Khanate</option>
              <option value="Kingdom">Kingdom</option>
              <option value="Marches">Marches</option>
              <option value="Principality">Principality</option>
              <option value="Satrapy">Satrapy</option>
              <option value="Shogunate">Shogunate</option>
              <option value="Sultanate">Sultanate</option>
              <option value="Tsardom">Tsardom</option>
              <option value="Ulus">Ulus</option>
              <option value="Viceroyalty">Viceroyalty</option>
            </optgroup>
            <optgroup label="Republic">
              <option value="Chancellery">Chancellery</option>
              <option value="City-state">City-state</option>
              <option value="Diarchy">Diarchy</option>
              <option value="Federation">Federation</option>
              <option value="Free City">Free City</option>
              <option value="Most Serene Republic">Most Serene Republic</option>
              <option value="Oligarchy">Oligarchy</option>
              <option value="Protectorate">Protectorate</option>
              <option value="Republic">Republic</option>
              <option value="Tetrarchy">Tetrarchy</option>
              <option value="Trade Company">Trade Company</option>
              <option value="Triumvirate">Triumvirate</option>
            </optgroup>
            <optgroup label="Union">
              <option value="Confederacy">Confederacy</option>
              <option value="Confederation">Confederation</option>
              <option value="Conglomerate">Conglomerate</option>
              <option value="Commonwealth">Commonwealth</option>
              <option value="League">League</option>
              <option value="Union">Union</option>
              <option value="United Hordes">United Hordes</option>
              <option value="United Kingdom">United Kingdom</option>
              <option value="United Provinces">United Provinces</option>
              <option value="United Republic">United Republic</option>
              <option value="United States">United States</option>
              <option value="United Tribes">United Tribes</option>
            </optgroup>
            <optgroup label="Theocracy">
              <option value="Bishopric">Bishopric</option>
              <option value="Brotherhood">Brotherhood</option>
              <option value="Caliphate">Caliphate</option>
              <option value="Diocese">Diocese</option>
              <option value="Divine Duchy">Divine Duchy</option>
              <option value="Divine Grand Duchy">Divine Grand Duchy</option>
              <option value="Divine Principality">Divine Principality</option>
              <option value="Divine Kingdom">Divine Kingdom</option>
              <option value="Divine Empire">Divine Empire</option>
              <option value="Eparchy">Eparchy</option>
              <option value="Exarchate">Exarchate</option>
              <option value="Holy State">Holy State</option>
              <option value="Imamah">Imamah</option>
              <option value="Patriarchate">Patriarchate</option>
              <option value="Theocracy">Theocracy</option>
            </optgroup>
            <optgroup label="Anarchy">
              <option value="Commune">Commune</option>
              <option value="Community">Community</option>
              <option value="Council">Council</option>
              <option value="Free Territory">Free Territory</option>
              <option value="Tribes">Tribes</option>
            </optgroup>
          </select>
          <input
            id="stateNameEditorCustomForm"
            placeholder="type form name"
            data-tip="Enter custom form name"
            style={{ display: "none", width: "11em" }}
          />
          <span
            id="stateNameEditorAddForm"
            data-tip="Click to add custom state form name to the list"
            className="icon-plus pointer"
          ></span>
        </div>

        <div>
          <div data-tip="State full name" className="label">
            Full name:
          </div>
          <input
            id="stateNameEditorFull"
            data-tip="Type to change the full name"
            autoCorrect="off"
            spellCheck="false"
            style={{ width: "11em" }}
          />
          <span data-tip="Speak the name. You can change voice and language in options" className="speaker">
            🔊
          </span>
          <span
            id="stateNameEditorFullRegenerate"
            data-tip="Click to re-generate full name"
            data-tick="0"
            className="icon-arrows-cw pointer"
          ></span>
        </div>

        <div data-tip="Uncheck to not update state label on name change" style={{ paddingBlock: "0.2em" }}>
          <input id="stateNameEditorUpdateLabel" className="checkbox" type="checkbox" defaultChecked />
          <label htmlFor="stateNameEditorUpdateLabel" className="checkbox-label">
            <i>Update label on Apply</i>
          </label>
        </div>
      </div>
    </Dialog>
  );
};
