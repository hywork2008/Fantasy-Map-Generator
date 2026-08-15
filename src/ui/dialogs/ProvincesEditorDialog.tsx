import type React from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { provincesEditorActions, sortProvinceRows } from "../../controllers/provinces-editor";
import { useProvincesEditorState } from "../../store/provincesEditorState";
import { ProvincesTable } from "../components/tables/ProvincesTable";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const ProvincesEditorDialog: React.FC = () => {
  const { t } = useTranslation();
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
    totalBurgs,
    totalArea,
    totalPopulation
  } = useProvincesEditorState();

  const sortedProvinces = useMemo(
    () => sortProvinceRows(provinces, sortBy, sortDirection),
    [provinces, sortBy, sortDirection]
  );

  if (!isOpen) return null;

  return (
    <Dialog
      isOpen={isOpen}
      title={t("dialogs.titles.provincesEditor")}
      onClose={() => closeDialog("provincesEditor")}
      className="fmg-dialog--table"
    >
      <div id="provincesEditorContainer">
        <ProvincesTable
          provinces={sortedProvinces}
          sortBy={sortBy}
          sortDirection={sortDirection}
          onSort={provincesEditorActions.changeSort}
          isPercentageMode={isPercentageMode}
          totalArea={totalArea}
          totalPopulation={totalPopulation}
          totalBurgs={totalBurgs}
          customization={customization}
        />

        <div id="provincesFooter" className="footer">
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
