import React, { useMemo } from "react";
import { religionsEditorActions } from "../../controllers/religions-editor";
import { useReligionsEditorState } from "../../store/religionsEditorState";
import { rn, si } from "../../utils";
import { getAreaUnit } from "../../utils/domUtils";
import { FillBox } from "../components/FillBox";
import { IconButton } from "../components/IconButton";
import { SortableHeader } from "../components/tables/SortableHeader";
import { VirtualTableBody } from "../components/VirtualTableBody";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const ReligionsEditorDialog: React.FC = () => {
  const {
    isOpen,
    sortBy,
    sortDirection,
    isPercentageMode,
    extinctVisible,
    customization,
    brushSize,
    protectExisting,
    autoChange,
    religions,
    totalOrganized,
    totalHeresies,
    totalCults,
    totalFolk,
    totalArea,
    totalPopulation
  } = useReligionsEditorState();

  const sortedReligions = useMemo(() => {
    return [...religions].sort((a, b) => {
      let valA: string | number = a.name;
      let valB: string | number = b.name;

      if (sortBy === "type") {
        valA = a.type;
        valB = b.type;
      } else if (sortBy === "form") {
        valA = a.form;
        valB = b.form;
      } else if (sortBy === "deity") {
        valA = a.deity;
        valB = b.deity;
      } else if (sortBy === "area") {
        valA = a.area;
        valB = b.area;
      } else if (sortBy === "population") {
        valA = a.population;
        valB = b.population;
      } else if (sortBy === "expansion") {
        valA = a.expansion;
        valB = b.expansion;
      } else if (sortBy === "expansionism") {
        valA = a.expansionism;
        valB = b.expansionism;
      }

      if (valA < valB) return -1 * sortDirection;
      if (valA > valB) return 1 * sortDirection;
      return 0;
    });
  }, [religions, sortBy, sortDirection]);

  const parentRef = React.useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const unit = getAreaUnit();
  const isBrushMode = customization === 7;
  const sortOrder = sortDirection === 1 ? "asc" : "desc";

  return (
    <Dialog
      isOpen={isOpen}
      title="Religions Editor"
      onClose={() => closeDialog("religionsEditor")}
      className="overflow-hidden"
    >
      <div id="religionsEditor">
        <div
          ref={parentRef}
          id="religionsBody"
          className="table"
          data-type={isPercentageMode ? "percentage" : "absolute"}
        >
          <table className="fmg-table">
            <thead>
              <tr id="religionsHeader">
                <SortableHeader
                  field="name"
                  label="Religion"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={religionsEditorActions.changeSort}
                  tip="Click to sort by religion name"
                />
                <SortableHeader
                  field="type"
                  label="Type"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={religionsEditorActions.changeSort}
                  tip="Click to sort by religion type"
                />
                <SortableHeader
                  field="form"
                  label="Form"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={religionsEditorActions.changeSort}
                  tip="Click to sort by religion form"
                />
                {!isBrushMode && (
                  <>
                    <SortableHeader
                      field="deity"
                      label="Supreme Deity"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={religionsEditorActions.changeSort}
                      tip="Click to sort by supreme deity"
                    />
                    <SortableHeader
                      field="area"
                      label="Area"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={religionsEditorActions.changeSort}
                      numeric
                      tip="Click to sort by religion area"
                    />
                    <SortableHeader
                      field="population"
                      label="Believers"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={religionsEditorActions.changeSort}
                      numeric
                      tip="Click to sort by number of believers (religion area population)"
                    />
                    <SortableHeader
                      field="expansion"
                      label="Potential"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={religionsEditorActions.changeSort}
                      tip="Click to sort by potential extent type"
                    />
                    <SortableHeader
                      field="expansionism"
                      label="Expansion"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={religionsEditorActions.changeSort}
                      numeric
                      tip="Click to sort by expansionism"
                    />
                    <th></th>
                  </>
                )}
              </tr>
            </thead>
            <VirtualTableBody
              items={sortedReligions}
              scrollElementRef={parentRef}
              renderRow={r => {
                const populationTip = `Believers: ${si(r.population)}; Rural areas: ${si(r.rural)}; Urban areas: ${si(r.urban)}. Click to change`;
                const areaText = isPercentageMode
                  ? `${totalArea > 0 ? rn((r.area / totalArea) * 100) : 0}%`
                  : `${si(r.area)} ${unit}`;
                const popText = isPercentageMode
                  ? `${totalPopulation > 0 ? rn((r.population / totalPopulation) * 100) : 0}%`
                  : si(r.population);
                const isFolk = r.type === "Folk";

                return (
                  <tr
                    key={r.i}
                    id={`religion${r.i}`}
                    className="states"
                    data-id={r.i}
                    onClick={() => religionsEditorActions.selectReligionOnLineClick(r.i)}
                    onMouseEnter={() => religionsEditorActions.religionHighlightOn(r.i)}
                    onMouseLeave={() => religionsEditorActions.religionHighlightOff(r.i)}
                    style={{ pointerEvents: isBrushMode ? "none" : "all" }}
                  >
                    <td className="d-flex">
                      {r.i ? (
                        <FillBox fill={r.color} onClick={() => religionsEditorActions.changeFill(r.i)} />
                      ) : (
                        <svg width="9" height="9" className="placeholder" aria-label="placeholder" role="img">
                          <title>placeholder</title>
                        </svg>
                      )}

                      <input
                        data-tip="Religion name. Click and type to change"
                        className={`${r.i ? "religionName" : "religionName italic"}`}
                        value={r.name}
                        autoCorrect="off"
                        spellCheck={false}
                        onChange={e => religionsEditorActions.changeName(r.i, e.target.value)}
                      />
                    </td>
                    <td>
                      <select
                        data-tip="Religion type"
                        className={`${r.i ? "religionType" : "religionType placeholder"}`}
                        value={r.type}
                        onChange={e => religionsEditorActions.changeType(r.i, e.target.value)}
                      >
                        <option value="Folk">Folk</option>
                        <option value="Organized">Organized</option>
                        <option value="Cult">Cult</option>
                        <option value="Heresy">Heresy</option>
                      </select>
                    </td>
                    <td>
                      <input
                        data-tip="Religion form"
                        className={`${r.i ? "religionForm" : "religionForm placeholder"}`}
                        value={r.form}
                        autoCorrect="off"
                        spellCheck={false}
                        onChange={e => religionsEditorActions.changeForm(r.i, e.target.value)}
                      />
                    </td>
                    {!isBrushMode && (
                      <>
                        <td>
                          <div className="d-flex">
                            <IconButton
                              data-tip="Click to re-generate supreme deity"
                              className={`icon-arrows-cw pointer ${r.i ? "" : "placeholder"}`}
                              onClick={() => r.i && religionsEditorActions.regenerateDeity(r.i)}
                            />
                            <input
                              data-tip="Religion supreme deity"
                              className={`religionDeity ${r.i ? "" : "placeholder"}`}
                              value={r.deity}
                              autoCorrect="off"
                              spellCheck={false}
                              onChange={e => religionsEditorActions.changeDeity(r.i, e.target.value)}
                            />
                          </div>
                        </td>
                        <td>
                          <div className="d-flex">
                            <span data-tip="Religion area" className="icon-map-o" />
                            <div data-tip="Religion area" className="religionArea">
                              {areaText}
                            </div>
                          </div>
                        </td>
                        <td className="pointer" onClick={() => religionsEditorActions.changePopulation(r.i)}>
                          <div className="d-flex">
                            <span data-tip={populationTip} className="icon-male" />
                            <div data-tip={populationTip} className="religionPopulation">
                              {popText}
                            </div>
                          </div>
                        </td>
                        {r.i ? (
                          isFolk ? (
                            <>
                              <td>
                                <div className="d-flex">
                                  <span
                                    data-tip="Folk religions do not expand"
                                    className="icon-resize-full-alt -religions-editor-dialog__padding-right-2px"
                                  />
                                  <span data-tip="Folk religions do not expand" className="religionExtent">
                                    culture
                                  </span>
                                </div>
                              </td>
                              <td>
                                <div className="d-flex">
                                  <span data-tip="Folk religions do not expand" className="icon-resize-full" />
                                  <input
                                    data-tip="Folk religions do not expand"
                                    className="religionExpantion"
                                    disabled
                                    type="number"
                                    value="0"
                                  />
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td>
                                <div className="d-flex">
                                  <span
                                    data-tip="Potential religion extent"
                                    className="icon-resize-full-alt -religions-editor-dialog__padding-right-2px"
                                  />
                                  <select
                                    data-tip="Potential religion extent"
                                    className="religionExtent"
                                    value={r.expansion}
                                    onChange={e => religionsEditorActions.changeExtent(r.i, e.target.value)}
                                  >
                                    <option value="global">global</option>
                                    <option value="state">state</option>
                                    <option value="culture">culture</option>
                                  </select>
                                </div>
                              </td>
                              <td>
                                <div className="d-flex">
                                  <span
                                    data-tip="Religion expansionism. Defines competitive size"
                                    className="icon-resize-full"
                                  />
                                  <input
                                    data-tip="Religion expansionism. Defines competitive size. Click to change, then click Recalculate to apply change"
                                    className="religionExpantion"
                                    type="number"
                                    min="0"
                                    max="99"
                                    step=".1"
                                    value={r.expansionism}
                                    onChange={e =>
                                      religionsEditorActions.changeExpansionism(r.i, e.target.valueAsNumber)
                                    }
                                  />
                                </div>
                              </td>
                            </>
                          )
                        ) : (
                          <>
                            <td></td>
                            <td></td>
                          </>
                        )}
                        <td>
                          {r.i ? (
                            <div className="d-flex">
                              <IconButton
                                data-tip="Locate the religion"
                                className="icon-target pointer"
                                onClick={() => religionsEditorActions.highlightReligion(r.i)}
                              />
                              <IconButton
                                data-tip="Lock this religion"
                                className={`icon-lock${r.lock ? "" : "-open"} pointer`}
                                onClick={() => religionsEditorActions.updateLockStatus(r.i)}
                              />
                              <IconButton
                                data-tip="Remove religion"
                                className="icon-trash-empty pointer"
                                onClick={() => religionsEditorActions.triggerRemove(r.i)}
                              />
                            </div>
                          ) : null}
                        </td>
                      </>
                    )}
                  </tr>
                );
              }}
            />
          </table>
        </div>

        <div id="religionsTotal" className="totalLine" style={{ display: isBrushMode ? "none" : "block" }}>
          <div data-tip="Total number of organized religions">
            Organized:<span id="religionsOrganized">{totalOrganized}</span>
          </div>
          <div data-tip="Total number of heresies">
            Heresies:<span id="religionsHeresies">{totalHeresies}</span>
          </div>
          <div data-tip="Total number of cults">
            Cults:<span id="religionsCults">{totalCults}</span>
          </div>
          <div data-tip="Total number of folk religions">
            Folk:<span id="religionsFolk">{totalFolk}</span>
          </div>
          <div data-tip="Total land area">
            Land Area:<span id="religionsFooterArea">{si(totalArea) + unit}</span>
          </div>
          <div data-tip="Total number of believers (population)">
            Believers:<span id="religionsFooterPopulation">{si(totalPopulation)}</span>
          </div>
        </div>

        <div id="religionsFooter" className="footer">
          {isBrushMode ? null : (
            <>
              <button
                type="button"
                id="religionsEditorRefresh"
                data-tip="Refresh the Editor"
                className="icon-cw"
                onClick={religionsEditorActions.refresh}
              />
              <button
                type="button"
                id="religionsEditStyle"
                data-tip="Edit religions style in Style Editor"
                className="icon-adjust"
                onClick={religionsEditorActions.editStyle}
              />
              <button
                type="button"
                id="religionsLegend"
                data-tip="Toggle Legend box"
                className="icon-list-bullet"
                onClick={religionsEditorActions.toggleLegend}
              />
              <button
                type="button"
                id="religionsPercentage"
                data-tip="Toggle percentage / absolute values display mode"
                className={`icon-percent ${isPercentageMode ? "pressed" : ""}`}
                onClick={religionsEditorActions.togglePercentageMode}
              />
              <button
                type="button"
                id="religionsHeirarchy"
                data-tip="Show religions hierarchy tree"
                className="icon-sitemap"
                onClick={religionsEditorActions.showHierarchy}
              />
              <button
                type="button"
                id="religionsExtinct"
                data-tip="Show/hide extinct religions (religions without cells)"
                className={`icon-eye-off ${extinctVisible ? "pressed" : ""}`}
                onClick={religionsEditorActions.toggleExtinct}
              />
            </>
          )}

          <button
            type="button"
            id="religionsManually"
            data-tip="Manually re-assign religions"
            className={`icon-brush ${isBrushMode ? "pressed" : ""}`}
            onClick={religionsEditorActions.enterReligionsManualAssignent}
            style={{ display: isBrushMode ? "none" : "inline-block" }}
          />

          <div id="religionsManuallyButtons" style={{ display: isBrushMode ? "inline-block" : "none" }}>
            <div
              data-tip="Change brush size. Shortcuts: + or ] to increase; - or [ to decrease"
              className="d-inline-block"
            >
              Brush size:
              <input
                type="range"
                id="religionsBrush"
                min="1"
                max="100"
                value={brushSize}
                onChange={e => religionsEditorActions.changeBrushSize(e.target.valueAsNumber)}
              />
            </div>
            <button
              type="button"
              id="religionsManuallyApply"
              data-tip="Apply assignment"
              className="icon-check"
              onClick={religionsEditorActions.applyReligionsManualAssignent}
            />
            <button
              type="button"
              id="religionsManuallyCancel"
              data-tip="Cancel assignment"
              className="icon-cancel"
              onClick={religionsEditorActions.exitReligionsManualAssignment}
            />
            <div data-tip="When enabled, only cells without religion can be painted" className="d-inline-block">
              <input
                id="religionsManuallyProtect"
                className="checkbox"
                type="checkbox"
                checked={protectExisting}
                onChange={e => religionsEditorActions.toggleProtectExisting(e.target.checked)}
              />
              <label htmlFor="religionsManuallyProtect" className="checkbox-label">
                <i>do not overwrite existing</i>
              </label>
            </div>
          </div>

          {isBrushMode ? null : (
            <>
              <button
                type="button"
                id="religionsAdd"
                data-tip="Add a new religion. Hold Shift to add multiple"
                className="icon-plus"
                onClick={religionsEditorActions.enterAddReligionMode}
              />
              <button
                type="button"
                id="religionsExport"
                data-tip="Download religions-related data"
                className="icon-download"
                onClick={religionsEditorActions.downloadReligionsCsv}
              />
              <button
                type="button"
                id="religionsRecalculate"
                data-tip="Recalculate religions based on current values of growth-related attributes"
                className="icon-retweet"
                onClick={religionsEditorActions.recalculateReligions}
              />
              <span data-tip="Allow religion center, extent, and expansionism changes to take an immediate effect">
                <input
                  id="religionsAutoChange"
                  className="checkbox"
                  type="checkbox"
                  checked={autoChange}
                  onChange={e => religionsEditorActions.setAutoChange(e.target.checked)}
                />
                <label htmlFor="religionsAutoChange" className="checkbox-label">
                  <i>auto-apply changes</i>
                </label>
              </span>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
};
