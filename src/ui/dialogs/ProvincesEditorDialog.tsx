import { useVirtualizer } from "@tanstack/react-virtual";
import type React from "react";
import { useMemo, useRef } from "react";
import { provincesEditorActions, selectProvinceOnLineClick } from "../../controllers/provinces-editor";
import { useProvincesEditorState } from "../../store/provincesEditorState";
import { rn, si } from "../../utils";
import { getAreaUnit } from "../../utils/domUtils";
import { FillBox } from "../components/FillBox";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const ProvincesEditorDialog: React.FC = () => {
  const {
    isOpen,
    filterState,
    isPercentageMode,
    sortBy,
    sortDirection,
    customization,
    brushSize,
    provinces,
    stateOptions,
    totalProvinces,
    totalBurgs,
    totalArea,
    totalPopulation
  } = useProvincesEditorState();

  const sortedProvinces = useMemo(() => {
    return [...provinces].sort((a, b) => {
      let valA: string | number;
      let valB: string | number;

      if (sortBy === "name") {
        valA = a.name;
        valB = b.name;
      } else if (sortBy === "form") {
        valA = a.formName;
        valB = b.formName;
      } else if (sortBy === "capital") {
        valA = a.capitalName;
        valB = b.capitalName;
      } else if (sortBy === "state") {
        valA = a.stateName;
        valB = b.stateName;
      } else if (sortBy === "burgs") {
        valA = a.burgCount;
        valB = b.burgCount;
      } else if (sortBy === "area") {
        valA = a.area;
        valB = b.area;
      } else {
        valA = a.population;
        valB = b.population;
      }

      if (valA < valB) return -1 * sortDirection;
      if (valA > valB) return 1 * sortDirection;
      return 0;
    });
  }, [provinces, sortBy, sortDirection]);

  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: sortedProvinces.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 5
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0 ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end : 0;

  if (!isOpen) return null;

  const unit = getAreaUnit();

  return (
    <Dialog
      isOpen={isOpen}
      title="Provinces Editor"
      onClose={() => closeDialog("provincesEditor")}
      className="fmg-dialog--overflow-hidden"
    >
      <div id="provincesEditorContainer">
        <div
          id="provincesBodySection"
          className="table"
          data-type={isPercentageMode ? "percentage" : "absolute"}
          ref={parentRef}
          style={{ overflow: "auto" }}
        >
          <table className="fmg-table">
            <thead style={{ zIndex: 3 }}>
              <tr id="provincesHeader">
                <th
                  data-tip="Click to sort by province name"
                  className={`sortable alphabetically ${sortBy === "name" ? "sort-active" : ""}`}
                  onClick={() => provincesEditorActions.changeSort("name")}
                >
                  Province&nbsp;
                </th>
                {customization !== 11 && (
                  <>
                    <th
                      data-tip="Click to sort by province form name"
                      className={`sortable alphabetically ${sortBy === "form" ? "sort-active" : ""}`}
                      onClick={() => provincesEditorActions.changeSort("form")}
                    >
                      Form&nbsp;
                    </th>
                    <th
                      data-tip="Click to sort by province capital"
                      className={`sortable alphabetically ${sortBy === "capital" ? "sort-active" : ""}`}
                      onClick={() => provincesEditorActions.changeSort("capital")}
                    >
                      Capital&nbsp;
                    </th>
                  </>
                )}
                <th
                  data-tip="Click to sort by province owner"
                  className={`sortable alphabetically ${sortBy === "state" ? "sort-active" : ""}`}
                  onClick={() => provincesEditorActions.changeSort("state")}
                >
                  State&nbsp;
                </th>
                {customization !== 11 && (
                  <>
                    <th
                      data-tip="Click to sort by province burgs count"
                      className={`sortable ${sortBy === "burgs" ? "sort-active" : ""}`}
                      onClick={() => provincesEditorActions.changeSort("burgs")}
                    >
                      Burgs&nbsp;
                    </th>
                    <th
                      data-tip="Click to sort by province area"
                      className={`sortable ${sortBy === "area" ? "sort-active" : ""}`}
                      onClick={() => provincesEditorActions.changeSort("area")}
                    >
                      Area&nbsp;
                    </th>
                    <th
                      data-tip="Click to sort by province population"
                      className={`sortable ${sortBy === "population" ? "sort-active" : ""}`}
                      onClick={() => provincesEditorActions.changeSort("population")}
                    >
                      Population&nbsp;
                    </th>
                  </>
                )}
                {customization !== 11 && <th></th>}
              </tr>
            </thead>
            <tbody>
              {sortedProvinces.length === 0 ? null : (
                <>
                  {paddingTop > 0 && (
                    <tr>
                      <td colSpan={customization !== 11 ? 8 : 2} style={{ height: `${paddingTop}px` }} />
                    </tr>
                  )}
                  {virtualItems.map(virtualRow => {
                    const p = sortedProvinces[virtualRow.index];
                    const populationTip = `Total population: ${si(p.population)}; Rural population: ${si(p.rural)}; Urban population: ${si(p.urban)}`;
                    const areaText = isPercentageMode
                      ? `${totalArea > 0 ? rn((p.area / totalArea) * 100) : 0}%`
                      : `${si(p.area)} ${unit}`;
                    const popText = isPercentageMode
                      ? `${totalPopulation > 0 ? rn((p.population / totalPopulation) * 100) : 0}%`
                      : si(p.population);
                    const burgsText = isPercentageMode
                      ? `${totalBurgs > 0 ? rn((p.burgCount / totalBurgs) * 100) : 0}%`
                      : p.burgCount;

                    return (
                      <tr
                        key={p.i}
                        className="states"
                        data-id={p.i}
                        onClick={() => selectProvinceOnLineClick(p.i)}
                        onMouseEnter={() => provincesEditorActions.provinceHighlightOn(p.i)}
                        onMouseLeave={() => provincesEditorActions.provinceHighlightOff(null)}
                        style={{ pointerEvents: customization ? "none" : "all" }}
                      >
                        <td style={{ display: "flex" }}>
                          <FillBox fill={p.color} onClick={() => provincesEditorActions.changeFill(p.i)} />
                          <input
                            data-tip="Province name. Click to change"
                            className="name pointer"
                            value={p.name}
                            readOnly
                            onClick={() => provincesEditorActions.editProvinceName(p.i)}
                          />
                          {customization !== 11 && (
                            <svg
                              data-tip="Click to show and edit province emblem"
                              className="coaIcon pointer"
                              viewBox="0 0 200 200"
                              onClick={() => provincesEditorActions.editEmblem(p.i)}
                              aria-label="Province Emblem"
                              role="img"
                            >
                              <title>{p.name} Emblem</title>
                              <use href={`#provinceCOA${p.i}`} />
                            </svg>
                          )}
                        </td>
                        {customization !== 11 && (
                          <>
                            <td>
                              <input
                                data-tip="Province form name. Click to change"
                                className="name pointer"
                                value={p.formName}
                                readOnly
                                onClick={() => provincesEditorActions.editProvinceName(p.i)}
                              />
                            </td>
                            <td>
                              <div style={{ display: "flex" }}>
                                <span
                                  data-tip="Province capital. Click to zoom into view"
                                  className={`icon-star-empty pointer ${p.capitalId ? "" : "placeholder"}`}
                                  onClick={() => p.capitalId && provincesEditorActions.capitalZoomIn(p.i)}
                                />
                                <select
                                  data-tip="Province capital. Click to select from burgs within the state. No capital means the province is governed from the state capital"
                                  className={`cultureBase ${p.burgCount ? "" : "placeholder"}`}
                                  value={p.capitalId}
                                  onChange={e => provincesEditorActions.changeCapital(p.i, e.target.value)}
                                >
                                  {p.burgsData.map(b => (
                                    <option key={b.id} value={b.id}>
                                      {b.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </td>
                          </>
                        )}
                        <td>
                          <input data-tip="Province owner" className="provinceOwner" value={p.stateName} disabled />
                        </td>
                        {customization !== 11 && (
                          <>
                            <td>
                              <div style={{ display: "flex" }}>
                                <span
                                  data-tip="Click to overview province burgs"
                                  className="-provinces-editor-dialog__padding-right-1px icon-dot-circled pointer"
                                  onClick={() => provincesEditorActions.overviewBurgs(p.stateId)}
                                />
                                <div data-tip="Burgs count" className="provinceBurgs">
                                  {burgsText}
                                </div>
                              </div>
                            </td>
                            <td>
                              <div style={{ display: "flex" }}>
                                <span
                                  data-tip="Province area"
                                  className="-provinces-editor-dialog__padding-right-4px icon-map-o"
                                />
                                <div data-tip="Province area" className="biomeArea">
                                  {areaText}
                                </div>
                              </div>
                            </td>
                            <td className="pointer" onClick={() => provincesEditorActions.changePopulation(p.i)}>
                              <div style={{ display: "flex" }}>
                                <span data-tip={populationTip} className="icon-male" />
                                <div data-tip={populationTip} className="culturePopulation">
                                  {popText}
                                </div>
                              </div>
                            </td>
                            <td>
                              <div style={{ display: "flex" }}>
                                <span
                                  data-tip="Declare province independence (turn non-capital province with burgs into a new state)"
                                  className={`icon-flag-empty ${p.isSeparable ? "" : "placeholder"} pointer`}
                                  onClick={() =>
                                    p.isSeparable && provincesEditorActions.triggerIndependencePrompts(p.i)
                                  }
                                />
                                <span
                                  data-tip="Locate the province"
                                  className="icon-target pointer"
                                  onClick={() => provincesEditorActions.highlightElement(p.i)}
                                />
                                <span
                                  data-tip="Toggle province focus"
                                  className={`icon-pin ${p.isFocused ? "" : "inactive"} pointer`}
                                  onClick={() => provincesEditorActions.toggleFog(p.i)}
                                />
                                <span
                                  data-tip="Lock the province"
                                  className={`icon-lock${p.isLocked ? "" : "-open"} pointer`}
                                  onClick={() => provincesEditorActions.updateLockStatus(p.i)}
                                />
                                <span
                                  data-tip="Remove the province"
                                  className="icon-trash-empty pointer"
                                  onClick={() => provincesEditorActions.removeProvince(p.i)}
                                />
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                  {paddingBottom > 0 && (
                    <tr>
                      <td colSpan={customization !== 11 ? 8 : 2} style={{ height: `${paddingBottom}px` }} />
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>

        <div id="provincesTotal" className="totalLine" style={{ display: customization === 11 ? "none" : "block" }}>
          <div data-tip="Provinces displayed">
            Provinces:&nbsp;<span id="provincesFooterNumber">{totalProvinces}</span>
          </div>
          <div data-tip="Total burgs number">
            Burgs:&nbsp;<span id="provincesFooterBurgs">{totalBurgs}</span>
          </div>
          <div data-tip="Average area">
            Mean area:&nbsp;
            <span id="provincesFooterArea">{totalProvinces ? si(totalArea / totalProvinces) + unit : `0${unit}`}</span>
          </div>
          <div data-tip="Average population">
            Mean population:&nbsp;
            <span id="provincesFooterPopulation">{totalProvinces ? si(totalPopulation / totalProvinces) : 0}</span>
          </div>
        </div>

        <div id="provincesFooter" className="fmg-dialog-footer">
          {customization === 11 ? null : (
            <>
              <button
                type="button"
                data-tip="Refresh the Editor"
                className="icon-cw"
                onClick={provincesEditorActions.changeFilter.bind(null, filterState)}
              />
              <button
                type="button"
                data-tip="Edit provinces style in Style Editor"
                className="icon-adjust"
                onClick={provincesEditorActions.editStyle}
              />
              <button
                type="button"
                data-tip="Recolor listed provinces based on state color"
                className="icon-paint-roller"
                onClick={provincesEditorActions.recolorProvinces}
              />
              <button
                type="button"
                data-tip="Toggle percentage / absolute values views"
                className={`icon-percent ${isPercentageMode ? "pressed" : ""}`}
                onClick={provincesEditorActions.togglePercentageMode}
              />
              <button
                type="button"
                data-tip="Show provinces chart"
                className="icon-chart-area"
                onClick={provincesEditorActions.showChart}
              />
              <button
                type="button"
                data-tip="Toggle province labels. Change size in Menu ⭢ Style ⭢ Provinces"
                className="icon-font"
                onClick={provincesEditorActions.toggleLabels}
              />
              <button
                type="button"
                data-tip="Save provinces-related data as a text file (.csv)"
                className="icon-download"
                onClick={provincesEditorActions.downloadProvincesData}
              />
            </>
          )}

          <button
            type="button"
            data-tip="Manually re-assign provinces"
            className={`icon-brush ${customization === 11 ? "pressed" : ""}`}
            onClick={provincesEditorActions.enterProvincesManualAssignment}
            style={{ display: customization === 11 ? "none" : "inline-block" }}
          />

          <div id="provincesManuallyButtons" style={{ display: customization === 11 ? "inline-block" : "none" }}>
            <div data-tip="Change brush size. Shortcut: + to increase; – to decrease" className="d-inline-block">
              Brush size:
              <input
                type="range"
                id="provincesBrush"
                min={1}
                max={100}
                value={brushSize}
                onChange={e => provincesEditorActions.changeBrushSize(e.target.valueAsNumber)}
              />
            </div>
            <button
              type="button"
              data-tip="Apply assignment"
              className="icon-check"
              onClick={provincesEditorActions.applyProvincesManualAssignment}
            />
            <button
              type="button"
              data-tip="Cancel assignment"
              className="icon-cancel"
              onClick={provincesEditorActions.exitProvincesManualAssignment}
            />
          </div>

          {customization === 11 ? null : (
            <>
              <button
                type="button"
                data-tip="Release all provinces. It will make all provinces with burgs independent"
                className="icon-flag"
                onClick={provincesEditorActions.triggerProvincesRelease}
              />
              <button
                type="button"
                data-tip="Add a new province. Hold Shift to add multiple"
                className={`icon-plus ${customization === 12 ? "pressed" : ""}`}
                onClick={provincesEditorActions.enterAddProvinceMode}
              />
              <button
                type="button"
                data-tip="Merge several provinces into one"
                className="icon-layer-group"
                onClick={provincesEditorActions.openProvinceMergeDialog}
              />
              <button
                type="button"
                data-tip="Remove all provinces. States will remain as they are"
                className="icon-trash"
                onClick={provincesEditorActions.removeAllProvinces}
              />
              <span>State: </span>
              <select
                id="provincesFilterState"
                value={filterState}
                onChange={e => provincesEditorActions.changeFilter(parseInt(e.target.value, 10))}
              >
                {stateOptions.map(opt => (
                  <option key={opt.i} value={opt.i}>
                    {opt.name}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
};
