import type React from "react";
import { useState } from "react";
import { tip } from "../../services/tooltipService";
import { Dialog } from "./Dialog";

export type SelectionItem = {
  i?: number;
  name?: string;
  fullName?: string;
  color?: string;
  removed?: boolean;
};

type SelectionDialogProps = {
  isOpen: boolean;
  title: string;
  byLabel: string;
  items: SelectionItem[];
  initial: number[] | undefined;
  onApply: (selected: number[] | undefined) => void;
  onClose: () => void;
};

export const SelectionDialog: React.FC<SelectionDialogProps> = ({
  isOpen,
  title,
  byLabel,
  items,
  initial,
  onApply,
  onClose
}) => {
  const filtered = items.filter(item => item.i !== undefined && !item.removed);
  const [checked, setChecked] = useState<Record<number, boolean>>(() => {
    const initialArr = initial || [];
    return Object.fromEntries(filtered.map(item => [item.i!, !initialArr.length || initialArr.includes(item.i!)]));
  });

  const toggle = (i: number) => setChecked(prev => ({ ...prev, [i]: !prev[i] }));

  const invert = () => setChecked(prev => Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, !v])));

  const apply = () => {
    const selected = filtered.filter(item => checked[item.i!]).map(item => item.i!);
    if (!selected.length) {
      tip("Select at least one element", false, "error");
      return;
    }
    const allSelected = selected.length === filtered.length;
    onApply(allSelected ? undefined : selected);
    onClose();
  };

  return (
    <Dialog
      isOpen={isOpen}
      title={title}
      onClose={onClose}
      buttons={[
        { label: "Invert", onClick: invert },
        { label: "Apply", onClick: apply },
        { label: "Cancel", onClick: onClose }
      ]}
    >
      <div>
        <b>Limit {byLabel}:</b>
        <table className="-selection-dialog__margin-top-0-3em">
          <tbody>
            {filtered.map(item => (
              <tr key={item.i} title={item.name}>
                <td>
                  <span style={{ color: item.color }}>⬤</span>
                </td>
                <td>
                  <input
                    id={`sel-el-${item.i}`}
                    type="checkbox"
                    className="checkbox"
                    checked={!!checked[item.i!]}
                    onChange={() => toggle(item.i!)}
                  />
                  <label htmlFor={`sel-el-${item.i}`} className="checkbox-label">
                    {item.fullName || item.name}
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
};
