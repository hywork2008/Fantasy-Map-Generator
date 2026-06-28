import type React from "react";
import { useRef } from "react";
import { diplomacyHistoryDialogStore, useDiplomacyHistoryDialogState } from "../../store/diplomacyHistoryDialogState";
import { Dialog } from "./Dialog";

export const DiplomacyHistoryDialog: React.FC = () => {
  const isOpen = useDiplomacyHistoryDialogState(s => s.isOpen);
  const chronicle = useDiplomacyHistoryDialogState(s => s.chronicle);
  const containerRef = useRef<HTMLDivElement>(null);

  const close = () => diplomacyHistoryDialogStore.getState().close();
  const { onSave, onClear, onChange } = diplomacyHistoryDialogStore.getState();

  const save = () => {
    const text = containerRef.current?.innerText ?? "";
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
          chronicle.map((entry, groupIdx) => (
            <div key={groupIdx}>
              {entry.map((line, entryIdx) => (
                <div
                  key={entryIdx}
                  contentEditable
                  suppressContentEditableWarning
                  data-id={`${groupIdx}-${entryIdx}`}
                  style={entryIdx === 0 ? { fontWeight: "bold" } : undefined}
                  onBlur={e => onChange(groupIdx, entryIdx, e.currentTarget.textContent ?? "")}
                >
                  {line}
                </div>
              ))}
              {"​"}
            </div>
          ))
        )}
      </div>
      <div className="info-line">Type to edit. Press Enter to add a new line, empty the element to remove it</div>
    </Dialog>
  );
};
