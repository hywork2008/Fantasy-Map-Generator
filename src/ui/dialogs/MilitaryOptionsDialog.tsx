import type React from "react";
import { useEffect, useState } from "react";
import { getWorldState } from "../../actions";
import { appServices } from "../../context/appServices";
import { viewContext } from "../../context/viewContext";
import { worldContext } from "../../context/worldContext";
import { selectIcon } from "../../controllers/editors";
import { Military } from "../../generators/military-generator";
import { tip } from "../../services/tooltipService";
import { useDialogState } from "../../store/dialogState";
import { useMilitaryOverviewState } from "../../store/militaryOverviewState";
import type { MilitaryUnit } from "../../types/models";
import { sanitizeId } from "../../utils";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";
import type { SelectionItem } from "./SelectionDialog";
import { SelectionDialog } from "./SelectionDialog";

type MilitaryUnitConfig = MilitaryUnit & {
  biomes?: number[];
  states?: number[];
  cultures?: number[];
  religions?: number[];
};

const unitTypes = ["melee", "ranged", "mounted", "machinery", "naval", "armored", "aviation", "magical"];

function getLimitText(attr: number[] | undefined): string {
  return attr?.length ? "some" : "all";
}

function getLimitTip(attr: number[] | undefined, data: SelectionItem[]): string {
  if (!attr?.length) return "";
  return attr.map(idx => data?.[idx]?.name || "").join(", ");
}

type SelectionDialogState = {
  title: string;
  byLabel: string;
  items: SelectionItem[];
  initial: number[] | undefined;
  onApply: (selected: number[] | undefined) => void;
} | null;

export const MilitaryOptionsDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("militaryOptions"));
  const [units, setUnits] = useState<MilitaryUnitConfig[]>([]);
  const [selectionDialog, setSelectionDialog] = useState<SelectionDialogState>(null);

  useEffect(() => {
    if (isOpen) {
      setUnits([...(worldContext.options?.military || [])]);
    }
  }, [isOpen]);

  const updateUnit = (index: number, key: keyof MilitaryUnitConfig, value: unknown) => {
    setUnits(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value };
      return next;
    });
  };

  const removeUnit = (index: number) => {
    setUnits(prev => prev.filter((_, i) => i !== index));
  };

  const addUnit = () => {
    setUnits(prev => [
      ...prev,
      {
        icon: "🛡️",
        name: `custom${prev.length}`,
        rural: 0,
        urban: 0,
        crew: 1,
        power: 1,
        type: "melee",
        separate: 0
      }
    ]);
  };

  const restoreDefaults = () => {
    setUnits(Military.getDefaultOptions());
  };

  const applyMilitaryOptions = () => {
    const names = units.map(u => sanitizeId(u.name));
    if (new Set(names).size !== names.length) {
      tip("All units should have unique names", false, "error");
      return;
    }

    worldContext.options.military = units;
    localStorage.setItem("military", JSON.stringify(units));
    Military.generate(worldContext, viewContext, appServices, getWorldState());
    useMilitaryOverviewState.getState().refresh();
    closeDialog("militaryOptions");
  };

  return (
    <>
      <Dialog isOpen={isOpen} title="Military Options" onClose={() => closeDialog("militaryOptions")}>
        <div id="militaryOptionsContainer">
          <div>
            <div className="table">
              <table id="militaryOptionsTable">
                <thead>
                  <tr>
                    <th data-tip="Unit icon">Icon</th>
                    <th data-tip="Unit name. If name is changed for existing unit, old unit will be replaced">
                      Unit name
                    </th>
                    <th className="-military-options-dialog__width-5em" data-tip="Select allowed biomes">
                      Biomes
                    </th>
                    <th className="-military-options-dialog__width-5em" data-tip="Select allowed states">
                      States
                    </th>
                    <th className="-military-options-dialog__width-5em" data-tip="Select allowed cultures">
                      Cultures
                    </th>
                    <th className="-military-options-dialog__width-5em" data-tip="Select allowed religions">
                      Religions
                    </th>
                    <th data-tip="Conscription percentage for rural population">Rural</th>
                    <th data-tip="Conscription percentage for urban population">Urban</th>
                    <th data-tip="Average number of people in crew (used for total personnel calculation)">Crew</th>
                    <th data-tip="Unit military power (used for battle simulation)">Power</th>
                    <th data-tip="Unit type to apply special rules on forces recalculation">Type</th>
                    <th data-tip="Check if unit is separate and can be stacked only with units of the same type">
                      Separate
                    </th>
                    <th data-tip="Remove the unit"></th>
                  </tr>
                </thead>
                <tbody>
                  {units.map((unit, index) => {
                    const {
                      name,
                      icon,
                      rural,
                      urban,
                      crew,
                      power,
                      type,
                      separate,
                      biomes,
                      states,
                      cultures,
                      religions
                    } = unit;

                    return (
                      // biome-ignore lint/suspicious/noArrayIndexKey: military units order is static during rendering unless deleted
                      <tr key={index}>
                        <td>
                          <button
                            type="button"
                            data-tip="Click to select unit icon"
                            onClick={() => {
                              selectIcon(icon || "🛡️", (val: string) => updateUnit(index, "icon", val));
                            }}
                          >
                            {icon?.startsWith("http") || icon?.startsWith("data:image") ? (
                              <img
                                src={icon}
                                className="-military-options-dialog__width-1-2em--height-1-2em--pointer-events-none"
                                alt=""
                              />
                            ) : (
                              icon || ""
                            )}
                          </button>
                        </td>
                        <td>
                          <input
                            data-tip="Type unit name"
                            value={name}
                            onChange={e => updateUnit(index, "name", e.target.value)}
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            data-tip="Select allowed biomes"
                            title={getLimitTip(
                              biomes,
                              Array.from({ length: worldContext.biomesData.i.length }, (_, idx) => ({
                                i: idx,
                                name: worldContext.biomesData.name[idx]
                              }))
                            )}
                            onClick={() => {
                              const bData = worldContext.biomesData;
                              const biomesData = Array.from({ length: bData.i.length }, (_, idx) => ({
                                i: idx,
                                name: bData.name[idx],
                                color: bData.color[idx]
                              }));
                              setSelectionDialog({
                                title: "Limit unit",
                                byLabel: "biomes",
                                items: biomesData,
                                initial: biomes,
                                onApply: val => updateUnit(index, "biomes", val)
                              });
                            }}
                          >
                            {getLimitText(biomes)}
                          </button>
                        </td>
                        <td>
                          <button
                            type="button"
                            data-tip="Select allowed states"
                            title={getLimitTip(states, worldContext.pack?.states || [])}
                            onClick={() =>
                              setSelectionDialog({
                                title: "Limit unit",
                                byLabel: "states",
                                items: worldContext.pack?.states || [],
                                initial: states,
                                onApply: val => updateUnit(index, "states", val)
                              })
                            }
                          >
                            {getLimitText(states)}
                          </button>
                        </td>
                        <td>
                          <button
                            type="button"
                            data-tip="Select allowed cultures"
                            title={getLimitTip(cultures, worldContext.pack?.cultures || [])}
                            onClick={() =>
                              setSelectionDialog({
                                title: "Limit unit",
                                byLabel: "cultures",
                                items: worldContext.pack?.cultures || [],
                                initial: cultures,
                                onApply: val => updateUnit(index, "cultures", val)
                              })
                            }
                          >
                            {getLimitText(cultures)}
                          </button>
                        </td>
                        <td>
                          <button
                            type="button"
                            data-tip="Select allowed religions"
                            title={getLimitTip(religions, worldContext.pack?.religions || [])}
                            onClick={() =>
                              setSelectionDialog({
                                title: "Limit unit",
                                byLabel: "religions",
                                items: worldContext.pack?.religions || [],
                                initial: religions,
                                onApply: val => updateUnit(index, "religions", val)
                              })
                            }
                          >
                            {getLimitText(religions)}
                          </button>
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step=".01"
                            value={rural}
                            onChange={e => updateUnit(index, "rural", Number(e.target.value))}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step=".01"
                            value={urban}
                            onChange={e => updateUnit(index, "urban", Number(e.target.value))}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={crew}
                            onChange={e => updateUnit(index, "crew", Number(e.target.value))}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step=".1"
                            value={power}
                            onChange={e => updateUnit(index, "power", Number(e.target.value))}
                          />
                        </td>
                        <td>
                          <select value={type} onChange={e => updateUnit(index, "type", e.target.value)}>
                            {unitTypes.map(t => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            className="checkbox"
                            id={`${name}Separate`}
                            checked={!!separate}
                            onChange={e => updateUnit(index, "separate", e.target.checked ? 1 : 0)}
                          />
                          {/* biome-ignore lint/a11y/noLabelWithoutControl: legacy styling */}
                          <label htmlFor={`${name}Separate`} className="checkbox-label" />
                        </td>
                        <td>
                          <span
                            className="icon-trash-empty pointer"
                            data-tip="Remove unit type"
                            onClick={() => removeUnit(index)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="-military-options-dialog__margin-top-1em">
              <button
                type="button"
                onClick={applyMilitaryOptions}
                className="-military-options-dialog__width-6em--margin-right-0-5em"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={addUnit}
                className="-military-options-dialog__width-6em--margin-right-0-5em"
              >
                Add
              </button>
              <button
                type="button"
                onClick={restoreDefaults}
                className="-military-options-dialog__width-8em--margin-right-0-5em"
              >
                Restore defaults
              </button>
              <button
                type="button"
                onClick={() => closeDialog("militaryOptions")}
                className="-military-options-dialog__width-6em"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </Dialog>
      {selectionDialog && (
        <SelectionDialog
          isOpen={true}
          title={selectionDialog.title}
          byLabel={selectionDialog.byLabel}
          items={selectionDialog.items}
          initial={selectionDialog.initial}
          onApply={selectionDialog.onApply}
          onClose={() => setSelectionDialog(null)}
        />
      )}
    </>
  );
};
