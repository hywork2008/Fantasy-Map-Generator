import React from "react";
import { useTranslation } from "react-i18next";

import { closeDialog, Dialog, TableDialogLayout, useDialogState, VirtualTableBody } from "../../../hostUi";

import { open as openEmploymentOverview, refreshEmploymentOverview } from "../../controllers/employment-overview";
import { type EmploymentOverviewRow, useEmploymentOverviewState } from "../../store/employmentOverviewState";

export const EmploymentOverviewDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("employmentOverview"));
  const rows = useEmploymentOverviewState(state => state.rows);

  const parentRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (isOpen) setTimeout(() => openEmploymentOverview(), 0);
  }, [isOpen]);

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
        summary={
          <div className="totalLine">
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
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
          </colgroup>
          <thead className="header">
            <tr>
              <th data-tip={t("extensions.employmentOverview.burgTip")}>{t("extensions.employmentOverview.burg")}</th>
              <th data-tip={t("extensions.employmentOverview.stateTip")}>{t("extensions.employmentOverview.state")}</th>
              <th className="numeric" data-tip={t("extensions.employmentOverview.adminTip")}>
                {t("extensions.employmentOverview.admin")}
              </th>
              <th className="numeric" data-tip={t("extensions.employmentOverview.miningTip")}>
                {t("extensions.employmentOverview.mining")}
              </th>
              <th className="numeric" data-tip={t("extensions.employmentOverview.smeltingTip")}>
                {t("extensions.employmentOverview.smelting")}
              </th>
              <th className="numeric" data-tip={t("extensions.employmentOverview.tradeTip")}>
                {t("extensions.employmentOverview.trade")}
              </th>
              <th className="numeric" data-tip={t("extensions.employmentOverview.industryTip")}>
                {t("extensions.employmentOverview.industry")}
              </th>
              <th className="numeric" data-tip={t("extensions.employmentOverview.craftTip")}>
                {t("extensions.employmentOverview.craft")}
              </th>
              <th className="numeric" data-tip={t("extensions.employmentOverview.constructionTip")}>
                {t("extensions.employmentOverview.construction")}
              </th>
              <th className="numeric" data-tip={t("extensions.employmentOverview.dwellingsTip")}>
                {t("extensions.employmentOverview.dwellings")}
              </th>
              <th className="numeric" data-tip={t("extensions.employmentOverview.needTip")}>
                {t("extensions.employmentOverview.need")}
              </th>
              <th className="numeric" data-tip={t("extensions.employmentOverview.gapTip")}>
                {t("extensions.employmentOverview.gap")}
              </th>
              <th className="numeric" data-tip={t("extensions.employmentOverview.buildingTip")}>
                {t("extensions.employmentOverview.building")}
              </th>
              <th className="numeric" data-tip={t("extensions.employmentOverview.jobsTip")}>
                {t("extensions.employmentOverview.jobs")}
              </th>
              <th className="numeric" data-tip={t("extensions.employmentOverview.careTip")}>
                {t("extensions.employmentOverview.care")}
              </th>
              <th className="numeric" data-tip={t("extensions.employmentOverview.marketTip")}>
                {t("extensions.employmentOverview.market")}
              </th>
              <th className="numeric" data-tip={t("extensions.employmentOverview.residualTip")}>
                {t("extensions.employmentOverview.residual")}
              </th>
              <th className="numeric" data-tip={t("extensions.employmentOverview.uPctTip")}>
                {t("extensions.employmentOverview.uPct")}
              </th>
              <th data-tip={t("extensions.employmentOverview.focusTip")}>{t("extensions.employmentOverview.focus")}</th>
              <th className="numeric" data-tip={t("extensions.employmentOverview.basicTip")}>
                {t("extensions.employmentOverview.basic")}
              </th>
              <th className="numeric" data-tip={t("extensions.employmentOverview.serviceTip")}>
                {t("extensions.employmentOverview.service")}
              </th>
              <th className="numeric" data-tip={t("extensions.employmentOverview.totalTip")}>
                {t("extensions.employmentOverview.total")}
              </th>
            </tr>
          </thead>
          {rows.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={22}>
                  <span>{t("extensions.employmentOverview.empty")}</span>
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
