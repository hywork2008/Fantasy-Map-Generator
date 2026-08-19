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

import { open as openEmploymentOverview, refreshEmploymentOverview } from "../../controllers/employment-overview";
import { type EmploymentOverviewRow, useEmploymentOverviewState } from "../../store/employmentOverviewState";

type SortField = keyof Pick<
  EmploymentOverviewRow,
  | "burgName"
  | "stateName"
  | "administration"
  | "mining"
  | "smelting"
  | "trade"
  | "strategicIndustry"
  | "craft"
  | "construction"
  | "dwellings"
  | "requiredDwellings"
  | "housingGapPct"
  | "underConstruction"
  | "constructionJobsOpen"
  | "householdCare"
  | "marketLaborForce"
  | "laborResidual"
  | "marketUnemploymentPct"
  | "employmentFocus"
  | "basicEmploymentDemand"
  | "serviceEmploymentDemand"
  | "employmentDemand"
>;

const TEXT_SORT_FIELDS = new Set<SortField>(["burgName", "stateName", "employmentFocus"]);

const COLUMNS: { field: SortField; labelKey: string; tipKey: string; numeric?: boolean }[] = [
  { field: "burgName", labelKey: "burg", tipKey: "burgTip" },
  { field: "stateName", labelKey: "state", tipKey: "stateTip" },
  { field: "administration", labelKey: "admin", tipKey: "adminTip", numeric: true },
  { field: "mining", labelKey: "mining", tipKey: "miningTip", numeric: true },
  { field: "smelting", labelKey: "smelting", tipKey: "smeltingTip", numeric: true },
  { field: "trade", labelKey: "trade", tipKey: "tradeTip", numeric: true },
  { field: "strategicIndustry", labelKey: "industry", tipKey: "industryTip", numeric: true },
  { field: "craft", labelKey: "craft", tipKey: "craftTip", numeric: true },
  { field: "construction", labelKey: "construction", tipKey: "constructionTip", numeric: true },
  { field: "dwellings", labelKey: "dwellings", tipKey: "dwellingsTip", numeric: true },
  { field: "requiredDwellings", labelKey: "need", tipKey: "needTip", numeric: true },
  { field: "housingGapPct", labelKey: "gap", tipKey: "gapTip", numeric: true },
  { field: "underConstruction", labelKey: "building", tipKey: "buildingTip", numeric: true },
  { field: "constructionJobsOpen", labelKey: "jobs", tipKey: "jobsTip", numeric: true },
  { field: "householdCare", labelKey: "care", tipKey: "careTip", numeric: true },
  { field: "marketLaborForce", labelKey: "market", tipKey: "marketTip", numeric: true },
  { field: "laborResidual", labelKey: "residual", tipKey: "residualTip", numeric: true },
  { field: "marketUnemploymentPct", labelKey: "uPct", tipKey: "uPctTip", numeric: true },
  { field: "employmentFocus", labelKey: "focus", tipKey: "focusTip" },
  { field: "basicEmploymentDemand", labelKey: "basic", tipKey: "basicTip", numeric: true },
  { field: "serviceEmploymentDemand", labelKey: "service", tipKey: "serviceTip", numeric: true },
  { field: "employmentDemand", labelKey: "total", tipKey: "totalTip", numeric: true }
];

export const EmploymentOverviewDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("employmentOverview"));
  const rawRows = useEmploymentOverviewState(state => state.rows);

  const parentRef = React.useRef<HTMLDivElement>(null);
  const [sortBy, setSortBy] = React.useState<SortField>("laborResidual");
  const [sortOrder, setSortOrder] = React.useState<"asc" | "desc">("desc");
  const [filterBurgId, setFilterBurgId] = React.useState<number | null>(null);
  const [filterStateId, setFilterStateId] = React.useState<number | null>(null);

  const toggleSortBy = (field: string) => {
    const nextField = field as SortField;
    if (nextField === sortBy) {
      setSortOrder(order => (order === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(nextField);
      setSortOrder(TEXT_SORT_FIELDS.has(nextField) ? "asc" : "desc");
    }
  };

  React.useEffect(() => {
    if (isOpen) setTimeout(() => openEmploymentOverview(), 0);
  }, [isOpen]);

  const stateOptions = React.useMemo(
    () =>
      [...new Map(rawRows.map(row => [row.stateId, { id: row.stateId, name: row.stateName }])).values()].sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
    [rawRows]
  );
  const burgOptions = React.useMemo(() => {
    const source = filterStateId === null ? rawRows : rawRows.filter(row => row.stateId === filterStateId);
    return [...new Map(source.map(row => [row.burgId, { id: row.burgId, name: row.burgName }])).values()].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [filterStateId, rawRows]);

  React.useEffect(() => {
    if (filterBurgId !== null && !burgOptions.some(option => option.id === filterBurgId)) setFilterBurgId(null);
    if (filterStateId !== null && !stateOptions.some(option => option.id === filterStateId)) setFilterStateId(null);
  }, [burgOptions, filterBurgId, filterStateId, stateOptions]);

  const rows = React.useMemo(() => {
    return rawRows
      .filter(row => {
        if (filterBurgId !== null && row.burgId !== filterBurgId) return false;
        if (filterStateId !== null && row.stateId !== filterStateId) return false;
        return true;
      })
      .sort((a, b) => {
        const valA = a[sortBy];
        const valB = b[sortBy];
        const cmp = typeof valA === "string" ? valA.localeCompare(valB as string) : (valA as number) - (valB as number);
        return sortOrder === "asc" ? cmp : -cmp;
      });
  }, [filterBurgId, filterStateId, rawRows, sortBy, sortOrder]);

  const totalEmploymentDemand = rows.reduce((sum, row) => sum + row.employmentDemand, 0);
  const totalResidual = rows.reduce((sum, row) => sum + Math.max(0, row.laborResidual), 0);
  const highUnemployment = rows.filter(row => row.marketUnemploymentPct >= 20).length;
  const totalConstructionJobs = rows.reduce((sum, row) => sum + row.constructionJobsOpen, 0);

  return (
    <Dialog
      isOpen={isOpen}
      title={t("extensions.titles.employmentOverview")}
      onClose={() => closeDialog("employmentOverview")}
      className="fmg-dialog--table"
    >
      <TableDialogLayout
        bodyRef={parentRef}
        controls={
          <div
            id="employmentOverviewFilters"
            data-tip={t("extensions.employmentOverview.filterTip")}
            className="d-flex"
          >
            <label htmlFor="employmentOverviewFilterState">
              {t("extensions.employmentOverview.stateFilter")}
              <select
                id="employmentOverviewFilterState"
                value={filterStateId ?? ""}
                onChange={event => setFilterStateId(event.target.value === "" ? null : Number(event.target.value))}
              >
                <option value="">{t("extensions.employmentOverview.all")}</option>
                {stateOptions.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="employmentOverviewFilterBurg">
              {t("extensions.employmentOverview.burgFilter")}
              <select
                id="employmentOverviewFilterBurg"
                value={filterBurgId ?? ""}
                onChange={event => setFilterBurgId(event.target.value === "" ? null : Number(event.target.value))}
              >
                <option value="">{t("extensions.employmentOverview.all")}</option>
                {burgOptions.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        }
        summary={
          <div className="totalLine">
            <span data-tip={t("extensions.employmentOverview.countTip")}>
              {t("extensions.employmentOverview.count")}{" "}
              <span id="employmentOverviewCount">
                {t("extensions.employmentOverview.countValue", { shown: rows.length, total: rawRows.length })}
              </span>
            </span>
            {" · "}
            <span data-tip={t("extensions.employmentOverview.totalDemandTip")}>
              {t("extensions.employmentOverview.totalDemand")}{" "}
              <span id="employmentOverviewTotal">{totalEmploymentDemand.toFixed(1)}</span>
            </span>
            {" · "}
            <span data-tip={t("extensions.employmentOverview.residualLaborTip")}>
              {t("extensions.employmentOverview.residualLabor")}{" "}
              <span id="employmentOverviewResidual">{totalResidual.toFixed(1)}</span>
            </span>
            {" · "}
            <span data-tip={t("extensions.employmentOverview.highUTip")}>
              {t("extensions.employmentOverview.highU")} <span id="employmentOverviewHighU">{highUnemployment}</span>
            </span>
            {" · "}
            <span data-tip={t("extensions.employmentOverview.constructionJobsTip")}>
              {t("extensions.employmentOverview.constructionJobs")}{" "}
              <span id="employmentOverviewConstructionJobs">{totalConstructionJobs}</span>
            </span>
          </div>
        }
        footer={
          <button
            type="button"
            id="employmentOverviewRefresh"
            data-tip={t("extensions.employmentOverview.refreshTip")}
            className="icon-cw"
            onClick={refreshEmploymentOverview}
          />
        }
      >
        <table className="fmg-table">
          <colgroup>
            {COLUMNS.map(column => (
              <col key={column.field} />
            ))}
          </colgroup>
          <thead className="header">
            <tr>
              {COLUMNS.map(column => (
                <SortableHeader
                  key={column.field}
                  field={column.field}
                  label={t(`extensions.employmentOverview.${column.labelKey}`)}
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={toggleSortBy}
                  numeric={column.numeric}
                  className={column.numeric ? "numeric" : undefined}
                  tip={t(`extensions.employmentOverview.${column.tipKey}`)}
                />
              ))}
            </tr>
          </thead>
          {rows.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={COLUMNS.length}>
                  <span>
                    {rawRows.length
                      ? t("extensions.employmentOverview.emptyFiltered")
                      : t("extensions.employmentOverview.empty")}
                  </span>
                </td>
              </tr>
            </tbody>
          ) : (
            <VirtualTableBody
              items={rows}
              scrollElementRef={parentRef}
              renderRow={(row: EmploymentOverviewRow) => <EmploymentRow key={row.id} row={row} />}
            />
          )}
        </table>
      </TableDialogLayout>
    </Dialog>
  );
};

const EmploymentRow: React.FC<{ row: EmploymentOverviewRow }> = ({ row }) => {
  const { t } = useTranslation();
  return (
    <tr className="states" data-id={row.id} data-burg={row.burgName}>
      <td data-tip={row.burgName}>
        {row.isCapital && <i className="icon-star" data-tip={t("extensions.employmentOverview.capital")} />}{" "}
        {row.burgName}
      </td>
      <td>{row.stateName}</td>
      <td className="numeric">{row.administration || ""}</td>
      <td className="numeric">{row.mining || ""}</td>
      <td className="numeric">{row.smelting || ""}</td>
      <td className="numeric">{row.trade || ""}</td>
      <td className="numeric">{row.strategicIndustry || ""}</td>
      <td className="numeric">{row.craft || ""}</td>
      <td className="numeric">{row.construction || ""}</td>
      <td
        className="numeric"
        data-tip={
          row.requiredDwellings > 0
            ? t("extensions.employmentOverview.dwellingsBuilt", {
                built: row.dwellings,
                required: row.requiredDwellings
              })
            : t("extensions.employmentOverview.noHousing")
        }
      >
        {row.requiredDwellings > 0 ? Math.round(row.dwellings) : ""}
      </td>
      <td
        className="numeric"
        data-tip={row.requiredDwellings > 0 ? t("extensions.employmentOverview.requiredDwellings") : ""}
      >
        {row.requiredDwellings || ""}
      </td>
      <td
        className="numeric"
        data-tip={
          row.requiredDwellings > 0 ? t("extensions.employmentOverview.gapPctTip", { pct: row.housingGapPct }) : ""
        }
      >
        {row.requiredDwellings > 0 ? `${row.housingGapPct}%` : ""}
      </td>
      <td
        className="numeric"
        data-tip={row.underConstruction > 0 ? t("extensions.employmentOverview.underConstruction") : ""}
      >
        {row.underConstruction > 0 ? row.underConstruction : ""}
      </td>
      <td
        className="numeric"
        data-tip={
          row.constructionJobsOpen > 0
            ? t("extensions.employmentOverview.jobsOpen", { count: row.constructionJobsOpen })
            : ""
        }
      >
        {row.constructionJobsOpen > 0 ? row.constructionJobsOpen : ""}
      </td>
      <td className="numeric" data-tip={row.householdCare > 0 ? t("extensions.employmentOverview.careBand") : ""}>
        {row.householdCare > 0 ? row.householdCare : ""}
      </td>
      <td
        className="numeric"
        data-tip={row.marketLaborForce > 0 ? t("extensions.employmentOverview.marketAdults") : ""}
      >
        {row.marketLaborForce > 0 ? row.marketLaborForce : ""}
      </td>
      <td
        className="numeric"
        data-tip={
          row.marketLaborForce > 0
            ? t("extensions.employmentOverview.residualOf", {
                residual: row.laborResidual,
                force: row.marketLaborForce
              })
            : t("extensions.employmentOverview.noLabor")
        }
      >
        {row.marketLaborForce > 0 ? row.laborResidual : ""}
      </td>
      <td
        className="numeric"
        data-tip={row.marketLaborForce > 0 ? t("extensions.employmentOverview.unemployment") : ""}
      >
        {row.marketLaborForce > 0 ? `${row.marketUnemploymentPct}%` : ""}
      </td>
      <td data-tip={row.employmentFocus !== "—" ? row.employmentFocus : ""}>
        {row.employmentFocus !== "—" ? row.employmentFocus : ""}
      </td>
      <td className="numeric">{row.basicEmploymentDemand || ""}</td>
      <td className="numeric">{row.serviceEmploymentDemand || ""}</td>
      <td className="numeric">
        <strong>{row.employmentDemand || ""}</strong>
      </td>
    </tr>
  );
};
