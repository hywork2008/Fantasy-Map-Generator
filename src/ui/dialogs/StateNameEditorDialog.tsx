import type React from "react";
import { useCallback } from "react";
import { statesEditorActions } from "../../controllers/states-editor";
import { useStatesEditorState } from "../../store/statesEditorState";
import { IconButton } from "../components/IconButton";
import { Dialog } from "./Dialog";

export const StateNameEditorDialog: React.FC = () => {
  const nameEditor = useStatesEditorState(state => state.nameEditor);

  const handleAddFormClick = useCallback(() => {
    if (!nameEditor) return;
    if (nameEditor.isCustomFormMode && nameEditor.customFormInput) {
      statesEditorActions.nameEditorUpdate({
        formName: nameEditor.customFormInput,
        isCustomFormMode: false,
        customFormInput: ""
      });
    } else {
      statesEditorActions.nameEditorUpdate({
        isCustomFormMode: !nameEditor.isCustomFormMode,
        customFormInput: ""
      });
    }
  }, [nameEditor]);

  if (!nameEditor) return null;

  const { shortName, formName, fullName, isCustomFormMode, customFormInput, updateLabel } = nameEditor;

  return (
    <Dialog
      isOpen={true}
      title="Change state name"
      onClose={statesEditorActions.nameEditorClose}
      buttons={[
        { label: "Apply", onClick: statesEditorActions.nameEditorApply },
        { label: "Cancel", onClick: statesEditorActions.nameEditorClose }
      ]}
    >
      <div id="stateNameEditorContainer">
        <table>
          <tbody>
            <tr>
              <th scope="row">
                <label htmlFor="stateShortNameInput" data-tip="State short name">
                  Short name:
                </label>
              </th>
              <td>
                <input
                  id="stateShortNameInput"
                  data-tip="Type to change the short name"
                  autoCorrect="off"
                  spellCheck={false}
                  value={shortName}
                  onChange={e => statesEditorActions.nameEditorUpdate({ shortName: e.target.value })}
                />
                <span data-tip="Speak the name. You can change voice and language in options" className="speaker">
                  🔊
                </span>
                <IconButton
                  data-tip="Generate culture-specific name"
                  className="icon-book pointer"
                  onClick={statesEditorActions.nameEditorGenerateShortCulture}
                />
                <IconButton
                  data-tip="Generate random name"
                  className="icon-globe pointer"
                  onClick={statesEditorActions.nameEditorGenerateShortRandom}
                />
              </td>
            </tr>

            <tr data-tip="Select form name">
              <th scope="row">
                <label htmlFor="stateFormNameInput" data-tip="State form name">
                  Form name:
                </label>
              </th>
              <td>
                {isCustomFormMode ? (
                  <input
                    id="stateFormNameInput"
                    placeholder="type form name"
                    data-tip="Enter custom form name"
                    value={customFormInput}
                    onChange={e => statesEditorActions.nameEditorUpdate({ customFormInput: e.target.value })}
                  />
                ) : (
                  <select
                    id="stateFormNameInput"
                    value={formName}
                    onChange={e => statesEditorActions.nameEditorUpdate({ formName: e.target.value })}
                  >
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
                )}
                <IconButton
                  data-tip="Click to add custom state form name to the list"
                  className="icon-plus pointer"
                  onClick={handleAddFormClick}
                />
              </td>
            </tr>

            <tr>
              <th scope="row">
                <label htmlFor="stateFullNameInput" data-tip="State full name">
                  Full name:
                </label>
              </th>
              <td>
                <input
                  id="stateFullNameInput"
                  data-tip="Type to change the full name"
                  autoCorrect="off"
                  spellCheck={false}
                  value={fullName}
                  onChange={e => statesEditorActions.nameEditorUpdate({ fullName: e.target.value })}
                />
                <span data-tip="Speak the name. You can change voice and language in options" className="speaker">
                  🔊
                </span>
                <IconButton
                  data-tip="Click to re-generate full name"
                  className="icon-arrows-cw pointer"
                  onClick={statesEditorActions.nameEditorRegenerateFullName}
                />
              </td>
            </tr>

            <tr data-tip="Uncheck to not update state label on name change">
              <td colSpan={2}>
                <input
                  id="stateNameEditorUpdateLabel"
                  className="checkbox"
                  type="checkbox"
                  checked={updateLabel}
                  onChange={e => statesEditorActions.nameEditorUpdate({ updateLabel: e.target.checked })}
                />
                <label htmlFor="stateNameEditorUpdateLabel" className="checkbox-label">
                  <i>Update label on Apply</i>
                </label>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Dialog>
  );
};
