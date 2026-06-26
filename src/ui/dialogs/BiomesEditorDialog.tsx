import type React from "react";
import { useMemo, useState } from "react";
import {
  biomesAddCustomBiome,
  biomesApplyChange,
  biomesChangeColor,
  biomesChangeHabitability,
  biomesChangeName,
  biomesDownloadData,
  biomesEditStyle,
  biomesEnterCustomization,
  biomesExitCustomization,
  biomesHighlightOff,
  biomesHighlightOn,
  biomesOpenWiki,
  biomesRefresh,
  biomesRegenerateIcons,
  biomesRemoveCustomBiome,
  biomesRestoreDefaults,
  biomesSelectOnLine,
  biomesToggleDisplayMode,
  biomesToggleLegend
} from "../../controllers/biomes-editor";
import { useBiomesEditorStore } from "../../store/biomesEditorStore";

import { rn, si } from "../../utils";
import { FillBox } from "../components/FillBox";
import { SliderInput } from "../components/SliderInput";

type SortKey = "name" | "habitability" | "cells" | "area" | "population";

export const BiomesEditorContent: React.FC = () => {
  const { rows, footer, displayMode, selectedBiomeId, isCustomizationMode, refreshCount } = useBiomesEditorStore();

  const [sortBy, setSortBy] = useState<SortKey>("cells");
  const [sortDesc, setSortDesc] = useState(true);

  const sortedRows = useMemo(() => {
    const isAlpha = sortBy === "name";
    return [...rows].sort((a, b) => {
      const av = a[sortBy] as string | number;
      const bv = b[sortBy] as string | number;
      const cmp = isAlpha ? String(av).localeCompare(String(bv)) : (av as number) - (bv as number);
      return sortDesc ? -cmp : cmp;
    });
  }, [rows, sortBy, sortDesc]);

  const handleSort = (col: SortKey, isAlpha: boolean) => {
    if (sortBy === col) {
      setSortDesc(d => !d);
    } else {
      setSortBy(col);
      setSortDesc(!isAlpha);
    }
  };

  const sortIcon = (col: SortKey, isAlpha: boolean) => {
    if (sortBy !== col) return "";
    return ` icon-sort-${isAlpha ? "alpha" : "number"}-${sortDesc ? "down" : "up"}`;
  };

  const displayCells = (n: number) =>
    displayMode === "percentage" && footer.cells > 0 ? `${rn((n / footer.cells) * 100)}%` : String(n);

  const displayArea = (n: number) =>
    displayMode === "percentage" && footer.totalArea > 0 ? `${rn((n / footer.totalArea) * 100)}%` : si(n) + footer.unit;

  const displayPop = (n: number) =>
    displayMode === "percentage" && footer.totalPopulation > 0 ? `${rn((n / footer.totalPopulation) * 100)}%` : si(n);

  const footerArea =
    displayMode === "percentage" && footer.mapArea > 0
      ? `${rn((footer.totalArea / footer.mapArea) * 100)}%`
      : si(footer.totalArea) + footer.unit;

  const innerPtr = isCustomizationMode ? ({ pointerEvents: "none" } as const) : undefined;
  const hc = (extra?: string) => ["hide", isCustomizationMode ? "hidden" : "", extra].filter(Boolean).join(" ");

  return (
    <div id="biomesEditor">
      <div>
        <div id="biomesHeader" className="header" style={{ gridTemplateColumns: "13em 7em 5em 5em 7em" }}>
          <div
            data-tip="Click to sort by biome name"
            className={`sortable alphabetically${sortIcon("name", true)}`}
            data-sortby="name"
            onClick={() => handleSort("name", true)}
          >
            Biome&nbsp;
          </div>
          <div
            data-tip="Click to sort by biome habitability"
            className={`sortable ${hc()}${sortIcon("habitability", false)}`}
            data-sortby="habitability"
            onClick={() => handleSort("habitability", false)}
          >
            Habitability&nbsp;
          </div>
          <div
            data-tip="Click to sort by biome cells number"
            className={`sortable ${hc()}${sortIcon("cells", false)}`}
            data-sortby="cells"
            onClick={() => handleSort("cells", false)}
          >
            Cells&nbsp;
          </div>
          <div
            data-tip="Click to sort by biome area"
            className={`sortable ${hc()}${sortIcon("area", false)}`}
            data-sortby="area"
            onClick={() => handleSort("area", false)}
          >
            Area&nbsp;
          </div>
          <div
            data-tip="Click to sort by biome population"
            className={`sortable ${hc()}${sortIcon("population", false)}`}
            data-sortby="population"
            onClick={() => handleSort("population", false)}
          >
            Population&nbsp;
          </div>
        </div>

        <div id="biomesBody" className="table" data-type={displayMode}>
          {sortedRows.map(row => (
            <div
              key={`${row.i}-${refreshCount}`}
              className={`states biomes${selectedBiomeId === row.i ? " selected" : ""}`}
              data-id={row.i}
              data-name={row.name}
              data-habitability={row.habitability}
              data-cells={row.cells}
              data-area={row.area}
              data-population={row.population}
              data-color={row.color}
              onMouseEnter={() => biomesHighlightOn(row.i)}
              onMouseLeave={() => biomesHighlightOff(row.i)}
              onClick={isCustomizationMode ? () => biomesSelectOnLine(row.i) : undefined}
            >
              <FillBox
                fill={row.color}
                onClick={() => biomesChangeColor(row.i, row.color)}
                disabled={isCustomizationMode}
              />
              <input
                data-tip="Biome name. Click and type to change"
                className="biomeName"
                defaultValue={row.name}
                autoCorrect="off"
                spellCheck={false}
                style={innerPtr}
                onBlur={e => biomesChangeName(row.i, e.target.value)}
              />
              <span data-tip="Biome habitability percent" className={hc()} style={innerPtr}>
                %
              </span>
              <input
                data-tip="Biome habitability percent. Click and set new value to change"
                type="number"
                min={0}
                max={9999}
                className={hc("biomeHabitability")}
                defaultValue={row.habitability}
                style={innerPtr}
                onBlur={e => biomesChangeHabitability(row.i, e.target.value)}
              />
              <span data-tip="Cells count" className={hc("icon-check-empty")} style={innerPtr} />
              <div data-tip="Cells count" className={hc("biomeCells")} style={innerPtr}>
                {displayCells(row.cells)}
              </div>
              <span
                data-tip="Biome area"
                className={hc("icon-map-o")}
                style={{ paddingRight: 4, ...(innerPtr ?? {}) }}
              />
              <div data-tip="Biome area" className={hc("biomeArea")} style={innerPtr}>
                {displayArea(row.area)}
              </div>
              <span data-tip={row.populationTip} className={hc("icon-male")} style={innerPtr} />
              <div data-tip={row.populationTip} className={hc("biomePopulation")} style={innerPtr}>
                {displayPop(row.population)}
              </div>
              <span
                data-tip="Open Wikipedia article about the biome"
                className={hc("icon-info-circled pointer")}
                style={innerPtr}
                onClick={() => biomesOpenWiki(row.name)}
              />
              {row.canRemove && (
                <span
                  data-tip="Remove the custom biome"
                  className={hc("icon-trash-empty")}
                  style={innerPtr}
                  onClick={() => biomesRemoveCustomBiome(row.i)}
                />
              )}
            </div>
          ))}
        </div>

        <div id="biomesTotal" className="totalLine" style={{ display: isCustomizationMode ? "none" : undefined }}>
          <div data-tip="Number of land biomes" style={{ marginLeft: 12 }}>
            Biomes:&nbsp;<span id="biomesFooterBiomes">{footer.biomes}</span>
          </div>
          <div data-tip="Total land cells number" style={{ marginLeft: 12 }}>
            Cells:&nbsp;<span id="biomesFooterCells">{footer.cells}</span>
          </div>
          <div data-tip="Total land area" style={{ marginLeft: 12 }}>
            Land Area:&nbsp;<span id="biomesFooterArea">{footerArea}</span>
          </div>
          <div data-tip="Total population" style={{ marginLeft: 12 }}>
            Population:&nbsp;<span id="biomesFooterPopulation">{si(footer.totalPopulation)}</span>
          </div>
        </div>

        <div id="biomesFooter">
          <button
            type="button"
            id="biomesEditorRefresh"
            data-tip="Refresh the Editor"
            className="icon-cw"
            style={{ display: isCustomizationMode ? "none" : undefined }}
            onClick={biomesRefresh}
          />
          <button
            type="button"
            id="biomesEditStyle"
            data-tip="Edit biomes style in Style Editor"
            className="icon-adjust"
            style={{ display: isCustomizationMode ? "none" : undefined }}
            onClick={biomesEditStyle}
          />
          <button
            type="button"
            id="biomesLegend"
            data-tip="Toggle Legend box"
            className="icon-list-bullet"
            style={{ display: isCustomizationMode ? "none" : undefined }}
            onClick={biomesToggleLegend}
          />
          <button
            type="button"
            id="biomesPercentage"
            data-tip="Toggle percentage / absolute values views"
            className="icon-percent"
            style={{ display: isCustomizationMode ? "none" : undefined }}
            onClick={biomesToggleDisplayMode}
          />
          <button
            type="button"
            id="biomesManually"
            data-tip="Manually re-assign biomes to not follow the default moisture/temperature pattern"
            className="icon-brush"
            style={{ display: isCustomizationMode ? "none" : undefined }}
            onClick={biomesEnterCustomization}
          />
          <div id="biomesManuallyButtons" style={{ display: isCustomizationMode ? undefined : "none" }}>
            <div data-tip="Change brush size. Shortcut: + to increase; – to decrease" style={{ marginBlock: "0.3em" }}>
              Brush size:
              <SliderInput id="biomesBrush" min={1} max={100} value={15} />
            </div>
            <button
              type="button"
              id="biomesManuallyApply"
              data-tip="Apply current assignment"
              className="icon-check"
              onClick={biomesApplyChange}
            />
            <button
              type="button"
              id="biomesManuallyCancel"
              data-tip="Cancel assignment"
              className="icon-cancel"
              onClick={() => biomesExitCustomization()}
            />
          </div>
          <button
            type="button"
            id="biomesAdd"
            data-tip="Add a custom biome"
            className="icon-plus"
            style={{ display: isCustomizationMode ? "none" : undefined }}
            onClick={biomesAddCustomBiome}
          />
          <button
            type="button"
            id="biomesRestore"
            data-tip="Restore the defaults and re-define biomes based on current moisture and temperature"
            className="icon-history"
            style={{ display: isCustomizationMode ? "none" : undefined }}
            onClick={biomesRestoreDefaults}
          />
          <button
            type="button"
            id="biomesRegenerateReliefIcons"
            data-tip="Regenerate relief icons based on current biomes and elevation"
            className="icon-tree"
            style={{ display: isCustomizationMode ? "none" : undefined }}
            onClick={biomesRegenerateIcons}
          />
          <button
            type="button"
            id="biomesExport"
            data-tip="Save biomes-related data as a text file (.csv)"
            className="icon-download"
            style={{ display: isCustomizationMode ? "none" : undefined }}
            onClick={() => biomesDownloadData(sortedRows)}
          />
        </div>
      </div>
    </div>
  );
};
