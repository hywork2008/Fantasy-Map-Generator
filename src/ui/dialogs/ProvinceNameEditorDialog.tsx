import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const ProvinceNameEditorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("provinceNameEditor"));

  return (
    <Dialog isOpen={isOpen} title="Province Name Editor" onClose={() => closeDialog("provinceNameEditor")}>
      <div data-province="0" id="provinceNameEditorContainer">
        <div>
          <div data-tip="Province short name" className="label">
            Short name:
          </div>
          <input
            id="provinceNameEditorShort"
            data-tip="Type to change the short name"
            autoCorrect="off"
            spellCheck="false"
            style={{ width: "11em" }}
          />
          <span data-tip="Speak the name. You can change voice and language in options" className="speaker">
            🔊
          </span>
          <span
            id="provinceNameEditorShortCulture"
            data-tip="Generate culture-specific name for the province"
            className="icon-book pointer"
          ></span>
          <span
            id="provinceNameEditorShortRandom"
            data-tip="Generate random name"
            className="icon-globe pointer"
          ></span>
        </div>

        <div data-tip="Select form name">
          <div data-tip="Province form name" className="label">
            Form name:
          </div>
          <select
            id="provinceNameEditorSelectForm"
            style={{ display: "inline-block", width: "11em", height: "1.645em" }}
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
          <input
            id="provinceNameEditorCustomForm"
            placeholder="type form name"
            data-tip="Create custom province form name"
            style={{ display: "none", width: "11em" }}
          />
          <span
            id="provinceNameEditorAddForm"
            data-tip="Click to add custom province form name to the list"
            className="icon-plus pointer"
          ></span>
        </div>

        <div>
          <div data-tip="Province full name" className="label">
            Full name:
          </div>
          <input
            id="provinceNameEditorFull"
            data-tip="Type to change the full name"
            autoCorrect="off"
            spellCheck="false"
            style={{ width: "11em" }}
          />
          <span data-tip="Speak the name. You can change voice and language in options" className="speaker">
            🔊
          </span>
          <span
            id="provinceNameEditorFullRegenerate"
            data-tip="Click to re-generate full name"
            className="icon-arrows-cw pointer"
          ></span>
        </div>

        <div
          id="provinceCultureName"
          data-tip="Dominant culture in the province. This defines culture-based naming. Can be changed via the Cultures Editor"
          style={{ marginTop: "0.2em" }}
        >
          Dominant culture:&nbsp;<span id="provinceCultureDisplay"></span>
        </div>
      </div>
    </Dialog>
  );
};
