import { useVirtualizer } from "@tanstack/react-virtual";
import type React from "react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { SortableHeader } from "../../../../hostUi";
import { formatPrice } from "../../../../hostUtils";
import { formatCharacterAge } from "../../../characterAge";
import type { CharacterRowData } from "../../../controllers/characters-overview";
import { getCharacterEpithetSuffix } from "../../../utils/characterLabels";
import { getCharacterRowStyle } from "../../../utils/personalityUtils";

function SortHeader({
  field,
  label,
  numeric,
  width,
  sortBy,
  sortOrder,
  onSort
}: {
  field: string;
  label: string;
  numeric?: boolean;
  width?: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSort: (_field: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <SortableHeader
      field={field}
      label={label}
      sortBy={sortBy}
      sortOrder={sortOrder}
      onSort={onSort}
      numeric={numeric}
      tip={t("extensions.charactersOverview.sortTip", { field: label.toLowerCase() })}
      style={{ width, minWidth: width }}
    />
  );
}

export interface CharactersTableProps {
  rows: CharacterRowData[];
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSort: (field: string) => void;
  onCharacterClick: (characterId: number) => void;
  /** Fantasy culture sets only — show Race after Wealth. */
  showRace?: boolean;
  /** Fantasy culture sets only — show Arcane after Race. Not a CharacterSkills column. */
  showArcane?: boolean;
  /** CK3 only — show the age-derived Family and Children columns. */
  showFamily?: boolean;
}

export const CharactersTable: React.FC<CharactersTableProps> = ({
  rows,
  sortBy,
  sortOrder,
  onSort,
  onCharacterClick,
  showRace = false,
  showArcane = false,
  showFamily = true
}) => {
  const { t } = useTranslation();
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 5
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0 ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end : 0;
  const colSpan = 8 + Number(showRace) + Number(showArcane) + (showFamily ? 2 : 0);

  return (
    <div className="table" ref={parentRef} style={{ overflow: "auto" }}>
      <table className="fmg-table">
        <thead style={{ zIndex: 3 }}>
          <tr>
            <SortHeader
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={onSort}
              field="name"
              label={t("extensions.charactersOverview.name")}
              width="6em"
            />
            <SortHeader
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={onSort}
              field="age"
              label={t("extensions.charactersOverview.age")}
              numeric
              width="4em"
            />
            <SortHeader
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={onSort}
              field="appearance"
              label={t("extensions.charactersOverview.appearance")}
              numeric
              width="4em"
            />
            <SortHeader
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={onSort}
              field="prestige"
              label={t("extensions.charactersOverview.prestige")}
              numeric
              width="4em"
            />
            <SortHeader
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={onSort}
              field="wealth"
              label={t("extensions.charactersOverview.wealth")}
              numeric
              width="6em"
            />
            {showRace && (
              <SortHeader
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={onSort}
                field="race"
                label={t("extensions.charactersOverview.race")}
                width="7em"
              />
            )}
            {showArcane && (
              <SortHeader
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={onSort}
                field="arcane"
                label={t("extensions.charactersOverview.arcane")}
                numeric
                width="5em"
              />
            )}
            <SortHeader
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={onSort}
              field="gender"
              label={t("extensions.charactersOverview.gender")}
              width="6em"
            />
            {showFamily ? (
              <SortHeader
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={onSort}
                field="maritalStatus"
                label={t("extensions.charactersOverview.family")}
                width="7em"
              />
            ) : null}
            {showFamily ? (
              <SortHeader
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={onSort}
                field="children"
                label={t("extensions.charactersOverview.children")}
                numeric
                width="5em"
              />
            ) : null}
            <SortHeader
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={onSort}
              field="title"
              label={t("extensions.charactersOverview.title")}
              width="10em"
            />
            <SortHeader
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={onSort}
              field="state"
              label={t("extensions.charactersOverview.stateCol")}
              width="10em"
            />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={colSpan}>{t("extensions.charactersOverview.empty")}</td>
            </tr>
          ) : (
            <>
              {paddingTop > 0 && (
                <tr>
                  <td colSpan={colSpan} style={{ height: `${paddingTop}px` }} />
                </tr>
              )}
              {virtualItems.map(virtualRow => {
                const { c, stateName, title, raceName } = rows[virtualRow.index];

                let rowStyle: React.CSSProperties = {};
                if (c.personality) {
                  rowStyle = getCharacterRowStyle(c.personality);
                }

                return (
                  <tr
                    key={c.i}
                    className="states"
                    style={rowStyle}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                  >
                    <td>
                      <span
                        style={{
                          cursor: "pointer",
                          color: "var(--active-color, #007bff)",
                          textDecoration: "underline"
                        }}
                        onClick={() => onCharacterClick(c.i)}
                      >
                        {c.name}
                        {getCharacterEpithetSuffix(c)}
                      </span>
                    </td>
                    <td className="numeric">{formatCharacterAge(c)}</td>
                    <td className="numeric">{c.appearance}</td>
                    <td className="numeric">{c.prestige}</td>
                    <td className="numeric" data-tip="Personal wealth (held money)">
                      {formatPrice(c.wealth ?? 0)}
                    </td>
                    {showRace && <td>{raceName}</td>}
                    {showArcane && <td className="numeric">{c.arcane ?? ""}</td>}
                    <td>{c.gender}</td>
                    {showFamily ? <td>{(c.family?.spouses ?? 0) > 0 ? "Married" : "Unmarried"}</td> : null}
                    {showFamily ? <td className="numeric">{c.family?.children ?? 0}</td> : null}
                    <td>{title}</td>
                    <td>{stateName}</td>
                  </tr>
                );
              })}
              {paddingBottom > 0 && (
                <tr>
                  <td colSpan={colSpan} style={{ height: `${paddingBottom}px` }} />
                </tr>
              )}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
};
