import type React from "react";
import { useEffect, useState } from "react";
import { getWorldState } from "../../actions";
import { appServices } from "../../context/appServices";
import { viewContext } from "../../context/viewContext";
import { worldContext } from "../../context/worldContext";
import { selectIcon } from "../../controllers/editors";
import { Military } from "../../modules/military-generator";
import { useDialogState } from "../../store/dialogState";
import { useMilitaryOverviewState } from "../../store/militaryOverviewState";
import type { MilitaryUnit } from "../../types/models";
import { sanitizeId } from "../../utils";
import { tip } from "../../utils/uiHelpers";
import { Dialog } from "./Dialog";
import { closeDialog, openRichDialog } from "./dialogService";

type LimitEntity = {
  i?: number;
  name?: string;
  fullName?: string;
  color?: string;
  removed?: boolean;
};

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

function getLimitTip(attr: number[] | undefined, data: LimitEntity[]): string {
  if (!attr?.length) return "";
  return attr.map(idx => data?.[idx]?.name || "").join(", ");
}

function triggerSelectLimitation(
  type: string,
  initial: number[] | undefined,
  data: LimitEntity[],
  onChange: (newValue: number[] | undefined) => void
): void {
  const initialArr = initial || [];
  const filtered = data.filter(datum => datum.i && !datum.removed);

  const lines = filtered.map(
    ({ i, name, fullName, color: c }) => /* html */ `
      <tr data-tip="${name}">
        <td><span style="color:${c}">⬤</span></td>
        <td>
          <input data-i="${i}" id="el${i}" type="checkbox" class="checkbox"
            ${!initialArr.length || (i !== undefined && initialArr.includes(i)) ? "checked" : ""} >
          <label for="el${i}" class="checkbox-label">${fullName || name}</label>
        </td>
      </tr>`
  );

  openRichDialog({
    title: "Limit unit",
    content: /* html */ `<b>Limit unit by ${type}:</b>
      <table style="margin-top:.3em">
        <tbody>
          ${lines.join("")}
        </tbody>
      </table>`,
    buttons: [
      {
        label: "Invert",
        keepOpen: true,
        onClick: () => {
          const alertMsg = document.getElementById("alert");
          if (alertMsg) {
            alertMsg.querySelectorAll("input").forEach(el => {
              const input = el as HTMLInputElement;
              input.checked = !input.checked;
            });
          }
        }
      },
      {
        label: "Apply",
        onClick: () => {
          const alertMsg = document.getElementById("alert");
          if (!alertMsg) return;
          const inputs = Array.from(alertMsg.querySelectorAll<HTMLInputElement>("input"));
          const selected = inputs.reduce<number[]>((acc, input) => {
            if (input.checked) acc.push(Number(input.dataset.i!));
            return acc;
          }, []);

          if (!selected.length) return tip("Select at least one element", false, "error");

          const allAreSelected = selected.length === inputs.length;
          onChange(allAreSelected ? undefined : selected);
        }
      },
      {
        label: "Cancel",
        onClick: () => {}
      }
    ]
  });
}

export const MilitaryOptionsDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("militaryOptions"));
  const [units, setUnits] = useState<MilitaryUnitConfig[]>([]);

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
                  <th style={{ width: "5em" }} data-tip="Select allowed biomes">
                    Biomes
                  </th>
                  <th style={{ width: "5em" }} data-tip="Select allowed states">
                    States
                  </th>
                  <th style={{ width: "5em" }} data-tip="Select allowed cultures">
                    Cultures
                  </th>
                  <th style={{ width: "5em" }} data-tip="Select allowed religions">
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
                  const { name, icon, rural, urban, crew, power, type, separate, biomes, states, cultures, religions } =
                    unit;

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
                            <img src={icon} style={{ width: "1.2em", height: "1.2em", pointerEvents: "none" }} alt="" />
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
                          // biome-ignore lint/suspicious/noExplicitAny: biomes not strictly typed on pack
                          title={getLimitTip(biomes, (worldContext.pack as any).biomes || [])}
                          onClick={() => {
                            const bData = worldContext.biomesData;
                            const biomesData = Array(bData.i.length)
                              .fill(null)
                              .map((_, idx) => ({ i: idx, name: bData.name[idx], color: bData.color[idx] }));
                            triggerSelectLimitation("biomes", biomes, biomesData, val =>
                              updateUnit(index, "biomes", val)
                            );
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
                            triggerSelectLimitation("states", states, worldContext.pack?.states || [], val =>
                              updateUnit(index, "states", val)
                            )
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
                            triggerSelectLimitation("cultures", cultures, worldContext.pack?.cultures || [], val =>
                              updateUnit(index, "cultures", val)
                            )
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
                            triggerSelectLimitation("religions", religions, worldContext.pack?.religions || [], val =>
                              updateUnit(index, "religions", val)
                            )
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
          <div style={{ marginTop: "1em" }}>
            <button type="button" onClick={applyMilitaryOptions} style={{ width: "6em", marginRight: "0.5em" }}>
              Apply
            </button>
            <button type="button" onClick={addUnit} style={{ width: "6em", marginRight: "0.5em" }}>
              Add
            </button>
            <button type="button" onClick={restoreDefaults} style={{ width: "8em", marginRight: "0.5em" }}>
              Restore defaults
            </button>
            <button type="button" onClick={() => closeDialog("militaryOptions")} style={{ width: "6em" }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
};
