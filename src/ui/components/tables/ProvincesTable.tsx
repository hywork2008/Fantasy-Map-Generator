import { useVirtualizer } from "@tanstack/react-virtual";
import type React from "react";
import { useRef } from "react";
import { provincesEditorActions, selectProvinceOnLineClick } from "../../../controllers/provinces-editor";
import type { ProvinceRowData } from "../../../store/provincesEditorState";
import { rn, si } from "../../../utils";
import { getAreaUnit } from "../../../utils/domUtils";
import { FillBox } from "../FillBox";
import { IconButton } from "../IconButton";

export interface ProvincesTableProps {
  provinces: ProvinceRowData[];
  sortBy: string;
  sortDirection: number;
  onSort: (field: string) => void;
  isPercentageMode: boolean;
  totalArea: number;
  totalPopulation: number;
  totalBurgs: number;
  /** Manual-reassignment customization mode of the standalone Provinces Editor (0 = normal). Embedded usage stays 0. */
  customization?: number;
  /** Hide the "State" column — every row already belongs to the same state when embedded in a State Editor. */
  hideStateColumn?: boolean;
}

/**
 * Presentational provinces table shared by the standalone Provinces Editor dialog and the
 * embedded Provinces tab of the State Editor. Row data and sort state are passed as props —
 * the component never reads provincesEditorState itself — so an embedded caller (scoped to one
 * state) never fights the standalone dialog's own filter/sort if both happen to be open at once.
 */
export const ProvincesTable: React.FC<ProvincesTableProps> = ({
  provinces,
  sortBy,
  sortDirection,
  onSort,
  isPercentageMode,
  totalArea,
  totalPopulation,
  totalBurgs,
  customization = 0,
  hideStateColumn = false
}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: provinces.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 5
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0 ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end : 0;

  const unit = getAreaUnit();
  const showExtraColumns = customization !== 11;
  const columnCount = showExtraColumns ? (hideStateColumn ? 7 : 8) : hideStateColumn ? 1 : 2;

  return (
    <>
      <div
        className="table -states-editor-dialog__max-height-400px--overflow-y-auto"
        data-type={isPercentageMode ? "percentage" : "absolute"}
        ref={parentRef}
        style={{ overflow: "auto" }}
      >
        <table className="fmg-table">
          <thead style={{ zIndex: 3 }}>
            <tr>
              <th
                data-tip="Click to sort by province name"
                className={`sortable alphabetically ${sortBy === "name" ? "sort-active" : ""}`}
                onClick={() => onSort("name")}
              >
                Province
              </th>
              {showExtraColumns && (
                <>
                  <th
                    data-tip="Click to sort by province form name"
                    className={`sortable alphabetically ${sortBy === "form" ? "sort-active" : ""}`}
                    onClick={() => onSort("form")}
                  >
                    Form
                  </th>
                  <th
                    data-tip="Click to sort by province capital"
                    className={`sortable alphabetically ${sortBy === "capital" ? "sort-active" : ""}`}
                    onClick={() => onSort("capital")}
                  >
                    Capital
                  </th>
                </>
              )}
              {!hideStateColumn && (
                <th
                  data-tip="Click to sort by province owner"
                  className={`sortable alphabetically ${sortBy === "state" ? "sort-active" : ""}`}
                  onClick={() => onSort("state")}
                >
                  State
                </th>
              )}
              {showExtraColumns && (
                <>
                  <th
                    data-tip="Click to sort by province burgs count"
                    className={`sortable ${sortBy === "burgs" ? "sort-active" : ""}`}
                    onClick={() => onSort("burgs")}
                  >
                    Burgs
                  </th>
                  <th
                    data-tip="Click to sort by province area"
                    className={`sortable ${sortBy === "area" ? "sort-active" : ""}`}
                    onClick={() => onSort("area")}
                  >
                    Area
                  </th>
                  <th
                    data-tip="Click to sort by province population"
                    className={`sortable ${sortBy === "population" ? "sort-active" : ""}`}
                    onClick={() => onSort("population")}
                  >
                    Population
                  </th>
                </>
              )}
              {showExtraColumns && <th></th>}
            </tr>
          </thead>
          <tbody>
            {provinces.length === 0 ? null : (
              <>
                {paddingTop > 0 && (
                  <tr>
                    <td colSpan={columnCount} style={{ height: `${paddingTop}px` }} />
                  </tr>
                )}
                {virtualItems.map(virtualRow => {
                  const p = provinces[virtualRow.index];
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
                      <td className="d-flex">
                        <FillBox fill={p.color} onClick={() => provincesEditorActions.changeFill(p.i)} />
                        <input
                          data-tip="Province name. Click to change"
                          className="name pointer"
                          value={p.name}
                          readOnly
                          onClick={() => provincesEditorActions.editProvinceName(p.i)}
                        />
                        {showExtraColumns && (
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
                      {showExtraColumns && (
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
                            <div className="d-flex">
                              <IconButton
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
                      {!hideStateColumn && (
                        <td>
                          <input data-tip="Province owner" className="provinceOwner" value={p.stateName} disabled />
                        </td>
                      )}
                      {showExtraColumns && (
                        <>
                          <td>
                            <div className="d-flex">
                              <IconButton
                                data-tip="Click to overview province burgs"
                                className="pointer"
                                onClick={() => provincesEditorActions.overviewBurgs(p.stateId)}
                              />
                              <div data-tip="Burgs count" className="provinceBurgs">
                                {burgsText}
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="d-flex">
                              <span data-tip="Province area" className="icon-map-o" />
                              <div data-tip="Province area" className="biomeArea">
                                {areaText}
                              </div>
                            </div>
                          </td>
                          <td className="pointer" onClick={() => provincesEditorActions.changePopulation(p.i)}>
                            <div className="d-flex">
                              <span data-tip={populationTip} className="icon-male" />
                              <div data-tip={populationTip} className="culturePopulation">
                                {popText}
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="d-flex">
                              <IconButton
                                data-tip="Declare province independence (turn non-capital province with burgs into a new state)"
                                className={`icon-flag-empty ${p.isSeparable ? "" : "placeholder"} pointer`}
                                onClick={() => p.isSeparable && provincesEditorActions.triggerIndependencePrompts(p.i)}
                              />
                              <IconButton
                                data-tip="Locate the province"
                                className="icon-target pointer"
                                onClick={() => provincesEditorActions.highlightElement(p.i)}
                              />
                              <IconButton
                                data-tip="Toggle province focus"
                                className={`icon-pin ${p.isFocused ? "" : "inactive"} pointer`}
                                onClick={() => provincesEditorActions.toggleFog(p.i)}
                              />
                              <IconButton
                                data-tip="Lock the province"
                                className={`icon-lock${p.isLocked ? "" : "-open"} pointer`}
                                onClick={() => provincesEditorActions.updateLockStatus(p.i)}
                              />
                              <IconButton
                                data-tip="Edit province"
                                className="icon-pencil pointer"
                                onClick={() => provincesEditorActions.openProvinceEditor(p.i)}
                              />
                              <IconButton
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
                    <td colSpan={columnCount} style={{ height: `${paddingBottom}px` }} />
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>

      {showExtraColumns && (
        <div className="totalLine" style={{ display: customization === 11 ? "none" : "block" }}>
          <div data-tip="Provinces displayed">
            Provinces:<span>{provinces.length}</span>
          </div>
          <div data-tip="Total burgs number">
            Burgs:<span>{totalBurgs}</span>
          </div>
          <div data-tip="Average area">
            Mean area:
            <span>{provinces.length ? si(totalArea / provinces.length) + unit : `0${unit}`}</span>
          </div>
          <div data-tip="Average population">
            Mean population:
            <span>{provinces.length ? si(totalPopulation / provinces.length) : 0}</span>
          </div>
        </div>
      )}
    </>
  );
};
