import { useVirtualizer } from "@tanstack/react-virtual";
import type React from "react";
import { useRef } from "react";
import { SortableHeader } from "../../../../hostUi";
import type { CharacterRowData } from "../../../controllers/characters-overview";
import { getCharacterRowStyle } from "../../../utils/personalityUtils";

export interface CharactersStatsTableProps {
  rows: CharacterRowData[];
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSort: (field: string) => void;
  onCharacterClick: (characterId: number) => void;
}

export const CharactersStatsTable: React.FC<CharactersStatsTableProps> = ({
  rows,
  sortBy,
  sortOrder,
  onSort,
  onCharacterClick
}) => {
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

  function SortHeader({ field, label, tip, width }: { field: string; label: string; tip: string; width?: string }) {
    return (
      <SortableHeader
        field={field}
        label={label}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={onSort}
        numeric
        tip={`Click to sort by ${tip}`}
        style={{ width, minWidth: width, fontSize: "0.85em", padding: "0 4px" }}
      />
    );
  }

  const colSpan = 20; // Name + 9 Skills + 10 Personality = 20

  return (
    <div className="table" ref={parentRef} style={{ overflow: "auto" }}>
      <table className="fmg-table" style={{ minWidth: "1000px" }}>
        <thead style={{ zIndex: 3 }}>
          <tr>
            <SortableHeader
              field="name"
              label="Name"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={onSort}
              tip="Click to sort by name"
              style={{ width: "12em", minWidth: "12em" }}
            />
            <SortHeader field="artistry" label="Arts" tip="Artistry" />
            <SortHeader field="diplomacy" label="Dipl" tip="Diplomacy" />
            <SortHeader field="engineering" label="Engi" tip="Engineering" />
            <SortHeader field="geography" label="Geog" tip="Geography" />
            <SortHeader field="intrigue" label="Intr" tip="Intrigue" />
            <SortHeader field="learning" label="Lrn" tip="Learning" />
            <SortHeader field="martial" label="Mart" tip="Martial" />
            <SortHeader field="prowess" label="Prow" tip="Prowess" />
            <SortHeader field="stewardship" label="Stew" tip="Stewardship" />

            <SortHeader field="boldness" label="Bold" tip="Boldness" />
            <SortHeader field="compassion" label="Comp" tip="Compassion" />
            <SortHeader field="confidence" label="Conf" tip="Confidence" />
            <SortHeader field="energy" label="Econ" tip="Energy (Economic Archetype)" />
            <SortHeader field="greed" label="Grd" tip="Greed" />
            <SortHeader field="guile" label="Guil" tip="Guile" />
            <SortHeader field="honor" label="Hnr" tip="Honor" />
            <SortHeader field="piety" label="Piet" tip="Piety" />
            <SortHeader field="rationality" label="Rati" tip="Rationality" />
            <SortHeader field="sociability" label="Soci" tip="Sociability" />
            <SortHeader field="vengefulness" label="Veng" tip="Vengefulness" />
            <SortHeader field="zeal" label="Zeal" tip="Zeal" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={colSpan}>No characters found</td>
            </tr>
          ) : (
            <>
              {paddingTop > 0 && (
                <tr>
                  <td colSpan={colSpan} style={{ height: `${paddingTop}px` }} />
                </tr>
              )}
              {virtualItems.map(virtualRow => {
                const { c, title } = rows[virtualRow.index];

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
                      {title && <span style={{ fontSize: "0.85em", marginLeft: "6px", opacity: 0.8 }}>({title})</span>}
                    </td>
                    <td style={{ textAlign: "center" }}>{c.skills?.artistry ?? 0}</td>
                    <td style={{ textAlign: "center" }}>{c.skills?.diplomacy ?? 0}</td>
                    <td style={{ textAlign: "center" }}>{c.skills?.engineering ?? 0}</td>
                    <td style={{ textAlign: "center" }}>{c.skills?.geography ?? 0}</td>
                    <td style={{ textAlign: "center" }}>{c.skills?.intrigue ?? 0}</td>
                    <td style={{ textAlign: "center" }}>{c.skills?.learning ?? 0}</td>
                    <td style={{ textAlign: "center" }}>{c.skills?.martial ?? 0}</td>
                    <td style={{ textAlign: "center" }}>{c.skills?.prowess ?? 0}</td>
                    <td style={{ textAlign: "center" }}>{c.skills?.stewardship ?? 0}</td>

                    <td style={{ textAlign: "center" }}>{c.personality?.boldness ?? 0}</td>
                    <td style={{ textAlign: "center" }}>{c.personality?.compassion ?? 0}</td>
                    <td style={{ textAlign: "center" }}>{c.personality?.confidence ?? 0}</td>
                    <td style={{ textAlign: "center" }}>{c.personality?.energy ?? 0}</td>
                    <td style={{ textAlign: "center" }}>{c.personality?.greed ?? 0}</td>
                    <td style={{ textAlign: "center" }}>{c.personality?.guile ?? 0}</td>
                    <td style={{ textAlign: "center" }}>{c.personality?.honor ?? 0}</td>
                    <td style={{ textAlign: "center" }}>{c.personality?.piety ?? 0}</td>
                    <td style={{ textAlign: "center" }}>{c.personality?.rationality ?? 0}</td>
                    <td style={{ textAlign: "center" }}>{c.personality?.sociability ?? 0}</td>
                    <td style={{ textAlign: "center" }}>{c.personality?.vengefulness ?? 0}</td>
                    <td style={{ textAlign: "center" }}>{c.personality?.zeal ?? 0}</td>
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
