import { useVirtualizer } from "@tanstack/react-virtual";
import type React from "react";
import { useMemo, useRef, useState } from "react";
import { SortableHeader } from "../../../hostUi";
import { getWorldContext } from "../../nobilityContext";

const getPersonalityColor = (val: number): string | undefined => {
  if (val < 10) return undefined;
  if (val >= 85) return "rgba(154, 205, 50, 0.6)"; // Strong Yellow-Green
  if (val >= 70) return "rgba(154, 205, 50, 0.35)"; // Pale Yellow-Green
  if (val >= 55) return "rgba(255, 215, 0, 0.5)"; // Strong Yellow
  if (val >= 40) return "rgba(255, 215, 0, 0.25)"; // Pale Yellow
  if (val >= 25) return "rgba(255, 140, 0, 0.4)"; // Strong Orange
  return "rgba(255, 140, 0, 0.15)"; // Pale Orange
};

export const StatesEditorPersonalityTab: React.FC = () => {
  const worldContext = getWorldContext();
  const pack = worldContext.pack;
  const states = pack.states.filter(s => s.i && !s.removed);
  const characters = pack.characters || [];

  const [sortBy, setSortBy] = useState("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const stateAverages = useMemo(() => {
    return states.map(s => {
      const stateChars = characters.filter(c => c.titles.some(t => t.entityType === "state" && t.entityId === s.i));

      const count = stateChars.length;
      if (count === 0) {
        return {
          stateId: s.i,
          name: s.name,
          boldness: 0,
          compassion: 0,
          confidence: 0,
          energy: 0,
          greed: 0,
          guile: 0,
          honor: 0,
          piety: 0,
          rationality: 0,
          sociability: 0,
          vengefulness: 0,
          zeal: 0,
          count: 0
        };
      }

      const sum = stateChars.reduce(
        (acc, c) => {
          acc.boldness += c.personality?.boldness ?? 0;
          acc.compassion += c.personality?.compassion ?? 0;
          acc.confidence += c.personality?.confidence ?? 0;
          acc.energy += c.personality?.energy ?? 0;
          acc.greed += c.personality?.greed ?? 0;
          acc.guile += c.personality?.guile ?? 0;
          acc.honor += c.personality?.honor ?? 0;
          acc.piety += c.personality?.piety ?? 0;
          acc.rationality += c.personality?.rationality ?? 0;
          acc.sociability += c.personality?.sociability ?? 0;
          acc.vengefulness += c.personality?.vengefulness ?? 0;
          acc.zeal += c.personality?.zeal ?? 0;
          return acc;
        },
        {
          boldness: 0,
          compassion: 0,
          confidence: 0,
          energy: 0,
          greed: 0,
          guile: 0,
          honor: 0,
          piety: 0,
          rationality: 0,
          sociability: 0,
          vengefulness: 0,
          zeal: 0
        }
      );

      return {
        stateId: s.i,
        name: s.name,
        boldness: Math.round(sum.boldness / count),
        compassion: Math.round(sum.compassion / count),
        confidence: Math.round(sum.confidence / count),
        energy: Math.round(sum.energy / count),
        greed: Math.round(sum.greed / count),
        guile: Math.round(sum.guile / count),
        honor: Math.round(sum.honor / count),
        piety: Math.round(sum.piety / count),
        rationality: Math.round(sum.rationality / count),
        sociability: Math.round(sum.sociability / count),
        vengefulness: Math.round(sum.vengefulness / count),
        zeal: Math.round(sum.zeal / count),
        count
      };
    });
  }, [states, characters]);

  const sortedRows = useMemo(() => {
    return [...stateAverages].sort((a, b) => {
      const valA = a[sortBy as keyof typeof a];
      const valB = b[sortBy as keyof typeof b];

      if (typeof valA === "string" && typeof valB === "string") {
        return sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      if (typeof valA === "number" && typeof valB === "number") {
        return sortOrder === "asc" ? valA - valB : valB - valA;
      }
      return 0;
    });
  }, [stateAverages, sortBy, sortOrder]);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc"); // Default to desc for numbers
    }
  };

  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: sortedRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 5
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0 ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end : 0;

  function SortHeader({ field, label, tip }: { field: string; label: string; tip: string }) {
    return (
      <SortableHeader
        field={field}
        label={label}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={handleSort}
        numeric
        tip={`Click to sort by ${tip}`}
        style={{ fontSize: "0.85em", padding: "0 4px" }}
      />
    );
  }

  const colSpan = 13; // Name + 12 Personality

  return (
    <div className="table" ref={parentRef} style={{ overflow: "auto" }}>
      <table className="fmg-table" style={{ minWidth: "800px" }}>
        <thead style={{ zIndex: 3 }}>
          <tr>
            <SortableHeader
              field="name"
              label="State"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={handleSort}
              tip="Click to sort by name"
              style={{ width: "3em", minWidth: "3em" }}
            />
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
          {sortedRows.length === 0 ? (
            <tr>
              <td colSpan={colSpan}>No states found</td>
            </tr>
          ) : (
            <>
              {paddingTop > 0 && (
                <tr>
                  <td colSpan={colSpan} style={{ height: `${paddingTop}px` }} />
                </tr>
              )}
              {virtualItems.map(virtualRow => {
                const s = sortedRows[virtualRow.index];
                return (
                  <tr
                    key={s.stateId}
                    className="states"
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                  >
                    <td>
                      {s.name} <span style={{ fontSize: "0.8em", opacity: 0.7 }}>({s.count})</span>
                    </td>
                    <td style={{ textAlign: "center", backgroundColor: getPersonalityColor(s.boldness) }}>
                      {s.boldness}
                    </td>
                    <td style={{ textAlign: "center", backgroundColor: getPersonalityColor(s.compassion) }}>
                      {s.compassion}
                    </td>
                    <td style={{ textAlign: "center", backgroundColor: getPersonalityColor(s.confidence) }}>
                      {s.confidence}
                    </td>
                    <td style={{ textAlign: "center", backgroundColor: getPersonalityColor(s.energy) }}>{s.energy}</td>
                    <td style={{ textAlign: "center", backgroundColor: getPersonalityColor(s.greed) }}>{s.greed}</td>
                    <td style={{ textAlign: "center", backgroundColor: getPersonalityColor(s.guile) }}>{s.guile}</td>
                    <td style={{ textAlign: "center", backgroundColor: getPersonalityColor(s.honor) }}>{s.honor}</td>
                    <td style={{ textAlign: "center", backgroundColor: getPersonalityColor(s.piety) }}>{s.piety}</td>
                    <td style={{ textAlign: "center", backgroundColor: getPersonalityColor(s.rationality) }}>
                      {s.rationality}
                    </td>
                    <td style={{ textAlign: "center", backgroundColor: getPersonalityColor(s.sociability) }}>
                      {s.sociability}
                    </td>
                    <td style={{ textAlign: "center", backgroundColor: getPersonalityColor(s.vengefulness) }}>
                      {s.vengefulness}
                    </td>
                    <td style={{ textAlign: "center", backgroundColor: getPersonalityColor(s.zeal) }}>{s.zeal}</td>
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
