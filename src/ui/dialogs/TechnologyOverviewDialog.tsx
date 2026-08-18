import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { zoomTo } from "../../actions";
import {
  collectTechnologyOverviewRows,
  summarizeAtmosphericSteamPumping,
  type TechnologyOverviewRow
} from "../../generators/technologyOverview";
import { TECHNOLOGY_STAGES, type TechnologyEraBand, type TechnologyStage } from "../../generators/technologyTypes";
import { useDialogState } from "../../store/dialogState";
import { useTechnologyOverviewState } from "../../store/technologyOverviewState";
import { IconButton } from "../components/IconButton";
import { SortableHeader } from "../components/tables/SortableHeader";
import { VirtualTableBody } from "../components/VirtualTableBody";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";
import { TableDialogLayout } from "./TableDialogLayout";

type SortField = keyof Pick<
  TechnologyOverviewRow,
  | "stateName"
  | "technologyLabel"
  | "era"
  | "stageRank"
  | "discoveredYear"
  | "demonstratedYear"
  | "adoptedYear"
  | "diffusion"
>;

const ERA_OPTIONS: readonly TechnologyEraBand[] = [0, 1, 2, 3, 4, 5];

function formatYear(year: number | null): string {
  return year === null ? "—" : String(year);
}

export const TechnologyOverviewDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("technologyOverview"));
  const refreshCounter = useTechnologyOverviewState(state => state.refreshCounter);
  const refresh = useTechnologyOverviewState(state => state.refresh);
  const parentRef = useRef<HTMLDivElement>(null);

  const [sortBy, setSortBy] = useState<SortField>("era");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [filterStateId, setFilterStateId] = useState<number | null>(null);
  const [filterEra, setFilterEra] = useState<TechnologyEraBand | null>(null);
  const [filterStage, setFilterStage] = useState<TechnologyStage | null>(null);
  const [hideBaseline, setHideBaseline] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    const onAdvanced = () => refresh();
    document.addEventListener("fmg:time-advanced", onAdvanced);
    document.addEventListener("fmg:simulation-updated", onAdvanced);
    return () => {
      document.removeEventListener("fmg:time-advanced", onAdvanced);
      document.removeEventListener("fmg:simulation-updated", onAdvanced);
    };
  }, [isOpen, refresh]);

  const rawRows = useMemo(() => {
    void refreshCounter;
    if (!isOpen) return [];
    return collectTechnologyOverviewRows();
  }, [isOpen, refreshCounter]);

  const steam = useMemo(() => summarizeAtmosphericSteamPumping(rawRows), [rawRows]);

  const stateOptions = useMemo(
    () =>
      [...new Map(rawRows.map(row => [row.stateId, { id: row.stateId, name: row.stateName }])).values()].sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
    [rawRows]
  );

  useEffect(() => {
    if (filterStateId !== null && !stateOptions.some(option => option.id === filterStateId)) setFilterStateId(null);
  }, [filterStateId, stateOptions]);

  const rows = useMemo(() => {
    return rawRows
      .filter(row => {
        if (hideBaseline && row.era === 0) return false;
        if (filterStateId !== null && row.stateId !== filterStateId) return false;
        if (filterEra !== null && row.era !== filterEra) return false;
        if (filterStage !== null && row.stage !== filterStage) return false;
        return true;
      })
      .sort((a, b) => {
        const valA = a[sortBy];
        const valB = b[sortBy];
        const cmp =
          typeof valA === "string" ? valA.localeCompare(valB as string) : (Number(valA) || 0) - (Number(valB) || 0);
        if (cmp !== 0) return sortOrder === "asc" ? cmp : -cmp;
        return a.technologyLabel.localeCompare(b.technologyLabel);
      });
  }, [filterEra, filterStage, filterStateId, hideBaseline, rawRows, sortBy, sortOrder]);

  const toggleSortBy = (field: string) => {
    if (field === sortBy) {
      setSortOrder(order => (order === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field as SortField);
      setSortOrder(field === "stateName" || field === "technologyLabel" ? "asc" : "desc");
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog
      isOpen={isOpen}
      title={t("dialogs.titles.technologyOverview")}
      onClose={() => closeDialog("technologyOverview")}
      className="fmg-dialog--table"
    >
      <TableDialogLayout
        bodyRef={parentRef}
        header={
          <p className="technology-overview-dialog__description" data-tip={t("dialogs.technology.headingTip")}>
            {t("dialogs.technology.heading")}
          </p>
        }
        controls={
          <div id="technologyOverviewFilters" className="d-flex" data-tip={t("dialogs.technology.filterTip")}>
            <label htmlFor="technologyOverviewFilterState">
              {t("dialogs.technology.state")}
              <select
                id="technologyOverviewFilterState"
                value={filterStateId ?? ""}
                onChange={event => setFilterStateId(event.target.value === "" ? null : Number(event.target.value))}
              >
                <option value="">{t("dialogs.technology.all")}</option>
                {stateOptions.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="technologyOverviewFilterEra">
              {t("dialogs.technology.era")}
              <select
                id="technologyOverviewFilterEra"
                value={filterEra ?? ""}
                onChange={event =>
                  setFilterEra(event.target.value === "" ? null : (Number(event.target.value) as TechnologyEraBand))
                }
              >
                <option value="">{t("dialogs.technology.all")}</option>
                {ERA_OPTIONS.map(era => (
                  <option key={era} value={era}>
                    {t(`dialogs.technology.eras.${era}`)}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="technologyOverviewFilterStage">
              {t("dialogs.technology.stage")}
              <select
                id="technologyOverviewFilterStage"
                value={filterStage ?? ""}
                onChange={event =>
                  setFilterStage(event.target.value === "" ? null : (event.target.value as TechnologyStage))
                }
              >
                <option value="">{t("dialogs.technology.all")}</option>
                {TECHNOLOGY_STAGES.map(stage => (
                  <option key={stage} value={stage}>
                    {t(`dialogs.technology.stages.${stage}`)}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="technologyOverviewHideBaseline">
              <input
                id="technologyOverviewHideBaseline"
                type="checkbox"
                checked={hideBaseline}
                onChange={event => setHideBaseline(event.target.checked)}
              />{" "}
              {t("dialogs.technology.hideBaseline")}
            </label>
          </div>
        }
        summary={
          <div className="totalLine">
            <span data-tip={t("dialogs.technology.countTip")}>
              {t("dialogs.technology.count")}{" "}
              <span id="technologyOverviewCount">
                {t("dialogs.technology.countValue", { shown: rows.length, total: rawRows.length })}
              </span>
            </span>
            {" · "}
            <span data-tip={t("dialogs.technology.steamTip")}>
              {t("dialogs.technology.steam")}{" "}
              <span id="technologyOverviewSteam">
                {t("dialogs.technology.steamValue", {
                  known: steam.known,
                  demonstrated: steam.demonstrated,
                  adopted: steam.adopted,
                  diffused: steam.diffused,
                  states: steam.states
                })}
              </span>
            </span>
          </div>
        }
        footer={
          <button
            type="button"
            id="technologyOverviewRefresh"
            data-tip={t("dialogs.technology.refreshTip")}
            className="icon-cw"
            onClick={refresh}
          />
        }
      >
        <table className="fmg-table">
          <thead className="header">
            <tr>
              <SortableHeader
                field="stateName"
                label={t("dialogs.technology.stateCol")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                tip={t("dialogs.technology.stateColTip")}
              />
              <SortableHeader
                field="technologyLabel"
                label={t("dialogs.technology.technologyCol")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                tip={t("dialogs.technology.technologyColTip")}
              />
              <SortableHeader
                field="era"
                label={t("dialogs.technology.eraCol")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                tip={t("dialogs.technology.eraColTip")}
              />
              <SortableHeader
                field="stageRank"
                label={t("dialogs.technology.stageCol")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                tip={t("dialogs.technology.stageColTip")}
              />
              <SortableHeader
                field="discoveredYear"
                label={t("dialogs.technology.knownYear")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("dialogs.technology.knownYearTip")}
              />
              <SortableHeader
                field="demonstratedYear"
                label={t("dialogs.technology.demonstratedYear")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("dialogs.technology.demonstratedYearTip")}
              />
              <SortableHeader
                field="adoptedYear"
                label={t("dialogs.technology.adoptedYear")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("dialogs.technology.adoptedYearTip")}
              />
              <SortableHeader
                field="diffusion"
                label={t("dialogs.technology.diffusion")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("dialogs.technology.diffusionTip")}
              />
            </tr>
          </thead>
          {rows.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={8}>
                  <span>{rawRows.length ? t("dialogs.technology.emptyFiltered") : t("dialogs.technology.empty")}</span>
                </td>
              </tr>
            </tbody>
          ) : (
            <VirtualTableBody
              items={rows}
              scrollElementRef={parentRef}
              renderRow={(row: TechnologyOverviewRow) => <TechnologyRow key={row.id} row={row} />}
            />
          )}
        </table>
      </TableDialogLayout>
    </Dialog>
  );
};

const TechnologyRow: React.FC<{ row: TechnologyOverviewRow }> = ({ row }) => {
  const { t } = useTranslation();
  const canZoom = row.capitalX !== null && row.capitalY !== null;
  return (
    <tr
      className="states"
      data-id={row.id}
      data-technology={row.technologyId}
      data-stage={row.stage}
      data-steam={row.technologyId === "atmosphericSteamPumping" ? "1" : "0"}
    >
      <td className="d-flex">
        {canZoom ? (
          <IconButton
            data-tip={t("dialogs.technology.zoomTip")}
            className="icon-dot-circled pointer"
            onClick={() => zoomTo(row.capitalX as number, row.capitalY as number, 8, 2000)}
          />
        ) : null}
        <span data-tip={row.stateName}>{row.stateName}</span>
      </td>
      <td>{row.technologyLabel}</td>
      <td>{t(`dialogs.technology.eras.${row.era}`)}</td>
      <td>{t(`dialogs.technology.stages.${row.stage}`)}</td>
      <td className="numeric">{formatYear(row.discoveredYear)}</td>
      <td className="numeric">{formatYear(row.demonstratedYear)}</td>
      <td className="numeric">{formatYear(row.adoptedYear)}</td>
      <td className="numeric">{row.stageRank >= 3 ? `${Math.round(row.diffusion * 100)}%` : "—"}</td>
    </tr>
  );
};
