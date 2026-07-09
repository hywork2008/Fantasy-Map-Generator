import { useVirtualizer } from "@tanstack/react-virtual";
import type React from "react";
import { useRef } from "react";
import { SortableHeader } from "../../../../hostUi";
import type { CharacterRowData } from "../../../controllers/characters-overview";
import { getCharacterRowStyle } from "../../../utils/personalityUtils";

export interface CharactersTableProps {
  rows: CharacterRowData[];
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSort: (field: string) => void;
  onCharacterClick: (characterId: number) => void;
}

export const CharactersTable: React.FC<CharactersTableProps> = ({
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
        tip={`Click to sort by ${label.toLowerCase()}`}
        style={{ width, minWidth: width }}
      />
    );
  }

  return (
    <div className="table" ref={parentRef} style={{ overflow: "auto" }}>
      <table className="fmg-table">
        <thead style={{ zIndex: 3 }}>
          <tr>
            <SortHeader field="name" label="Name" width="6em" />
            <SortHeader field="age" label="Age" numeric width="4em" />
            <SortHeader field="appearance" label="App" numeric width="4em" />
            <SortHeader field="prestige" label="Pre" numeric width="4em" />
            <SortHeader field="gender" label="Gender" width="6em" />
            <SortHeader field="title" label="Title / Role" width="10em" />
            <SortHeader field="state" label="State" width="10em" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7}>No characters found</td>
            </tr>
          ) : (
            <>
              {paddingTop > 0 && (
                <tr>
                  <td colSpan={7} style={{ height: `${paddingTop}px` }} />
                </tr>
              )}
              {virtualItems.map(virtualRow => {
                const { c, stateName, title } = rows[virtualRow.index];

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
                    <td style={{ textAlign: "right" }}>{c.age}</td>
                    <td style={{ textAlign: "right" }}>{c.appearance}</td>
                    <td style={{ textAlign: "right" }}>{c.prestige}</td>
                    <td>{c.gender}</td>
                    <td>{title}</td>
                    <td>{stateName}</td>
                  </tr>
                );
              })}
              {paddingBottom > 0 && (
                <tr>
                  <td colSpan={7} style={{ height: `${paddingBottom}px` }} />
                </tr>
              )}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
};
