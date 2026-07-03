import type React from "react";
import { useState } from "react";
import { Dialog } from "./Dialog";

const FEATURES = [
  { name: "capital", icon: "icon-star" },
  { name: "port", icon: "icon-anchor" },
  { name: "citadel", icon: "icon-chess-rook" },
  { name: "walls", icon: "icon-fort-awesome" },
  { name: "plaza", icon: "icon-store" },
  { name: "temple", icon: "icon-chess-bishop" },
  { name: "shanty", icon: "icon-campground" }
] as const;

type FeatureValue = true | false | undefined;
type FeaturesState = Record<string, FeatureValue>;

type FeaturesSelectionDialogProps = {
  isOpen: boolean;
  initial: Record<string, boolean>;
  onApply: (values: Record<string, boolean>) => void;
  onClose: () => void;
};

export const FeaturesSelectionDialog: React.FC<FeaturesSelectionDialogProps> = ({
  isOpen,
  initial,
  onApply,
  onClose
}) => {
  const [values, setValues] = useState<FeaturesState>(() =>
    Object.fromEntries(FEATURES.map(f => [f.name, initial[f.name] as FeatureValue]))
  );

  const set = (name: string, val: FeatureValue) => setValues(prev => ({ ...prev, [name]: val }));

  const apply = () => {
    const result: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(values)) {
      if (v !== undefined) result[k] = v;
    }
    onApply(result);
    onClose();
  };

  return (
    <Dialog
      isOpen={isOpen}
      title="Limit group by features"
      onClose={onClose}
      buttons={[
        { label: "Apply", onClick: apply },
        { label: "Cancel", onClick: onClose }
      ]}
    >
      <table>
        <thead>
          <tr>
            <td>Features</td>
            <td>True</td>
            <td>False</td>
            <td>Any</td>
          </tr>
        </thead>
        <tbody>
          {FEATURES.map(f => (
            <tr key={f.name} title={`Select limitation for burg feature: ${f.name}`}>
              <td>
                <span className={f.icon} />
                <span>{f.name}</span>
              </td>
              <td>
                <input
                  type="radio"
                  name={f.name}
                  checked={values[f.name] === true}
                  onChange={() => set(f.name, true)}
                />
              </td>
              <td>
                <input
                  type="radio"
                  name={f.name}
                  checked={values[f.name] === false}
                  onChange={() => set(f.name, false)}
                />
              </td>
              <td>
                <input
                  type="radio"
                  name={f.name}
                  checked={values[f.name] === undefined}
                  onChange={() => set(f.name, undefined)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  );
};
