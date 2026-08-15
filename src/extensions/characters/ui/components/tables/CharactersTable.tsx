import { useVirtualizer } from "@tanstack/react-virtual";
import type React from "react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { SortableHeader } from "../../../../hostUi";
import { formatPrice } from "../../../../hostUtils";
import type { CharacterRowData } from "../../../controllers/characters-overview";
import { getCharacterRowStyle } from "../../../utils/personalityUtils";

export interface CharactersTableProps {
  rows: CharacterRowData[];
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSort: (field: string) => void;
  onCharacterClick: (characterId: number) => void;
  /** Fantasy culture sets only — show Race after Wealth. */
  showRace?: boolean;
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
  const colSpan = 8 + Number(showRace) + (showFamily ? 2 : 0);

  function SortHeader({
    field,
    label,
    numeric,
    width
  }: {
    field: string;
    label: string;
    numeric?: boolean;
    width?: string;
  }) {
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

  return (
    <div className="table" ref={parentRef} style={{ overflow: "auto" }}>
      <table className="fmg-table">
        <thead style={{ zIndex: 3 }}>
          <tr>
            <SortHeader field="name" label={t("extensions.charactersOverview.name")} width="6em" />
            <SortHeader field="age" label={t("extensions.charactersOverview.age")} numeric width="4em" />
            <SortHeader field="appearance" label={t("extensions.charactersOverview.appearance")} numeric width="4em" />
            <SortHeader field="prestige" label={t("extensions.charactersOverview.prestige")} numeric width="4em" />
            <SortHeader field="wealth" label={t("extensions.charactersOverview.wealth")} numeric width="6em" />
            {showRace && <SortHeader field="race" label={t("extensions.charactersOverview.race")} width="7em" />}
            <SortHeader field="gender" label={t("extensions.charactersOverview.gender")} width="6em" />
            {showFamily ? (
              <SortHeader field="maritalStatus" label={t("extensions.charactersOverview.family")} width="7em" />
            ) : null}
            {showFamily ? (
              <SortHeader field="children" label={t("extensions.charactersOverview.children")} numeric width="5em" />
            ) : null}
            <SortHeader field="title" label={t("extensions.charactersOverview.title")} width="10em" />
            <SortHeader field="state" label={t("extensions.charactersOverview.stateCol")} width="10em" />
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
                      </span>
                    </td>
                    <td className="numeric">{c.age}</td>
                    <td className="numeric">{c.appearance}</td>
                    <td className="numeric">{c.prestige}</td>
                    <td className="numeric" data-tip="Personal wealth (held money)">
                      {formatPrice(c.wealth ?? 0)}
                    </td>
                    {showRace && <td>{raceName}</td>}
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
