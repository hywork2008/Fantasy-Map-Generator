import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { callWindowFn } from "../../utils/windowGlobals";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const BurgEditorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("burgEditor"));

  return (
    <Dialog isOpen={isOpen} title="Burg Editor" onClose={() => closeDialog("burgEditor")}>
      <div id="burgBody" style={{ paddingBottom: "0.3em" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <svg
            data-tip="Burg emblem. Click to edit"
            className="pointer"
            viewBox="0 0 200 200"
            width="13em"
            height="13em"
            aria-hidden="true"
          >
            <use id="burgEmblem"></use>
          </svg>
          <div style={{ display: "grid", gridAutoRows: "minmax(1.6em, auto)" }}>
            <div id="burgProvinceAndState" style={{ fontWeight: "bold", maxWidth: "16em" }}></div>

            <div>
              <div className="label">Name:</div>
              <input
                id="burgName"
                data-tip="Type to rename the burg"
                autoCorrect="off"
                spellCheck="false"
                style={{ width: "9em" }}
              />
              <span data-tip="Speak the name. You can change voice and language in options" className="speaker">
                🔊
              </span>
              <span
                id="burgNameReRandom"
                data-tip="Generate random name for the burg"
                className="icon-globe pointer"
              ></span>
            </div>

            <div data-tip="Select burg group. Groups defines burg icon, label size and style">
              <div className="label">Group:</div>
              <select id="burgGroup" style={{ width: "9em" }}></select>
              <span id="burgGroupConfigure" data-tip="Configure burg groups" className="icon-cog pointer"></span>
            </div>

            <div data-tip="Select burg type. Type slightly affects emblem generation">
              <div className="label">Type:</div>
              <select id="burgType" style={{ width: "9em" }}>
                <option value="Generic">Generic</option>
                <option value="River">River</option>
                <option value="Lake">Lake</option>
                <option value="Naval">Naval</option>
                <option value="Nomadic">Nomadic</option>
                <option value="Hunting">Hunting</option>
                <option value="Highland">Highland</option>
              </select>
            </div>

            <div data-tip="Select dominant culture">
              <div className="label">Culture:</div>
              <select id="burgCulture" style={{ width: "9em" }}></select>
              <span
                id="burgNameReCulture"
                data-tip="Generate culture-specific name for the burg"
                className="icon-book pointer"
              ></span>
            </div>

            <div data-tip="Set burg population">
              <div className="label">Population:</div>
              <input id="burgPopulation" type="number" min="0" step="1" style={{ width: "9em" }} />
            </div>

            <div
              data-tip="Burg average yearly temperature"
              style={{ display: "flex", justifyContent: "space-between" }}
            >
              <div>
                <div className="label">Temperature:</div>
                <span id="burgTemperature"></span>
              </div>
              <div style={{ display: "flex", gap: "0.5em" }}>
                <i className="icon-info-circled" id="burgTemperatureLikeIn"></i>
                <i
                  id="burgTemperatureGraph"
                  data-tip="Show temperature graph for the burg"
                  className="icon-chart-area pointer"
                ></i>
              </div>
            </div>

            <div data-tip="Burg height above mean sea level">
              <div className="label">Elevation:</div>
              <span id="burgElevation"></span> above sea level
            </div>

            <div>
              <div className="label">Features:</div>
              <span
                id="burgCapital"
                data-tip="Shows whether the burg is a state capital. Click to toggle"
                data-feature="capital"
                className="burgFeature icon-star"
              ></span>
              <span
                id="burgPort"
                data-tip="Shows whether the burg is a port. Click to toggle"
                data-feature="port"
                className="burgFeature icon-anchor"
              ></span>
              <span
                id="burgCitadel"
                data-tip="Shows whether the burg has a citadel (castle). Click to toggle"
                data-feature="citadel"
                className="burgFeature icon-chess-rook"
                style={{ fontSize: "1.1em" }}
              ></span>
              <span
                id="burgWalls"
                data-tip="Shows whether the burg is walled. Click to toggle"
                data-feature="walls"
                className="burgFeature icon-fort-awesome"
              ></span>
              <span
                id="burgPlaza"
                data-tip="Shows whether the burg is a trade center (has big marketplace). Click to toggle"
                data-feature="plaza"
                className="burgFeature icon-store"
                style={{ fontSize: "1em" }}
              ></span>
              <span
                id="burgTemple"
                data-tip="Shows whether the burg is a religious center. Click to toggle"
                data-feature="temple"
                className="burgFeature icon-chess-bishop"
                style={{ fontSize: "1.1em", marginLeft: "3px" }}
              ></span>
              <span
                id="burgShanty"
                data-tip="Shows whether the burg has a shanty town. Click to toggle"
                data-feature="shanty"
                className="burgFeature icon-campground"
                style={{ fontSize: "1em" }}
              ></span>
            </div>
          </div>
        </div>

        <div id="burgPreviewSection" data-tip="Burg map preview" style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Burg preview:</span>
            <div style={{ display: "flex", gap: "0.5em" }}>
              <i id="burgLinkOpen" data-tip="Open burg map in a new tab" className="icon-link-ext pointer"></i>
            </div>
          </div>
          <div id="burgPreviewObject" style={{ pointerEvents: "none" }}></div>
        </div>
      </div>

      <div id="burgBottom">
        <button type="button" id="burgStyleShow" data-tip="Show style edit section" className="icon-brush"></button>
        <div id="burgStyleSection" style={{ display: "none" }}>
          <button type="button" id="burgStyleHide" data-tip="Hide style edit section" className="icon-brush"></button>
          <button
            type="button"
            id="burgEditLabelStyle"
            data-tip="Edit label style for burg group in Style Editor"
            className="icon-font"
          ></button>
          <button
            type="button"
            id="burgEditIconStyle"
            data-tip="Edit icon style for burg group in Style Editor"
            className="icon-dot-circled"
          ></button>
          <button
            type="button"
            id="burgEditAnchorStyle"
            data-tip="Edit port icon (anchor) style for burg group in Style Editor"
            className="icon-anchor"
          ></button>
        </div>

        <button type="button" id="burgEditEmblem" data-tip="Edit emblem" className="icon-shield-alt"></button>
        <button
          type="button"
          id="burgSetPreviewLink"
          data-tip="Set custom burg map URL"
          className="icon-map-o"
        ></button>
        <button
          type="button"
          id="burgLocate"
          data-tip="Zoom map and center view in the burg"
          className="icon-target"
        ></button>
        <button
          type="button"
          id="burgRelocate"
          data-tip="Relocate burg. Click on map to move the burg"
          className="icon-map-pin"
        ></button>
        <button
          type="button"
          id="burglLegend"
          data-tip="Edit free text notes (legend) for this burg"
          className="icon-edit"
        ></button>
        <button
          type="button"
          id="burgLock"
          className="icon-lock-open"
          onMouseOver={e => callWindowFn("showElementLockTip", e)}
        ></button>
        <button
          type="button"
          id="burgRemove"
          data-tip="Remove non-capital burg"
          data-shortcut="Delete"
          className="icon-trash fastDelete"
        ></button>
      </div>
    </Dialog>
  );
};
