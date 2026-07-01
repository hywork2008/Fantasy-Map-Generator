import type React from "react";
import { useMemo, useRef } from "react";
import { culturesEditorActions } from "../../controllers/cultures-editor";
import { COA } from "../../generators/emblem/generator";
import { useCulturesEditorState } from "../../store/culturesEditorState";
import { capitalize, rn, si } from "../../utils";
import { getAreaUnit } from "../../utils/domUtils";
import { FillBox } from "../components/FillBox";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

const cultureTypes = ["Generic", "River", "Lake", "Naval", "Nomadic", "Hunting", "Highland"];

const shapeOptions: string[] = Object.keys(COA.shields.types).flatMap(type =>
  Object.keys((COA.shields as Record<string, Record<string, number>>)[type])
);

export const CulturesEditorDialog: React.FC = () => {
  const {
    isOpen,
    sortBy,
    sortDirection,
    isPercentageMode,
    customization,
    brushSize,
    autoChange,
    selectShape,
    selectedCultureId,
    cultures,
    nameBases,
    totalCells,
    totalArea,
    totalPopulation
  } = useCulturesEditorState();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const sortedCultures = useMemo(() => {
    return [...cultures].sort((a, b) => {
      let valA: string | number = a.name;
      let valB: string | number = b.name;

      if (sortBy === "type") {
        valA = a.type;
        valB = b.type;
      } else if (sortBy === "base") {
        valA = a.base;
        valB = b.base;
      } else if (sortBy === "cells") {
        valA = a.cells;
        valB = b.cells;
      } else if (sortBy === "expansionism") {
        valA = a.expansionism;
        valB = b.expansionism;
      } else if (sortBy === "area") {
        valA = a.area;
        valB = b.area;
      } else if (sortBy === "population") {
        valA = a.population;
        valB = b.population;
      } else if (sortBy === "emblems") {
        valA = a.shield;
        valB = b.shield;
      }

      if (valA < valB) return -1 * sortDirection;
      if (valA > valB) return 1 * sortDirection;
      return 0;
    });
  }, [cultures, sortBy, sortDirection]);

  if (!isOpen) return null;

  const unit = getAreaUnit();
  const isBrushMode = customization === 4;
  const isAddMode = customization === 9;

  const SortHeader = ({
    label,
    col,
    tip,
    hide = false,
    hidden = false
  }: {
    label: string;
    col: string;
    tip: string;
    hide?: boolean;
    hidden?: boolean;
  }) => (
    <div
      data-tip={tip}
      className={`sortable ${hide ? "hide" : ""} ${hidden ? "hidden" : ""} ${sortBy === col ? "sort-active" : ""}`}
      onClick={() => culturesEditorActions.changeSort(col)}
    >
      {label}&nbsp;
    </div>
  );

  return (
    <Dialog
      isOpen={isOpen}
      title="Cultures Editor"
      onClose={() => closeDialog("culturesEditor")}
      className="fmg-dialog--overflow-hidden"
    >
      <div id="culturesEditor">
        <div
          id="culturesHeader"
          className="header -cultures-editor-dialog__grid-template-columns-10em-7em-9em-4em-8em-5em-7em"
        >
          <SortHeader label="Culture" col="name" tip="Click to sort by culture name" />
          <SortHeader label="Type" col="type" tip="Click to sort by type" />
          <SortHeader label="Namesbase" col="base" tip="Click to sort by culture namesbase" />
          <SortHeader label="Cells" col="cells" tip="Click to sort by culture cells count" hide />
          <SortHeader label="Expansion" col="expansionism" tip="Click to sort by expansionism" hide />
          <SortHeader label="Area" col="area" tip="Click to sort by culture area" hide />
          <SortHeader label="Population" col="population" tip="Click to sort by culture population" hide />
          <SortHeader
            label="Emblems"
            col="emblems"
            tip="Click to sort by culture emblems shape"
            hide
            hidden={!selectShape}
          />
        </div>

        <div id="culturesBody" className="table" data-type={isPercentageMode ? "percentage" : "absolute"}>
          {sortedCultures.map(c => {
            const isNeutral = c.i === 0;
            const areaText = isPercentageMode
              ? `${totalArea > 0 ? rn((c.area / totalArea) * 100) : 0}%`
              : `${si(c.area)} ${unit}`;
            const cellsText = isPercentageMode
              ? `${totalCells > 0 ? rn((c.cells / totalCells) * 100) : 0}%`
              : String(c.cells);
            const popText = isPercentageMode
              ? `${totalPopulation > 0 ? rn((c.population / totalPopulation) * 100) : 0}%`
              : si(c.population);
            const populationTip = `Total population: ${si(c.population)}. Rural: ${si(c.rural)}. Urban: ${si(c.urban)}. Click to edit`;
            const isSelected = isBrushMode && selectedCultureId === c.i;

            return (
              <div
                key={c.i}
                className={`states${isSelected ? " selected" : ""}`}
                data-id={c.i}
                onClick={() => culturesEditorActions.selectCultureOnLineClick(c.i)}
                onMouseEnter={() => culturesEditorActions.cultureHighlightOn(c.i)}
                onMouseLeave={() => culturesEditorActions.cultureHighlightOff(c.i)}
                style={{ pointerEvents: isBrushMode ? "none" : "all" }}
              >
                {isNeutral ? (
                  <svg width="11" height="11" className="placeholder" aria-hidden="true" />
                ) : (
                  <FillBox fill={c.color} onClick={() => culturesEditorActions.changeFill(c.i)} />
                )}

                <input
                  data-tip={
                    isNeutral
                      ? "Neutral culture name. Click and type to change"
                      : "Culture name. Click and type to change"
                  }
                  className={`cultureName${isNeutral ? " italic" : ""} -cultures-editor-dialog__width-7em`}
                  value={c.name}
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={e => culturesEditorActions.changeName(c.i, e.target.value)}
                />

                {isNeutral ? (
                  <span className="icon-cw placeholder" />
                ) : (
                  <span
                    data-tip="Regenerate culture name"
                    className="icon-cw hiddenIcon -cultures-editor-dialog__visibility-hidden"
                    onClick={() => culturesEditorActions.regenerateName(c.i)}
                  />
                )}

                <select
                  data-tip={isNeutral ? undefined : "Culture type. Defines growth model. Click to change"}
                  className={`cultureType${isNeutral ? " placeholder" : ""}`}
                  value={c.type}
                  disabled={isNeutral}
                  onChange={e => culturesEditorActions.changeType(c.i, e.target.value)}
                >
                  {cultureTypes.map(t => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>

                <span
                  data-tip="Click to re-generate names for burgs with this culture assigned"
                  className={`icon-arrows-cw hide${isNeutral ? "" : ""}`}
                  onClick={() => !isNeutral && culturesEditorActions.regenerateBurgs(c.i)}
                />

                <select
                  data-tip="Culture namesbase. Click to change"
                  className="cultureBase"
                  value={c.base}
                  onChange={e => culturesEditorActions.changeBase(c.i, +e.target.value)}
                >
                  {nameBases.map(n => (
                    <option key={n.i} value={n.i}>
                      {n.name}
                    </option>
                  ))}
                  {!nameBases[c.base] && <option value={c.base}>removed</option>}
                </select>

                <span data-tip="Cells count" className="icon-check-empty hide" />
                <div data-tip="Cells count" className="cultureCells hide -cultures-editor-dialog__width-4em">
                  {cellsText}
                </div>

                <span
                  data-tip="Culture expansionism. Defines competitive size"
                  className={`icon-resize-full hide${isNeutral ? " placeholder" : ""}`}
                />
                <input
                  data-tip="Culture expansionism. Defines competitive size. Click to change, then click Recalculate to apply"
                  className={`cultureExpan hide${isNeutral ? " placeholder" : ""}`}
                  type="number"
                  min="0"
                  max="99"
                  step=".1"
                  value={isNeutral ? "" : c.expansionism}
                  disabled={isNeutral}
                  onChange={e => culturesEditorActions.changeExpansionism(c.i, e.target.valueAsNumber)}
                />

                <span data-tip="Culture area" className="-cultures-editor-dialog__padding-right-4px icon-map-o hide" />
                <div data-tip="Culture area" className="cultureArea hide -cultures-editor-dialog__width-6em">
                  {areaText}
                </div>

                <span data-tip={populationTip} className="icon-male hide" />
                <div
                  data-tip={populationTip}
                  className="culturePopulation hide pointer -cultures-editor-dialog__width-4em"
                  onClick={() => culturesEditorActions.changePopulation(c.i)}
                >
                  {popText}
                </div>

                {selectShape && (
                  <select
                    data-tip="Emblem shape associated with culture. Click to change"
                    className="cultureEmblems hide"
                    value={c.shield}
                    onChange={e => culturesEditorActions.changeEmblemsShape(c.i, e.target.value)}
                  >
                    {shapeOptions.map(shape => (
                      <option key={shape} value={shape}>
                        {capitalize(shape)}
                      </option>
                    ))}
                  </select>
                )}

                {!isNeutral && (
                  <>
                    <span
                      data-tip="Locate the culture"
                      className="icon-target hide"
                      onClick={() => culturesEditorActions.highlightCulture(c.i)}
                    />
                    <span
                      data-tip="Lock culture"
                      className={`icon-lock${c.lock ? "" : "-open"} hide`}
                      onClick={() => culturesEditorActions.updateLockStatus(c.i)}
                    />
                    <span
                      data-tip="Remove culture"
                      className="icon-trash-empty hide"
                      onClick={() => culturesEditorActions.triggerRemove(c.i)}
                    />
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div id="culturesTotal" className="totalLine" style={{ display: isBrushMode ? "none" : undefined }}>
          <div data-tip="Cultures number" className="-cultures-editor-dialog__margin-left-12">
            Cultures:&nbsp;<span>{cultures.filter(c => c.i).length}</span>
          </div>
          <div data-tip="Total land cells number" className="-cultures-editor-dialog__margin-left-12">
            Cells:&nbsp;<span>{totalCells}</span>
          </div>
          <div data-tip="Total land area" className="-cultures-editor-dialog__margin-left-12">
            Land Area:&nbsp;
            <span>
              {si(totalArea)} {unit}
            </span>
          </div>
          <div data-tip="Total population" className="-cultures-editor-dialog__margin-left-12">
            Population:&nbsp;<span>{si(totalPopulation)}</span>
          </div>
        </div>

        <div id="culturesFooter" className="fmg-dialog-footer">
          {isBrushMode ? null : (
            <>
              <button
                type="button"
                data-tip="Refresh the Editor"
                className="icon-cw"
                onClick={culturesEditorActions.refresh}
              />
              <button
                type="button"
                data-tip="Edit cultures style in Style Editor"
                className="icon-adjust"
                onClick={culturesEditorActions.editStyle}
              />
              <button
                type="button"
                data-tip="Toggle Legend box"
                className="icon-list-bullet"
                onClick={culturesEditorActions.toggleLegend}
              />
              <button
                type="button"
                data-tip="Toggle percentage / absolute values display mode"
                className={`icon-percent${isPercentageMode ? " pressed" : ""}`}
                onClick={culturesEditorActions.togglePercentageMode}
              />
              <button
                type="button"
                data-tip="Show cultures hierarchy tree"
                className="icon-sitemap"
                onClick={culturesEditorActions.showHierarchy}
              />
            </>
          )}

          <button
            type="button"
            data-tip="Manually re-assign cultures"
            className={`icon-brush${isBrushMode ? " pressed" : ""}`}
            style={{ display: isBrushMode ? "none" : "inline-block" }}
            onClick={culturesEditorActions.enterCultureManualAssignment}
          />

          <div id="culturesManuallyButtons" style={{ display: isBrushMode ? "inline-block" : "none" }}>
            <div
              data-tip="Change brush size. Shortcuts: + / ] to increase; - / [ to decrease"
              style={{ marginBlock: "0.3em", display: "inline-block" }}
            >
              Brush size:
              <input
                type="range"
                id="culturesBrush"
                min="1"
                max="100"
                value={brushSize}
                onChange={e => culturesEditorActions.changeBrushSize(e.target.valueAsNumber)}
              />
            </div>
            <button
              type="button"
              data-tip="Undo last brush stroke"
              className="icon-ccw"
              onClick={culturesEditorActions.undoCultureManualAssignment}
            />
            <button
              type="button"
              data-tip="Apply assignment"
              className="icon-check"
              onClick={culturesEditorActions.applyCultureManualAssignment}
            />
            <button
              type="button"
              data-tip="Cancel assignment"
              className="icon-cancel"
              onClick={culturesEditorActions.exitCultureManualAssignment}
            />
          </div>

          {isBrushMode ? null : (
            <>
              <button
                type="button"
                data-tip="Edit a database used for names generation"
                className="icon-font"
                onClick={culturesEditorActions.openNamesbaseEditor}
              />
              <button
                type="button"
                data-tip="Add a new culture. Hold Shift to add multiple"
                className={`icon-plus${isAddMode ? " pressed" : ""}`}
                onClick={culturesEditorActions.enterAddCulturesMode}
              />
              <button
                type="button"
                data-tip="Download cultures-related data"
                className="icon-download"
                onClick={culturesEditorActions.downloadCulturesCsv}
              />
              <button
                type="button"
                data-tip="Upload cultures-related data"
                className="icon-upload"
                onClick={() => fileInputRef.current?.click()}
              />
              <input
                ref={fileInputRef}
                id="culturesCSVToLoad"
                type="file"
                className="-cultures-editor-dialog__display-none"
                accept=".csv"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) {
                    culturesEditorActions.uploadCulturesData(file);
                    e.target.value = "";
                  }
                }}
              />
              <button
                type="button"
                data-tip="Recalculate cultures based on current values of growth-related attributes"
                className="icon-retweet"
                onClick={culturesEditorActions.recalculateCultures}
              />
              <span
                data-tip="Allow culture centers, expansion and type changes to take an immediate effect"
                className="-cultures-editor-dialog__display-inline-flex"
              >
                <input
                  id="culturesAutoChange"
                  className="checkbox"
                  type="checkbox"
                  checked={autoChange}
                  onChange={e => culturesEditorActions.setAutoChange(e.target.checked)}
                />
                <label htmlFor="culturesAutoChange" className="checkbox-label">
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
