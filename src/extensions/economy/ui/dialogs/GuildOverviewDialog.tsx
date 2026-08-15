import React from "react";
import { useTranslation } from "react-i18next";

import {
  closeDialog,
  Dialog,
  IconButton,
  SortableHeader,
  TableDialogLayout,
  useDialogState,
  VirtualTableBody
} from "../../../hostUi";

import { open as openGuildOverview, refreshGuildOverview } from "../../controllers/guild-overview";
import { getApi } from "../../economyContext";
import { type GuildOverviewRow, useGuildOverviewState } from "../../store/guildOverviewState";

type SortField = keyof Pick<
  GuildOverviewRow,
  "burgName" | "stateName" | "domain" | "status" | "stock" | "bonus" | "treasury"
>;

export const GuildOverviewDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("guildOverview"));
  const rawRows = useGuildOverviewState(state => state.rows);

  const parentRef = React.useRef<HTMLDivElement>(null);
  const [sortBy, setSortBy] = React.useState<SortField>("stock");
  const [sortOrder, setSortOrder] = React.useState<"asc" | "desc">("desc");
  const [filterBurgId, setFilterBurgId] = React.useState<number | null>(null);
  const [filterStateId, setFilterStateId] = React.useState<number | null>(null);
  const [filterDomain, setFilterDomain] = React.useState<GuildOverviewRow["domain"] | null>(null);

  const toggleSortBy = (field: string) => {
    if (field === sortBy) {
      setSortOrder(order => (order === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field as SortField);
      setSortOrder("desc");
    }
  };

  React.useEffect(() => {
    if (isOpen) setTimeout(() => openGuildOverview(), 0);
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
  const domainOptions = React.useMemo(
    () => [...new Set(rawRows.map(row => row.domain))].sort((a, b) => a.localeCompare(b)),
    [rawRows]
  );

  React.useEffect(() => {
    if (filterBurgId !== null && !burgOptions.some(option => option.id === filterBurgId)) setFilterBurgId(null);
    if (filterStateId !== null && !stateOptions.some(option => option.id === filterStateId)) setFilterStateId(null);
    if (filterDomain !== null && !domainOptions.includes(filterDomain)) setFilterDomain(null);
  }, [burgOptions, domainOptions, filterBurgId, filterDomain, filterStateId, stateOptions]);

  const rows = React.useMemo(() => {
    return rawRows
      .filter(row => {
        if (filterBurgId !== null && row.burgId !== filterBurgId) return false;
        if (filterStateId !== null && row.stateId !== filterStateId) return false;
        if (filterDomain !== null && row.domain !== filterDomain) return false;
        return true;
      })
      .sort((a, b) => {
        const valA = a[sortBy];
        const valB = b[sortBy];
        const cmp = typeof valA === "string" ? valA.localeCompare(valB as string) : (valA as number) - (valB as number);
        return sortOrder === "asc" ? cmp : -cmp;
      });
  }, [filterBurgId, filterDomain, filterStateId, rawRows, sortBy, sortOrder]);

  const totalTreasury = rows.reduce((sum, row) => sum + row.treasury, 0);

  return (
    <Dialog
      isOpen={isOpen}
      title={t("extensions.titles.guildOverview")}
      onClose={() => closeDialog("guildOverview")}
      className="fmg-dialog--table"
    >
      <TableDialogLayout
        bodyRef={parentRef}
        controls={
          <div id="guildOverviewFilters" data-tip="Filter guild technique stocks" className="d-flex">
            <label htmlFor="guildOverviewFilterBurg">
              Burg:
              <select
                id="guildOverviewFilterBurg"
                value={filterBurgId ?? ""}
                onChange={event => setFilterBurgId(event.target.value === "" ? null : Number(event.target.value))}
              >
                <option value="">all</option>
                {burgOptions.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="guildOverviewFilterState">
              State:
              <select
                id="guildOverviewFilterState"
                value={filterStateId ?? ""}
                onChange={event => setFilterStateId(event.target.value === "" ? null : Number(event.target.value))}
              >
                <option value="">all</option>
                {stateOptions.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="guildOverviewFilterDomain">
              Domain:
              <select
                id="guildOverviewFilterDomain"
                value={filterDomain ?? ""}
                onChange={event =>
                  setFilterDomain(event.target.value === "" ? null : (event.target.value as GuildOverviewRow["domain"]))
                }
              >
                <option value="">all</option>
                {domainOptions.map(domain => (
                  <option key={domain} value={domain}>
                    {domain}
                  </option>
                ))}
              </select>
            </label>
          </div>
        }
        summary={
          <div className="totalLine">
            <span data-tip="Guild technique stocks displayed after filtering">
              Guild stocks:{" "}
              <span id="guildOverviewCount">
                {rows.length} of {rawRows.length}
              </span>
            </span>
            {" · "}
            <span data-tip="Sum of every listed guild technique stock's private treasury">
              Total guild treasury: <span id="guildOverviewTotal">{totalTreasury.toFixed(1)}</span>
            </span>
          </div>
        }
        footer={
          <button
            type="button"
            id="guildOverviewRefresh"
            data-tip="Refresh the Guild Overview"
            className="icon-cw"
            onClick={refreshGuildOverview}
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
          </colgroup>
          <thead className="header">
            <tr>
              <SortableHeader
                field="burgName"
                label="Burg"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                tip="Burg hosting this guild technique stock"
              />
              <SortableHeader
                field="stateName"
                label="State"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                tip="Owning state"
              />
              <SortableHeader
                field="domain"
                label="Domain"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                tip="Craft-domain guild (metallurgy, woodworking, masonry, textiles, leather, glassware, instruments, printing)"
              />
              <SortableHeader
                field="status"
                label="Status"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                tip="Formal chapter or informal craft-practitioner stock"
              />
              <SortableHeader
                field="stock"
                label="Technique"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="0..1 accumulated technique (saturating EWMA driven by staffed practitioners)"
              />
              <SortableHeader
                field="bonus"
                label="Bonus"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="1 + technique bonus applied to this domain's manufacturing efficiency"
              />
              <SortableHeader
                field="treasury"
                label="Treasury"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="Guild's own private capital, independent of burg.treasury"
              />
            </tr>
          </thead>
          {rows.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={7}>
                  <span>
                    {rawRows.length
                      ? "No guild stocks match the selected filters"
                      : "No Burg has an active guild technique stock yet"}
                  </span>
                </td>
              </tr>
            </tbody>
          ) : (
            <VirtualTableBody
              items={rows}
              scrollElementRef={parentRef}
              renderRow={(row: GuildOverviewRow) => <GuildRow key={row.id} row={row} />}
            />
          )}
        </table>
      </TableDialogLayout>
    </Dialog>
  );
};

const GuildRow: React.FC<{ row: GuildOverviewRow }> = ({ row }) => (
  <tr className="states" data-id={row.id} data-burg={row.burgName}>
    <td className="d-flex">
      <IconButton
        data-tip="Click to zoom into view"
        className="icon-dot-circled pointer"
        onClick={() => {
          const burg = getApi().worldContext.pack.burgs[row.burgId];
          if (burg) getApi().zoomTo(burg.x, burg.y, 8, 2000);
        }}
      />
      <span data-tip={row.burgName}>{row.burgName}</span>
    </td>
    <td>{row.stateName}</td>
    <td>{row.domain}</td>
    <td>{row.status === "chapter" ? "Chapter" : "Informal"}</td>
    <td className="numeric">{row.stock.toFixed(3)}</td>
    <td className="numeric">{row.bonus.toFixed(3)}</td>
    <td className="numeric">{row.treasury.toFixed(2)}</td>
  </tr>
);
