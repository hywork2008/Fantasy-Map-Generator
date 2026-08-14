import { useVirtualizer } from "@tanstack/react-virtual";
import type React from "react";
import { useRef } from "react";
import { SortableHeader } from "../../../../hostUi";
import type { AbilityPreset, AbilityStatDef } from "../../../characterTypes";
import type { CharacterRowData } from "../../../controllers/characters-overview";
import { getAbilityValue } from "../../../personFactory";
import { getCharacterRowStyle } from "../../../utils/personalityUtils";

export interface CharactersStatsTableProps {
  rows: CharacterRowData[];
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSort: (field: string) => void;
  onCharacterClick: (characterId: number) => void;
  abilityPreset: AbilityPreset;
}

/** Compact CK3 column labels keep the dense capability grid scannable. */
const CK3_COMPACT_ABILITY_LABELS: Readonly<Record<string, string>> = {
  artistry: "Arts",
  diplomacy: "Dipl",
  engineering: "Engi",
  geography: "Geog",
  intrigue: "Intr",
  learning: "Lrn",
  martial: "Mart",
  prowess: "Prow",
  stewardship: "Stew",
  boldness: "Bold",
  compassion: "Comp",
  confidence: "Conf",
  energy: "Econ",
  greed: "Grd",
  guile: "Guil",
  honor: "Hnr",
  piety: "Piet",
  rationality: "Rati",
  sociability: "Soci",
  vengefulness: "Veng",
  zeal: "Zeal"
};

/** Preserve the established Skills → Personality order in the CK3 overview. */
const CK3_STATS_TABLE_ORDER: readonly string[] = [
  "artistry",
  "diplomacy",
  "engineering",
  "geography",
  "intrigue",
  "learning",
  "martial",
  "prowess",
  "stewardship",
  "boldness",
  "compassion",
  "confidence",
  "energy",
  "greed",
  "guile",
  "honor",
  "piety",
  "rationality",
  "sociability",
  "vengefulness",
  "zeal"
];

const NAME_COLUMN_WIDTH_EM = 12;
const ABILITY_COLUMN_WIDTH_EM = 4;

function getCompactAbilityLabel(abilityPreset: AbilityPreset, key: string, label: string): string {
  if (abilityPreset.id === "ck3e") return CK3_COMPACT_ABILITY_LABELS[key] ?? label;
  return key;
}

function getDisplayedAbilityStats(abilityPreset: AbilityPreset): AbilityStatDef[] {
  if (abilityPreset.id !== "ck3e") return abilityPreset.stats;

  const statByKey = new Map(abilityPreset.stats.map(stat => [stat.key, stat]));
  const ordered = CK3_STATS_TABLE_ORDER.flatMap(key => {
    const stat = statByKey.get(key);
    return stat ? [stat] : [];
  });
  const knownKeys = new Set(CK3_STATS_TABLE_ORDER);
  return [...ordered, ...abilityPreset.stats.filter(stat => !knownKeys.has(stat.key))];
}

export const CharactersStatsTable: React.FC<CharactersStatsTableProps> = ({
  rows,
  sortBy,
  sortOrder,
  onSort,
  onCharacterClick,
  abilityPreset
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

  const displayedStats = getDisplayedAbilityStats(abilityPreset);
  const tableMinWidth = `${NAME_COLUMN_WIDTH_EM + displayedStats.length * ABILITY_COLUMN_WIDTH_EM}em`;

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
        style={{
          width: width ?? `${ABILITY_COLUMN_WIDTH_EM}em`,
          minWidth: width ?? `${ABILITY_COLUMN_WIDTH_EM}em`,
          fontSize: "0.85em",
          padding: "0 4px",
          // Matches the center-aligned stat <td> below (a dense abbreviated-label grid, not a
          // left/right value table) — without this, the shared .sortable numeric CSS rule would
          // right-align the header while the data stays centered.
          textAlign: "center"
        }}
      />
    );
  }

  const colSpan = displayedStats.length + 1;

  return (
    <div className="table" ref={parentRef} style={{ overflow: "auto" }}>
      <table className="fmg-table" style={{ minWidth: tableMinWidth }}>
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
            {displayedStats.map(stat => (
              <SortHeader
                key={stat.key}
                field={`ability:${stat.key}`}
                label={getCompactAbilityLabel(abilityPreset, stat.key, stat.label)}
                tip={stat.label}
              />
            ))}
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
                    {displayedStats.map(stat => (
                      <td
                        key={stat.key}
                        style={{
                          width: `${ABILITY_COLUMN_WIDTH_EM}em`,
                          minWidth: `${ABILITY_COLUMN_WIDTH_EM}em`,
                          textAlign: "center"
                        }}
                      >
                        {getAbilityValue(c, stat.key) ?? stat.default}
                      </td>
                    ))}
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
