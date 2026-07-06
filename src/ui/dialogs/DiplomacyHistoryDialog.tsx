import type React from "react";
import { useEffect, useMemo, useRef } from "react";
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

  const close = () => diplomacyHistoryDialogStore.getState().close();
  const { onSave, onClear, onChange } = diplomacyHistoryDialogStore.getState();

  // Extract all valid events for drawing
  const validEvents = useMemo(() => {
    const events: ChronicleEvent[] = [];
    for (const group of chronicle) {
      for (const entry of group) {
        if (typeof entry === "object" && entry.id) {
          events.push(entry);
        }
      }
    }
    return events;
  }, [chronicle]);

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

  const save = () => {
    const text = containerRef.current?.innerText ?? "";
    onSave(text.replace(/\n/g, "\r\n"));
    close();
  };

  const clear = () => {
    onClear();
    close();
  };

  let globalRowIndex = 1;

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
      <div autoCorrect="off" spellCheck={false} ref={containerRef}>
        {chronicle.length === 0 ? (
          <div>
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
              {chronicle.map((entry, groupIdx) =>
                entry.map((line, entryIdx) => {
                  const isEvent = typeof line === "object";
                  const rawText = isEvent ? line.rawText : line;
                  const rowIdx = globalRowIndex++;
                  const textCell = (
                    <div
                      contentEditable
                      suppressContentEditableWarning
                      data-id={`${groupIdx}-${entryIdx}`}
                      style={entryIdx === 0 ? { fontWeight: "bold" } : undefined}
                      onBlur={e => onChange(groupIdx, entryIdx, e.currentTarget.textContent ?? "")}
                    >
                      {rawText}
                    </div>
                  );

                  return (
                    <tr
                      key={`${groupIdx}-${entryIdx}`}
                      onMouseEnter={() => isEvent && highlightHistoryArrow(line.id, line.from, line.to)}
                      onMouseLeave={() => isEvent && highlightHistoryArrow("")}
                    >
                      <td>{rowIdx}</td>
                      <td>{isEvent ? `${(currentYear ?? 100) - line.yearsAgo} ${currentEraShort}` : "-"}</td>
                      <td>{isEvent ? worldContext.pack.states[line.from]?.name || line.from : "-"}</td>
                      <td>{isEvent ? worldContext.pack.states[line.to]?.name || line.to : "-"}</td>
                      <td>{textCell}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>
      <div className="info-line">Type to edit. Press Enter to add a new line, empty the element to remove it</div>
    </Dialog>
  );
};
