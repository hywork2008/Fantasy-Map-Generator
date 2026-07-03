import type React from "react";
import { provincesEditorActions } from "../../controllers/provinces-editor";
import { useProvincesEditorState } from "../../store/provincesEditorState";
import { Dialog } from "./Dialog";

export const ProvinceNameEditorDialog: React.FC = () => {
  const nameEditor = useProvincesEditorState(state => state.nameEditor);

  if (!nameEditor) return null;

  const { shortName, formName, fullName, isCustomFormMode, customFormInput, cultureName } = nameEditor;

  return (
    <Dialog
      isOpen={true}
      title="Province Name Editor"
      onClose={provincesEditorActions.nameEditorClose}
      buttons={[
        { label: "Apply", onClick: provincesEditorActions.nameEditorApply },
        { label: "Cancel", onClick: provincesEditorActions.nameEditorClose }
      ]}
    >
      <div id="provinceNameEditorContainer">
        <div>
          <div data-tip="Province short name" className="label">
            Short name:
          </div>
          <input
            data-tip="Type to change the short name"
            autoCorrect="off"
            spellCheck={false}
            value={shortName}
            onChange={e => provincesEditorActions.nameEditorUpdate({ shortName: e.target.value })}
          />
          <span data-tip="Speak the name. You can change voice and language in options" className="speaker">
            🔊
          </span>
          <span
            data-tip="Generate culture-specific name for the province"
            className="icon-book pointer"
            onClick={provincesEditorActions.nameEditorGenerateShortCulture}
          />
          <span
            data-tip="Generate random name"
            className="icon-globe pointer"
            onClick={provincesEditorActions.nameEditorGenerateShortRandom}
          />
        </div>

        <div data-tip="Select form name">
          <div data-tip="Province form name" className="label">
            Form name:
          </div>
          {isCustomFormMode ? (
            <input
              placeholder="type form name"
              data-tip="Enter custom form name"
              value={customFormInput}
              onChange={e => provincesEditorActions.nameEditorUpdate({ customFormInput: e.target.value })}
            />
          ) : (
            <select
              className="d-inline-block"
              value={formName}
              onChange={e => provincesEditorActions.nameEditorUpdate({ formName: e.target.value })}
            >
              <option value="">blank</option>
              <option value="Area">Area</option>
              <option value="Autonomy">Autonomy</option>
              <option value="Barony">Barony</option>
              <option value="Canton">Canton</option>
              <option value="Captaincy">Captaincy</option>
              <option value="Chiefdom">Chiefdom</option>
              <option value="Clan">Clan</option>
              <option value="Colony">Colony</option>
              <option value="Council">Council</option>
              <option value="County">County</option>
              <option value="Deanery">Deanery</option>
              <option value="Department">Department</option>
              <option value="Dependency">Dependency</option>
              <option value="Diaconate">Diaconate</option>
              <option value="District">District</option>
              <option value="Earldom">Earldom</option>
              <option value="Governorate">Governorate</option>
              <option value="Island">Island</option>
              <option value="Islands">Islands</option>
              <option value="Land">Land</option>
              <option value="Landgrave">Landgrave</option>
              <option value="Mandate">Mandate</option>
              <option value="Margrave">Margrave</option>
              <option value="Municipality">Municipality</option>
              <option value="Occupation zone">Occupation zone</option>
              <option value="Parish">Parish</option>
              <option value="Prefecture">Prefecture</option>
              <option value="Province">Province</option>
              <option value="Region">Region</option>
              <option value="Republic">Republic</option>
              <option value="Reservation">Reservation</option>
              <option value="Seneschalty">Seneschalty</option>
              <option value="Shire">Shire</option>
              <option value="State">State</option>
              <option value="Territory">Territory</option>
              <option value="Tribe">Tribe</option>
            </select>
          )}
          <span
            data-tip="Click to add custom province form name to the list"
            className="icon-plus pointer"
            onClick={() => {
              if (isCustomFormMode) {
                if (customFormInput) provincesEditorActions.nameEditorUpdate({ formName: customFormInput });
                provincesEditorActions.nameEditorUpdate({ isCustomFormMode: false });
              } else {
                provincesEditorActions.nameEditorUpdate({ isCustomFormMode: true });
              }
            }}
          />
        </div>

        <div>
          <div data-tip="Province full name" className="label">
            Full name:
          </div>
          <input
            data-tip="Type to change the full name"
            autoCorrect="off"
            spellCheck={false}
            value={fullName}
            onChange={e => provincesEditorActions.nameEditorUpdate({ fullName: e.target.value })}
          />
          <span data-tip="Speak the name. You can change voice and language in options" className="speaker">
            🔊
          </span>
          <span
            data-tip="Click to re-generate full name"
            className="icon-arrows-cw pointer"
            onClick={provincesEditorActions.nameEditorRegenerateFullName}
          />
        </div>

        <div data-tip="Dominant culture in the province. This defines culture-based naming. Can be changed via the Cultures Editor">
          Dominant culture:<span>{cultureName}</span>
        </div>
      </div>
    </Dialog>
  );
};
