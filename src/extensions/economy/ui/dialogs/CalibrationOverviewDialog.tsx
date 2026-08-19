import React from "react";
import { useTranslation } from "react-i18next";

import {
  closeDialog,
  Dialog,
  SortableHeader,
  TableDialogLayout,
  useDialogState,
  VirtualTableBody
} from "../../../hostUi";

import { open as openCalibrationOverview, refreshCalibrationOverview } from "../../controllers/calibrationOverview";
import { type CalibrationOverviewRow, useCalibrationOverviewState } from "../../store/calibrationOverviewState";

type SortField = keyof Pick<
  CalibrationOverviewRow,
  | "burgName"
  | "stateName"
  | "pool"
  | "displayPeople"
  | "laborPeople"
  | "expectedPeople"
  | "expectedPoints"
  | "actualWorkerPoints"
  | "actualPeople"
  | "demandLots"
  | "laborFromAuthoredLots"
  | "guildCoverage"
  | "stock"
>;

const TEXT_SORT = new Set<SortField>(["burgName", "stateName", "pool"]);

export const CalibrationOverviewDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("calibrationOverview"));
  const rawRows = useCalibrationOverviewState(state => state.rows);
  const parentRef = React.useRef<HTMLDivElement>(null);
  const [sortBy, setSortBy] = React.useState<SortField>("expectedPeople");
  const [sortOrder, setSortOrder] = React.useState<"asc" | "desc">("desc");
  const [filterBurgId, setFilterBurgId] = React.useState<number | null>(null);
  const [filterStateId, setFilterStateId] = React.useState<number | null>(null);
  const [filterPool, setFilterPool] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const toggleSortBy = (field: string) => {
    const next = field as SortField;
    if (next === sortBy) setSortOrder(order => (order === "asc" ? "desc" : "asc"));
    else {
      setSortBy(next);
      setSortOrder(TEXT_SORT.has(next) ? "asc" : "desc");
    }
  };

  React.useEffect(() => {
    if (isOpen) setTimeout(() => openCalibrationOverview(), 0);
  }, [isOpen]);

  const burgOptions = React.useMemo(
    () =>
      [...new Map(rawRows.map(row => [row.burgId, { id: row.burgId, name: row.burgName }])).values()].sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
    [rawRows]
  );
  const stateOptions = React.useMemo(
    () =>
      [...new Map(rawRows.map(row => [row.stateId, { id: row.stateId, name: row.stateName }])).values()].sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
    [rawRows]
  );
  const poolOptions = React.useMemo(
    () => [...new Set(rawRows.map(row => row.pool))].sort((a, b) => a.localeCompare(b)),
    [rawRows]
  );

  React.useEffect(() => {
    if (filterBurgId !== null && !burgOptions.some(option => option.id === filterBurgId)) setFilterBurgId(null);
    if (filterStateId !== null && !stateOptions.some(option => option.id === filterStateId)) setFilterStateId(null);
    if (filterPool !== null && !poolOptions.includes(filterPool as (typeof poolOptions)[number])) setFilterPool(null);
  }, [burgOptions, filterBurgId, filterPool, filterStateId, poolOptions, stateOptions]);

  const rows = React.useMemo(() => {
    return rawRows
      .filter(row => {
        if (filterBurgId !== null && row.burgId !== filterBurgId) return false;
        if (filterStateId !== null && row.stateId !== filterStateId) return false;
        if (filterPool !== null && row.pool !== filterPool) return false;
        return true;
      })
      .sort((a, b) => {
        const valA = a[sortBy];
        const valB = b[sortBy];
        if (valA == null && valB == null) return 0;
        if (valA == null) return 1;
        if (valB == null) return -1;
        const cmp = typeof valA === "string" ? valA.localeCompare(valB as string) : (valA as number) - (valB as number);
        return sortOrder === "asc" ? cmp : -cmp;
      });
  }, [filterBurgId, filterPool, filterStateId, rawRows, sortBy, sortOrder]);

  const selected = rows.find(row => row.id === selectedId) ?? null;

  const copyJson = () => {
    void navigator.clipboard.writeText(JSON.stringify(rows, null, 2));
  };

  return (
    <Dialog
      isOpen={isOpen}
      title={t("extensions.titles.calibrationOverview")}
      onClose={() => closeDialog("calibrationOverview")}
      className="fmg-dialog--table"
    >
      <TableDialogLayout
        bodyRef={parentRef}
        controls={
          <div id="calibrationOverviewFilters" className="d-flex">
            <label htmlFor="calibrationOverviewFilterState">
              {t("extensions.calibrationOverview.stateFilter")}
              <select
                id="calibrationOverviewFilterState"
                value={filterStateId ?? ""}
                onChange={event => setFilterStateId(event.target.value === "" ? null : Number(event.target.value))}
              >
                <option value="">{t("extensions.calibrationOverview.all")}</option>
                {stateOptions.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="calibrationOverviewFilterBurg">
              {t("extensions.calibrationOverview.burgFilter")}
              <select
                id="calibrationOverviewFilterBurg"
                value={filterBurgId ?? ""}
                onChange={event => setFilterBurgId(event.target.value === "" ? null : Number(event.target.value))}
              >
                <option value="">{t("extensions.calibrationOverview.all")}</option>
                {burgOptions.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="calibrationOverviewFilterPool">
              {t("extensions.calibrationOverview.poolFilter")}
              <select
                id="calibrationOverviewFilterPool"
                value={filterPool ?? ""}
                onChange={event => setFilterPool(event.target.value === "" ? null : event.target.value)}
              >
                <option value="">{t("extensions.calibrationOverview.all")}</option>
                {poolOptions.map(pool => (
                  <option key={pool} value={pool}>
                    {pool}
                  </option>
                ))}
              </select>
            </label>
          </div>
        }
        summary={
          <div className="totalLine">
            <span>
              {t("extensions.calibrationOverview.count")}{" "}
              {t("extensions.calibrationOverview.countValue", { shown: rows.length, total: rawRows.length })}
            </span>
            {" · "}
            <span data-tip={t("extensions.calibrationOverview.noteTip")}>
              {t("extensions.calibrationOverview.note")}
            </span>
          </div>
        }
        footer={
          <>
            <button
              type="button"
              id="calibrationOverviewExport"
              data-tip={t("extensions.calibrationOverview.exportTip")}
              onClick={copyJson}
            >
              {t("extensions.calibrationOverview.export")}
            </button>
            <button
              type="button"
              id="calibrationOverviewRefresh"
              data-tip={t("extensions.calibrationOverview.refreshTip")}
              className="icon-cw"
              onClick={refreshCalibrationOverview}
            />
          </>
        }
      >
        <table className="fmg-table">
          <thead className="header">
            <tr>
              <SortableHeader
                field="burgName"
                label={t("extensions.calibrationOverview.burg")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
              />
              <SortableHeader
                field="stateName"
                label={t("extensions.calibrationOverview.state")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
              />
              <SortableHeader
                field="pool"
                label={t("extensions.calibrationOverview.pool")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
              />
              <SortableHeader
                field="displayPeople"
                label={t("extensions.calibrationOverview.displayPeople")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.calibrationOverview.displayPeopleTip")}
              />
              <SortableHeader
                field="laborPeople"
                label={t("extensions.calibrationOverview.laborPeople")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.calibrationOverview.laborPeopleTip")}
              />
              <SortableHeader
                field="expectedPeople"
                label={t("extensions.calibrationOverview.expectedPeople")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.calibrationOverview.expectedPeopleTip")}
              />
              <SortableHeader
                field="expectedPoints"
                label={t("extensions.calibrationOverview.expectedPoints")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
              />
              <SortableHeader
                field="actualPeople"
                label={t("extensions.calibrationOverview.actualPeople")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.calibrationOverview.actualPeopleTip")}
              />
              <SortableHeader
                field="actualWorkerPoints"
                label={t("extensions.calibrationOverview.actualPoints")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
              />
              <th>{t("extensions.calibrationOverview.ratio")}</th>
              <SortableHeader
                field="demandLots"
                label={t("extensions.calibrationOverview.demandLots")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.calibrationOverview.demandLotsTip")}
              />
              <SortableHeader
                field="laborFromAuthoredLots"
                label={t("extensions.calibrationOverview.authoredLabor")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
              />
              <SortableHeader
                field="guildCoverage"
                label={t("extensions.calibrationOverview.coverage")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.calibrationOverview.coverageTip")}
              />
              <SortableHeader
                field="stock"
                label={t("extensions.calibrationOverview.stock")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
              />
            </tr>
          </thead>
          {rows.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={14}>
                  <span>
                    {rawRows.length
                      ? t("extensions.calibrationOverview.emptyFiltered")
                      : t("extensions.calibrationOverview.empty")}
                  </span>
                </td>
              </tr>
            </tbody>
          ) : (
            <VirtualTableBody
              items={rows}
              scrollElementRef={parentRef}
              renderRow={(row: CalibrationOverviewRow) => (
                <CalibrationRow
                  key={row.id}
                  row={row}
                  selected={row.id === selectedId}
                  onSelect={() => setSelectedId(row.id)}
                />
              )}
            />
          )}
        </table>
        {selected && selected.goods.length > 0 ? (
          <table className="fmg-table" style={{ marginTop: "0.75rem" }}>
            <thead>
              <tr>
                <th>{t("extensions.calibrationOverview.good")}</th>
                <th className="numeric">{t("extensions.calibrationOverview.provenanceLots")}</th>
                <th className="numeric">{t("extensions.calibrationOverview.laborPtLot")}</th>
                <th className="numeric">{t("extensions.calibrationOverview.authoredLabor")}</th>
                <th className="numeric">{t("extensions.calibrationOverview.share")}</th>
              </tr>
            </thead>
            <tbody>
              {selected.goods.map(good => (
                <tr key={good.goodName}>
                  <td>{good.goodName}</td>
                  <td className="numeric">{good.provenanceLots}</td>
                  <td className="numeric">{good.laborPointsPerLot}</td>
                  <td className="numeric">{good.authoredLaborPoints}</td>
                  <td className="numeric">{good.inlandShare}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </TableDialogLayout>
    </Dialog>
  );
};

const CalibrationRow: React.FC<{
  row: CalibrationOverviewRow;
  selected: boolean;
  onSelect: () => void;
}> = ({ row, selected, onSelect }) => (
  <tr className={selected ? "states selected" : "states"} data-id={row.id} onClick={onSelect}>
    <td>{row.burgName}</td>
    <td>{row.stateName}</td>
    <td>{row.pool}</td>
    <td className="numeric">{row.displayPeople}</td>
    <td className="numeric">{row.laborPeople}</td>
    <td className="numeric">{row.expectedPeople}</td>
    <td className="numeric">{row.expectedPoints}</td>
    <td className="numeric">{row.actualPeople}</td>
    <td className="numeric">{row.actualWorkerPoints}</td>
    <td className="numeric">{row.ratio == null ? "—" : row.ratio.toFixed(2)}</td>
    <td className="numeric">{row.demandLots}</td>
    <td className="numeric">{row.laborFromAuthoredLots}</td>
    <td className="numeric">{row.guildCoverage == null ? "—" : row.guildCoverage.toFixed(3)}</td>
    <td className="numeric">{row.stock == null ? "—" : row.stock.toFixed(3)}</td>
  </tr>
);
