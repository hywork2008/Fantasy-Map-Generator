import { useVirtualizer } from "@tanstack/react-virtual";
import type React from "react";
import { useEffect, useMemo, useRef } from "react";
import { zoomTo } from "../../actions";
import { worldContext } from "../../context/worldContext";
import {
  clearHistoryArrows,
  drawHistoryArrows,
  highlightHistoryArrow
} from "../../controllers/diplomacy-history-renderer";
import { dialogStore } from "../../store/dialogState";
import { diplomacyHistoryDialogStore, useDiplomacyHistoryDialogState } from "../../store/diplomacyHistoryDialogState";
import { useOptionsState } from "../../store/optionsState";
import type { ChronicleEvent } from "../../types/models";
import { Dialog } from "./Dialog";

const DIALOG_ID = "diplomacyHistory";

// A chronicle group is `[name, event, event, ...]` — the first entry is always the plain-text
// group name (war/skirmish/siege), the rest are ChronicleEvent objects. Header rows must never
// consume a number in the "#" column: that column is meant to match the numbers the map draws
// next to the city-to-city arrows, and drawHistoryArrows() only numbers actual events.
type HistoryRow =
  | { kind: "header"; groupIdx: number; entryIdx: number; text: string }
  | { kind: "event"; groupIdx: number; entryIdx: number; event: ChronicleEvent; number: number };

export const DiplomacyHistoryDialog: React.FC = () => {
  const isOpen = useDiplomacyHistoryDialogState(s => s.isOpen);
  const chronicle = useDiplomacyHistoryDialogState(s => s.chronicle);
  const currentYear = useOptionsState(s => s.year);
  const currentEra = useOptionsState(s => s.era);
  const currentEraShort =
    currentEra
      ?.split(" ")
      .map(w => w[0].toUpperCase())
      .join("") || "E";
  const containerRef = useRef<HTMLDivElement>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  const close = () => diplomacyHistoryDialogStore.getState().close();
  const { onSave, onClear, onChange } = diplomacyHistoryDialogStore.getState();

  // Flatten the chronicle (groups of [name, event, event, ...]) into a single row list, numbering
  // only the event rows. This is both what the virtualizer indexes and the single source of truth
  // for the "#" column, so the table row numbers stay aligned with drawHistoryArrows()'s numbering.
  const rows = useMemo(() => {
    const result: HistoryRow[] = [];
    let eventNumber = 0;
    chronicle.forEach((group, groupIdx) => {
      group.forEach((line: string | ChronicleEvent, entryIdx: number) => {
        if (typeof line === "object") {
          eventNumber += 1;
          result.push({ kind: "event", groupIdx, entryIdx, event: line, number: eventNumber });
        } else {
          result.push({ kind: "header", groupIdx, entryIdx, text: line });
        }
      });
    });
    return result;
  }, [chronicle]);

  const validEvents = useMemo(
    () => rows.filter((row): row is Extract<HistoryRow, { kind: "event" }> => row.kind === "event").map(r => r.event),
    [rows]
  );

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 10
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0 ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end : 0;

  useEffect(() => {
    if (isOpen) {
      drawHistoryArrows(validEvents);
    } else {
      clearHistoryArrows();
    }
    return () => clearHistoryArrows();
  }, [isOpen, validEvents]);

  useEffect(() => {
    if (!isOpen) return;
    dialogStore.getState().openDialog(DIALOG_ID, { onClose: () => diplomacyHistoryDialogStore.getState().close() });
    return () => {
      dialogStore.getState().closeDialog(DIALOG_ID);
    };
  }, [isOpen]);

  // Builds the exported text straight from the chronicle data rather than the DOM: with
  // virtualization only the visible rows are ever mounted, so reading containerRef.innerText
  // would silently drop every row currently scrolled out of view.
  const buildHistoryText = () => {
    const lines = rows.map(row => {
      if (row.kind === "header") return `\t-\t-\t-\t${row.text}`;
      const { event, number } = row;
      const year = `${(currentYear ?? 100) - event.yearsAgo} ${currentEraShort}`;
      const from = worldContext.pack.states[event.from]?.name || event.from;
      const to = worldContext.pack.states[event.to]?.name || event.to;
      return `${number}\t${year}\t${from}\t${to}\t${event.rawText}`;
    });
    return ["#\tEra & Year\tFrom\tTo\tAction", ...lines].join("\n");
  };

  const save = () => {
    const text = chronicle.length === 0 ? (containerRef.current?.innerText ?? "") : buildHistoryText();
    onSave(text.replace(/\n/g, "\r\n"));
    close();
  };

  const clear = () => {
    onClear();
    close();
  };

  return (
    <Dialog
      isOpen={isOpen}
      title="Relations history"
      onClose={close}
      buttons={[
        { label: "Save", onClick: save },
        { label: "Clear", onClick: clear },
        { label: "Close", onClick: close }
      ]}
    >
      <div autoCorrect="off" spellCheck={false}>
        {chronicle.length === 0 ? (
          <div ref={containerRef}>
            <div
              contentEditable
              suppressContentEditableWarning
              data-id="0-0"
              onBlur={e => onChange(0, 0, e.currentTarget.textContent ?? "")}
            >
              No historical records
            </div>
            {"​"}
          </div>
        ) : (
          <div ref={parentRef} style={{ maxHeight: "50vh", overflow: "auto" }}>
            <table className="fmg-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Era & Year</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {paddingTop > 0 && (
                  <tr>
                    <td colSpan={5} style={{ height: `${paddingTop}px`, padding: 0, border: "none" }} />
                  </tr>
                )}
                {virtualItems.map(virtualRow => {
                  const row = rows[virtualRow.index];
                  const isEvent = row.kind === "event";
                  const rawText = isEvent ? row.event.rawText : row.text;
                  const textCell = (
                    <div
                      contentEditable
                      suppressContentEditableWarning
                      data-id={`${row.groupIdx}-${row.entryIdx}`}
                      style={!isEvent ? { fontWeight: "bold" } : undefined}
                      onBlur={e => onChange(row.groupIdx, row.entryIdx, e.currentTarget.textContent ?? "")}
                    >
                      {rawText}
                    </div>
                  );

                  return (
                    <tr
                      key={`${row.groupIdx}-${row.entryIdx}`}
                      ref={rowVirtualizer.measureElement}
                      data-index={virtualRow.index}
                      onMouseEnter={() => isEvent && highlightHistoryArrow(row.event.id, row.event.from, row.event.to)}
                      onMouseLeave={() => isEvent && highlightHistoryArrow("")}
                    >
                      <td>{isEvent ? row.number : ""}</td>
                      <td>{isEvent ? `${(currentYear ?? 100) - row.event.yearsAgo} ${currentEraShort}` : "-"}</td>
                      <td>{isEvent ? worldContext.pack.states[row.event.from]?.name || row.event.from : "-"}</td>
                      <td>{isEvent ? worldContext.pack.states[row.event.to]?.name || row.event.to : "-"}</td>
                      <td>
                        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                          <div style={{ flex: 1 }}>{textCell}</div>
                          {isEvent && row.event.toBurg !== undefined && (
                            <span
                              className="icon-search"
                              title="Zoom to city"
                              style={{ cursor: "pointer" }}
                              onClick={() => {
                                // Guarded by the `toBurg !== undefined` check above.
                                const burg = worldContext.pack.burgs[row.event.toBurg!];
                                if (burg) zoomTo(burg.x, burg.y, 8, 1000);
                              }}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {paddingBottom > 0 && (
                  <tr>
                    <td colSpan={5} style={{ height: `${paddingBottom}px`, padding: 0, border: "none" }} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="info-line">Type to edit. Press Enter to add a new line, empty the element to remove it</div>
    </Dialog>
  );
};
