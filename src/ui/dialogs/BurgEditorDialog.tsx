import type React from "react";
import { burgEditorActions } from "../../controllers/burg-editor";
import { showElementLockTip } from "../../services/tooltipService";
import { useBurgEditorState } from "../../store/burgEditorState";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const BurgEditorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("burgEditor"));
  const burgData = useBurgEditorState(state => state.burgData);
  const groups = useBurgEditorState(state => state.groups);
  const cultures = useBurgEditorState(state => state.cultures);
  const isStyleSectionOpen = useBurgEditorState(state => state.isStyleSectionOpen);
  const isRelocateMode = useBurgEditorState(state => state.isRelocateMode);

  if (!isOpen || !burgData) return null;

  return (
    <Dialog isOpen={isOpen} title="Edit Burg" onClose={() => closeDialog("burgEditor")}>
      <div id="burgBody">
        <div className="d-flex">
          <svg
            data-tip="Burg emblem. Click to edit"
            className="pointer"
            viewBox="0 0 200 200"
            width="13em"
            height="13em"
            aria-hidden="true"
            onClick={() => burgEditorActions.openEmblemEdit()}
          >
            <use id="burgEmblem" href={`#${burgData.emblemId}`}></use>
          </svg>
          <table>
            <tbody>
              <tr>
                <td colSpan={2} id="burgProvinceAndState">
                  {burgData.provinceAndState}
                </td>
              </tr>
              <tr data-tip="Type to rename the burg">
                <th scope="row">
                  <label htmlFor="burgName">Name:</label>
                </th>
                <td>
                  <input
                    id="burgName"
                    autoCorrect="off"
                    spellCheck="false"
                    value={burgData.name}
                    onChange={e => burgEditorActions.changeName(e.target.value)}
                  />
                  <span data-tip="Speak the name. You can change voice and language in options" className="speaker">
                    🔊
                  </span>
                  <span
                    id="burgNameReRandom"
                    data-tip="Generate random name for the burg"
                    className="icon-globe pointer"
                    onClick={() => burgEditorActions.generateNameRandom()}
                  ></span>
                </td>
              </tr>
              <tr data-tip="Select burg group. Groups defines burg icon, label size and style">
                <th scope="row">Group:</th>
                <td>
                  <select
                    id="burgGroup"
                    value={burgData.group}
                    onChange={e => burgEditorActions.changeGroup(e.target.value)}
                  >
                    {groups.map(g => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                  <span
                    id="burgGroupConfigure"
                    data-tip="Configure burg groups"
                    className="icon-cog pointer"
                    onClick={() => burgEditorActions.editBurgGroups()}
                  ></span>
                </td>
              </tr>
              <tr data-tip="Select burg type. Type slightly affects emblem generation">
                <th scope="row">Type:</th>
                <td>
                  <select
                    id="burgType"
                    value={burgData.type}
                    onChange={e => burgEditorActions.changeType(e.target.value)}
                  >
                    <option value="Generic">Generic</option>
                    <option value="River">River</option>
                    <option value="Lake">Lake</option>
                    <option value="Naval">Naval</option>
                    <option value="Nomadic">Nomadic</option>
                    <option value="Hunting">Hunting</option>
                    <option value="Highland">Highland</option>
                  </select>
                </td>
              </tr>
              <tr data-tip="Select dominant culture">
                <th scope="row">Culture:</th>
                <td>
                  <select
                    id="burgCulture"
                    value={burgData.culture}
                    onChange={e => burgEditorActions.changeCulture(Number(e.target.value))}
                  >
                    {cultures.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <span
                    id="burgNameReCulture"
                    data-tip="Generate culture-specific name for the burg"
                    className="icon-book pointer"
                    onClick={() => burgEditorActions.generateNameCulture()}
                  ></span>
                </td>
              </tr>
              <tr data-tip="Set burg population">
                <th scope="row">
                  <label htmlFor="burgPopulation">Population:</label>
                </th>
                <td>
                  <input
                    id="burgPopulation"
                    type="number"
                    min="0"
                    step="1"
                    value={burgData.population}
                    onChange={e => burgEditorActions.changePopulation(e.target.value)}
                  />
                </td>
              </tr>
              <tr data-tip="Burg average yearly temperature">
                <th scope="row">Temperature:</th>
                <td className="d-flex">
                  <span id="burgTemperature">{burgData.temperature}</span>
                  <div className="d-flex">
                    <i
                      className="icon-info-circled"
                      id="burgTemperatureLikeIn"
                      data-tip={burgData.temperatureLikeIn}
                    ></i>
                    <i
                      id="burgTemperatureGraph"
                      data-tip="Show temperature graph for the burg"
                      className="icon-chart-area pointer"
                      onClick={() => burgEditorActions.showTemperatureGraph()}
                    ></i>
                  </div>
                </td>
              </tr>
              <tr data-tip="Burg height above mean sea level">
                <th scope="row">Elevation:</th>
                <td>
                  <span id="burgElevation">{burgData.elevation}</span> above sea level
                </td>
              </tr>
              <tr data-tip="Burg average daily production">
                <th scope="row">Production:</th>
                <td>
                  <span id="burgProduction" className="d-inline-flex" />
                </td>
              </tr>
              <tr data-tip="Wealth is gross product per population point for the current production run. It is a per-capita productivity measure, not the burg's cumulative treasury.">
                <th scope="row">Wealth</th>
                <td>
                  <span id="burgWealth" />
                </td>
              </tr>
              <tr data-tip="Treasury is the burg's cumulative cash balance after all production, purchases, and sales.">
                <th scope="row">Treasury</th>
                <td>
                  <span id="burgTreasury" />
                </td>
              </tr>
              <tr>
                <th scope="row">Features:</th>
                <td>
                  <span
                    id="burgCapital"
                    data-tip="Shows whether the burg is a state capital. Click to toggle"
                    className={`burgFeature icon-star pointer ${!burgData.capital ? "inactive" : ""}`}
                    onClick={() => burgEditorActions.toggleFeature("capital")}
                  ></span>
                  <span
                    id="burgPort"
                    data-tip="Shows whether the burg is a port. Click to toggle"
                    className={`burgFeature icon-anchor pointer ${!burgData.port ? "inactive" : ""}`}
                    onClick={() => burgEditorActions.toggleFeature("port")}
                  ></span>
                  <span
                    id="burgCitadel"
                    data-tip="Shows whether the burg has a citadel (castle). Click to toggle"
                    className={`burgFeature icon-chess-rook pointer ${!burgData.citadel ? "inactive" : ""}`}
                    onClick={() => burgEditorActions.toggleFeature("citadel")}
                  ></span>
                  <span
                    id="burgWalls"
                    data-tip="Shows whether the burg is walled. Click to toggle"
                    className={`burgFeature icon-fort-awesome pointer ${!burgData.walls ? "inactive" : ""}`}
                    onClick={() => burgEditorActions.toggleFeature("walls")}
                  ></span>
                  <span
                    id="burgPlaza"
                    data-tip="Shows whether the burg is a trade center (has big marketplace). Click to toggle"
                    className={`burgFeature icon-store pointer ${!burgData.plaza ? "inactive" : ""}`}
                    onClick={() => burgEditorActions.toggleFeature("plaza")}
                  ></span>
                  <span
                    id="burgTemple"
                    data-tip="Shows whether the burg is a religious center. Click to toggle"
                    className={`burgFeature icon-chess-bishop pointer ${!burgData.temple ? "inactive" : ""}`}
                    onClick={() => burgEditorActions.toggleFeature("temple")}
                  ></span>
                  <span
                    id="burgShanty"
                    data-tip="Shows whether the burg has a shanty town. Click to toggle"
                    className={`burgFeature icon-campground pointer ${!burgData.shanty ? "inactive" : ""}`}
                    onClick={() => burgEditorActions.toggleFeature("shanty")}
                  ></span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {burgData.previewUrl && (
          <div id="burgPreviewSection" data-tip="Burg map preview" className="d-flex">
            <div className="d-flex">
              <span>Burg preview:</span>
              <div className="d-flex">
                <i
                  id="burgLinkOpen"
                  data-tip="Open burg map in a new tab"
                  className="icon-link-ext pointer"
                  onClick={() => burgEditorActions.openBurgLink()}
                ></i>
              </div>
            </div>
            <div id="burgPreviewObject" className="-burg-editor-dialog__pointer-events-none">
              <object data={burgData.previewUrl} aria-label="Burg Map Preview" />
            </div>
          </div>
        )}
      </div>

      <div id="burgFooter">
        {isStyleSectionOpen ? (
          <div id="burgStyleSection" className="d-inline-block">
            <button
              type="button"
              id="burgStyleHide"
              data-tip="Hide style edit section"
              className="icon-brush"
              onClick={() => burgEditorActions.hideStyleSection()}
            ></button>
            <button
              type="button"
              id="burgEditLabelStyle"
              data-tip="Edit label style for burg group in Style Editor"
              className="icon-font"
              onClick={() => burgEditorActions.editGroupLabelStyle()}
            ></button>
            <button
              type="button"
              id="burgEditIconStyle"
              data-tip="Edit icon style for burg group in Style Editor"
              className="icon-dot-circled"
              onClick={() => burgEditorActions.editGroupIconStyle()}
            ></button>
            {burgData.port && (
              <button
                type="button"
                id="burgEditAnchorStyle"
                data-tip="Edit port icon (anchor) style for burg group in Style Editor"
                className="icon-anchor"
                onClick={() => burgEditorActions.editGroupAnchorStyle()}
              ></button>
            )}
          </div>
        ) : (
          <>
            <button
              type="button"
              id="burgStyleShow"
              data-tip="Show style edit section"
              className="icon-brush"
              onClick={() => burgEditorActions.showStyleSection()}
            ></button>

            <button
              type="button"
              id="burgEditEmblem"
              data-tip="Edit emblem"
              className="icon-shield-alt"
              onClick={() => burgEditorActions.openEmblemEdit()}
            ></button>
            <button
              type="button"
              id="burgSetPreviewLink"
              data-tip="Set custom burg map URL"
              className="icon-map-o"
              onClick={() => burgEditorActions.setCustomPreview()}
            ></button>
            <button
              type="button"
              id="burgLocate"
              data-tip="Zoom map and center view in the burg"
              className="icon-target"
              onClick={() => burgEditorActions.zoomIntoBurg()}
            ></button>
            <button
              type="button"
              id="burgProductionOverview"
              data-tip="Show production overview for this burg"
              className="icon-chart-bar"
              onClick={() =>
                document.dispatchEvent(
                  new CustomEvent("react-tool-action", { detail: { action: "burgProductionOverview" } })
                )
              }
            ></button>
            <button
              type="button"
              id="burgRelocate"
              data-tip="Relocate burg. Click on map to move the burg"
              className={`icon-map-pin ${isRelocateMode ? "pressed" : ""}`}
              onClick={() => burgEditorActions.toggleRelocateBurg()}
            ></button>
            <button
              type="button"
              id="burglLegend"
              data-tip="Edit free text notes (legend) for this burg"
              className="icon-edit"
              onClick={() => burgEditorActions.editBurgLegend()}
            ></button>
            <button
              type="button"
              id="burgLock"
              className={burgData.lock ? "icon-lock" : "icon-lock-open"}
              onMouseOver={e => showElementLockTip(e.nativeEvent)}
              onClick={() => burgEditorActions.toggleBurgLockButton()}
            ></button>
            <button
              type="button"
              id="burgRemove"
              data-tip="Remove non-capital burg"
              data-shortcut="Delete"
              className="icon-trash fastDelete"
              onClick={() => burgEditorActions.removeSelectedBurg()}
            ></button>
          </>
        )}
      </div>
    </Dialog>
  );
};
