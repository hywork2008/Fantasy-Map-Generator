import React, { useEffect, useMemo, useState } from "react";
import { worldContext } from "../../context/worldContext";
import { statesEditorActions } from "../../controllers/states-editor";
import { useExtensionState } from "../../store/extensionState";
import { useStatesEditorState } from "../../store/statesEditorState";
import { rn, si } from "../../utils";
import { getAreaUnit } from "../../utils/domUtils";
import { FillBox } from "../components/FillBox";
import { IconButton } from "../components/IconButton";
import { SliderInput } from "../components/SliderInput";
import { SortableHeader } from "../components/tables/SortableHeader";
import { VirtualTableBody } from "../components/VirtualTableBody";

export const StatesEditorContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState("overview");
  const allEditorTabs = useExtensionState(state => state.editorTabs);
  const editorTabs = useMemo(() => allEditorTabs.filter(t => t.editorId === "statesEditor"), [allEditorTabs]);
  const overviewColumns = useExtensionState(state => state.stateOverviewColumns);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { editorId?: string; tabId?: string } | undefined;
      if (detail?.editorId === "statesEditor" && detail.tabId) setActiveTab(detail.tabId);
    };
    document.addEventListener("fmg:activate-editor-tab", handler);
    return () => document.removeEventListener("fmg:activate-editor-tab", handler);
  }, []);
  const {
    isPercentageMode,
    sortBy,
    sortDirection,
    customizationMode,
    isRegenerationMenuOpen,
    autoChange,
    adjustLabels,
    growthRate,
    brushSize,
    protectExisting,
    totalStates,
    totalCells,
    totalBurgs,
    totalArea,
    totalPopulation,
    states,
    manualSelectedStateId
  } = useStatesEditorState();

  const handleMouseEnter = (stateId: number) => {
    statesEditorActions.highlightStateOnMap(stateId);
  };

  const handleMouseLeave = () => {
    statesEditorActions.clearStateHighlight();
  };

  const sortedStates = useMemo(() => {
    return [...states].sort((a, b) => {
      let valA: string | number | undefined = a[sortBy as keyof typeof a] as string | number | undefined;
      let valB: string | number | undefined = b[sortBy as keyof typeof b] as string | number | undefined;
      if (valA === undefined && valB === undefined) {
        const column = overviewColumns.find(c => c.id === sortBy);
        if (column) {
          valA = column.getValue(worldContext.pack.states[a.i]);
          valB = column.getValue(worldContext.pack.states[b.i]);
        }
      }
      if (typeof valA === "string") valA = valA.toLowerCase();
      if (typeof valB === "string") valB = valB.toLowerCase();

      if (valA! < valB!) return -1 * sortDirection;
      if (valA! > valB!) return 1 * sortDirection;
      return 0;
    });
  }, [states, sortBy, sortDirection, overviewColumns]);

  const sortOrder = sortDirection === 1 ? "asc" : "desc";

  const areaUnit = getAreaUnit();

  const ActiveExtensionComponent = editorTabs.find(t => t.id === activeTab)?.component;

  const parentRef = React.useRef<HTMLDivElement>(null);

  return (
    <div id="statesEditor">
      {editorTabs.length > 0 && (
        <div style={{ display: "flex", borderBottom: "1px solid #555", marginBottom: "4px", fontSize: "1.1em" }}>
          <div
            style={{
              padding: "4px 12px",
              cursor: "pointer",
              borderBottom: activeTab === "overview" ? "2px solid #ddd" : "2px solid transparent",
              fontWeight: activeTab === "overview" ? "bold" : "normal",
              opacity: activeTab === "overview" ? 1 : 0.7
            }}
            onClick={() => setActiveTab("overview")}
          >
            Overview
          </div>
          {editorTabs.map(t => (
            <div
              key={t.id}
              style={{
                padding: "4px 12px",
                cursor: "pointer",
                borderBottom: activeTab === t.id ? "2px solid #ddd" : "2px solid transparent",
                fontWeight: activeTab === t.id ? "bold" : "normal",
                opacity: activeTab === t.id ? 1 : 0.7
              }}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </div>
          ))}
        </div>
      )}

      {activeTab === "overview" ? (
        <>
          <div ref={parentRef} id="statesBodySection" className="table" data-type="absolute">
            <table className="fmg-table">
              <thead>
                <tr id="statesHeader">
                  <SortableHeader
                    field="name"
                    label="State"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={statesEditorActions.changeSort}
                    tip="Click to sort by state name"
                  />
                  <SortableHeader
                    field="formName"
                    label="Form"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={statesEditorActions.changeSort}
                    tip="Click to sort by state form name"
                  />
                  <SortableHeader
                    field="capitalName"
                    label="Capital"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={statesEditorActions.changeSort}
                    tip="Click to sort by capital name"
                  />
                  <SortableHeader
                    field="cultureName"
                    label="Culture"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={statesEditorActions.changeSort}
                    tip="Click to sort by state dominant culture"
                    className="hide"
                  />
                  <SortableHeader
                    field="burgs"
                    label="Burgs"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={statesEditorActions.changeSort}
                    numeric
                    tip="Click to sort by state burgs count"
                    className="hide"
                  />
                  <SortableHeader
                    field="area"
                    label="Area"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={statesEditorActions.changeSort}
                    numeric
                    tip="Click to sort by state area"
                    className="hide"
                  />
                  <SortableHeader
                    field="population"
                    label="Population"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={statesEditorActions.changeSort}
                    numeric
                    tip="Click to sort by state population"
                    className="hide"
                  />
                  {overviewColumns.map(column => (
                    <SortableHeader
                      key={column.id}
                      field={column.id}
                      label={column.label}
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={statesEditorActions.changeSort}
                      numeric
                      tip={column.tip}
                      className="hide"
                    />
                  ))}
                  <SortableHeader
                    field="type"
                    label="Type"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={statesEditorActions.changeSort}
                    tip="Click to sort by state type"
                    className="hidden show hide"
                  />
                  <SortableHeader
                    field="expansionism"
                    label="Expansion"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={statesEditorActions.changeSort}
                    numeric
                    tip="Click to sort by state expansion value"
                    className="hidden show hide"
                  />
                  <SortableHeader
                    field="cells"
                    label="Cells"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={statesEditorActions.changeSort}
                    numeric
                    tip="Click to sort by state cells count"
                    className="hidden show hide"
                  />
                  <th></th>
                </tr>
              </thead>
              <VirtualTableBody
                items={sortedStates}
                scrollElementRef={parentRef}
                renderRow={s => {
                  const isNeutral = !s.i;
                  const areaText =
                    isPercentageMode && !isNeutral && totalArea
                      ? `${rn((s.area / totalArea) * 100)}%`
                      : `${si(s.area)} ${areaUnit}`;
                  const populationText =
                    isPercentageMode && !isNeutral && totalPopulation
                      ? `${rn((s.population / totalPopulation) * 100)}%`
                      : si(s.population);

                  return (
                    <tr
                      key={s.i}
                      className={`states${customizationMode === 1 && s.i === manualSelectedStateId ? " selected" : ""}`}
                      data-id={s.i}
                      style={{ pointerEvents: customizationMode === 1 ? "none" : "all" }}
                      onMouseEnter={() => handleMouseEnter(s.i)}
                      onMouseLeave={handleMouseLeave}
                    >
                      <td>
                        <div className="d-flex">
                          {/* @ts-ignore */}
                          <FillBox
                            fill={s.color}
                            onClick={isNeutral ? undefined : () => statesEditorActions.changeColor(s.i)}
                          />
                          <input
                            type="text"
                            data-tip="State name. Click to change"
                            className="stateName name pointer"
                            value={s.name}
                            readOnly
                            onClick={() => (isNeutral ? null : statesEditorActions.editStateName(s.i))}
                          />
                        </div>
                      </td>
                      <td>
                        {isNeutral ? null : (
                          <input
                            data-tip="State form name. Click to change"
                            className="stateForm name pointer"
                            value={s.formName}
                            readOnly
                            onClick={() => statesEditorActions.editStateName(s.i)}
                          />
                        )}
                      </td>
                      <td>
                        {isNeutral ? null : (
                          <div className="d-flex">
                            <IconButton
                              data-tip="Capital name. Click to zoom"
                              className="icon-star-empty pointer"
                              onClick={() => statesEditorActions.zoomCapital(s.i)}
                            />
                            <input
                              data-tip="Capital name. Click and type to rename"
                              className="stateCapital"
                              value={s.capitalName}
                              onChange={e => statesEditorActions.changeCapitalName(s.i, e.target.value)}
                            />
                          </div>
                        )}
                      </td>
                      <td className="hide">
                        <select
                          data-tip="State dominant culture. Click to change"
                          className="stateCulture hide"
                          value={s.culture}
                          onChange={e => statesEditorActions.changeCulture(s.i, parseInt(e.target.value, 10))}
                        >
                          {statesEditorActions.getCultureOptions(s.culture).map(c => (
                            <option key={c.i} value={c.i}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="hide numeric">
                        <div className="d-flex">
                          <IconButton
                            data-tip={
                              isNeutral ? "Click to overview independent burgs" : "Click to overview state burgs"
                            }
                            className="icon-dot-circled pointer hide"
                            onClick={() => statesEditorActions.overviewBurgs(s.i)}
                          />
                          <span
                            data-tip={isNeutral ? "Independent burgs on unclaimed land" : "Burgs count"}
                            className="stateBurgs hide"
                          >
                            {s.burgs}
                          </span>
                        </div>
                      </td>
                      <td className="hide numeric">
                        <span data-tip="State area" className="stateArea hide">
                          {areaText}
                        </span>
                      </td>
                      <td
                        className="hide numeric pointer"
                        onClick={() => (isNeutral ? null : statesEditorActions.changePopulation(s.i))}
                      >
                        <span data-tip="State population" className="statePopulation pointer hide">
                          {populationText}
                        </span>
                      </td>
                      {overviewColumns.map(column => {
                        const state = worldContext.pack.states[s.i];
                        return (
                          <td
                            key={column.id}
                            className={`hide numeric${column.onClick ? " pointer" : ""}`}
                            onClick={() => (isNeutral || !column.onClick ? null : column.onClick(state))}
                          >
                            {isNeutral ? null : (
                              <span data-tip={column.tip} className="hide">
                                {column.format(column.getValue(state))}
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td className="hidden show hide">
                        {isNeutral ? null : (
                          <select
                            data-tip="State type. Click to change"
                            className="stateType pointer hidden show hide"
                            value={s.type}
                            onChange={e => statesEditorActions.changeType(s.i, e.target.value)}
                          >
                            <option value="Generic">Generic</option>
                            <option value="River">River</option>
                            <option value="Lake">Lake</option>
                            <option value="Naval">Naval</option>
                            <option value="Nomadic">Nomadic</option>
                            <option value="Highland">Highland</option>
                          </select>
                        )}
                      </td>
                      <td className="hidden show hide numeric">
                        {isNeutral ? null : (
                          <input
                            type="number"
                            min="0"
                            max="99"
                            step=".1"
                            data-tip="Expansionism (base rate of country growth). Change to re-calculate borders"
                            className="stateExpansionism hidden show hide"
                            value={s.expansionism}
                            onChange={e => statesEditorActions.changeExpansionism(s.i, parseFloat(e.target.value))}
                          />
                        )}
                      </td>
                      <td className="hidden show hide numeric">
                        <span data-tip="Cells count" className="stateCells hidden show hide">
                          {s.cells}
                        </span>
                      </td>
                      <td>
                        {isNeutral ? null : (
                          <div className="d-flex">
                            <IconButton
                              data-tip="Lock the state"
                              className={`stateLock ${s.isLocked ? "icon-pin" : "icon-pin-outline"} pointer`}
                              onClick={() => statesEditorActions.toggleLock(s.i)}
                            />
                            <IconButton
                              data-tip="Edit state"
                              className="icon-pencil pointer"
                              onClick={() => statesEditorActions.openStateEditor(s.i)}
                            />
                            <IconButton
                              data-tip="Remove the state"
                              className="stateRemove icon-trash-empty pointer"
                              onClick={() => statesEditorActions.removeState(s.i)}
                            />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                }}
              />
            </table>
          </div>
          <div id="statesTotal" className="totalLine">
            <div data-tip="States number">
              States:<span>{totalStates}</span>
            </div>
            <div data-tip="Total land cells number">
              Cells:<span>{totalCells}</span>
            </div>
            <div data-tip="Total burgs number">
              Burgs:<span>{totalBurgs}</span>
            </div>
            <div data-tip="Total land area">
              Land Area:
              <span>
                {si(totalArea)} {areaUnit}
              </span>
            </div>
            <div data-tip="Total population">
              Population:<span>{si(totalPopulation)}</span>
            </div>
          </div>
        </>
      ) : ActiveExtensionComponent ? (
        <ActiveExtensionComponent />
      ) : null}
      <div id="statesFooter" className="footer">
        <button
          type="button"
          id="statesEditorRefresh"
          data-tip="Refresh the Editor"
          className="icon-cw"
          onClick={statesEditorActions.refresh}
        />
        <button
          type="button"
          id="statesEditStyle"
          data-tip="Edit states style in Style Editor"
          className="icon-adjust"
          onClick={statesEditorActions.editStyle}
        />
        <button
          type="button"
          id="statesLegend"
          data-tip="Toggle Legend box"
          className="icon-list-bullet"
          onClick={statesEditorActions.toggleLegend}
        />
        <button
          type="button"
          id="statesPercentage"
          data-tip="Toggle percentage / absolute values views"
          className={`icon-percent ${isPercentageMode ? "pressed" : ""}`}
          onClick={statesEditorActions.togglePercentageMode}
        />
        <button
          type="button"
          id="statesChart"
          data-tip="Show states bubble chart"
          className="icon-chart-area"
          onClick={statesEditorActions.showStatesChart}
        />

        <button
          type="button"
          id="statesRegenerate"
          data-tip="Show the regeneration menu and more data"
          className="icon-cog-alt"
          onClick={statesEditorActions.toggleRegenerationMenu}
          style={{ display: isRegenerationMenuOpen ? "none" : "inline-block" }}
        />

        <div id="statesRegenerateButtons" style={{ display: isRegenerationMenuOpen ? "inline-block" : "none" }}>
          <button
            type="button"
            id="statesRegenerateBack"
            data-tip="Hide the regeneration menu"
            className="icon-cog-alt pressed"
            onClick={statesEditorActions.toggleRegenerationMenu}
          />
          <button
            type="button"
            id="statesRandomize"
            data-tip="Randomize states Expansion value and re-calculate states and provinces"
            className="icon-shuffle"
            onClick={statesEditorActions.randomizeStatesExpansion}
          />
          <div data-tip="Additional growth rate. Defines how many land cells remain neutral" className="d-inline-block">
            <SliderInput
              id="statesGrowthRate"
              min=".1"
              max="3"
              step=".05"
              value={growthRate}
              onChange={value => statesEditorActions.changeGrowthRate(parseFloat(value))}
            >
              Growth rate:
            </SliderInput>
          </div>
          <button
            type="button"
            id="statesRecalculate"
            data-tip="Recalculate states based on current values of growth-related attributes"
            className="icon-retweet"
            onClick={() => statesEditorActions.recalculateStates(true)}
          />
          <div
            data-tip="Allow states neutral distance, expansion and type changes to take an immediate effect"
            className="d-inline-block"
          >
            <input
              id="statesAutoChange"
              className="checkbox"
              type="checkbox"
              checked={autoChange}
              onChange={e => statesEditorActions.setAutoChange(e.target.checked)}
            />
            <label htmlFor="statesAutoChange" className="checkbox-label">
              <i>auto-apply changes</i>
            </label>
          </div>
          <div data-tip="Allow system to change state labels when states data is change" className="d-inline-block">
            <input
              id="adjustLabels"
              className="checkbox"
              type="checkbox"
              checked={adjustLabels}
              onChange={e => statesEditorActions.setAdjustLabels(e.target.checked)}
            />
            <label htmlFor="adjustLabels" className="checkbox-label">
              <i>auto-change labels</i>
            </label>
          </div>
        </div>

        <button
          type="button"
          id="statesManually"
          data-tip="Manually re-assign states"
          className={`icon-brush ${customizationMode === 1 ? "pressed" : ""}`}
          onClick={statesEditorActions.toggleManualAssignment}
          style={{ display: isRegenerationMenuOpen ? "none" : "inline-block" }}
        />

        <div id="statesManuallyButtons" style={{ display: customizationMode === 1 ? "inline-block" : "none" }}>
          <div data-tip="Change brush size. Shortcuts: + / ] to increase; - / [ to decrease" className="d-inline-block">
            <SliderInput
              id="statesBrush"
              min="1"
              max="100"
              value={brushSize}
              onChange={value => statesEditorActions.changeBrushSize(parseInt(value, 10))}
            >
              Brush size:
            </SliderInput>
          </div>
          <button
            type="button"
            id="statesManuallyUndo"
            data-tip="Undo last brush stroke"
            className="icon-ccw"
            onClick={statesEditorActions.undoManualAssignment}
          />
          <button
            type="button"
            id="statesManuallyApply"
            data-tip="Apply assignment"
            className="icon-check"
            onClick={statesEditorActions.applyManualAssignment}
          />
          <button
            type="button"
            id="statesManuallyCancel"
            data-tip="Cancel assignment"
            className="icon-cancel"
            onClick={statesEditorActions.cancelManualAssignment}
          />
          <div data-tip="When enabled, only neutral cells can be painted" className="d-inline-block">
            <input
              id="statesManuallyProtect"
              className="checkbox"
              type="checkbox"
              checked={protectExisting}
              onChange={e => statesEditorActions.setProtectExisting(e.target.checked)}
            />
            <label htmlFor="statesManuallyProtect" className="checkbox-label">
              <i>do not overwrite existing</i>
            </label>
          </div>
        </div>

        <button
          type="button"
          id="statesAdd"
          data-tip="Add a new state. Hold Shift to add multiple"
          className={`icon-plus ${customizationMode === 2 ? "pressed" : ""}`}
          onClick={e => statesEditorActions.toggleAddStateMode(e.shiftKey)}
          style={{ display: isRegenerationMenuOpen || customizationMode === 1 ? "none" : "inline-block" }}
        />
        <button
          type="button"
          id="statesMerge"
          data-tip="Merge several states into one"
          className={`icon-layer-group ${customizationMode === 3 ? "pressed" : ""}`}
          onClick={statesEditorActions.openStateMergeDialog}
          style={{ display: isRegenerationMenuOpen || customizationMode === 1 ? "none" : "inline-block" }}
        />
        <button
          type="button"
          id="statesExport"
          data-tip="Save state-related data as a text file (.csv)"
          className="icon-download"
          onClick={statesEditorActions.downloadStatesCsv}
          style={{ display: isRegenerationMenuOpen || customizationMode === 1 ? "none" : "inline-block" }}
        />
      </div>
    </div>
  );
};
