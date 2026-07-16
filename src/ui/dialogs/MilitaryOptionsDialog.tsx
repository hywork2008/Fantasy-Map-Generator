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
import { useOptionsState } from "../../store/optionsState";
import type { MilitaryUnit } from "../../types/models";
import { sanitizeId } from "../../utils";
import { isGunpowderEraEnabled, isGunpowderEraMilitaryUnit } from "../../utils/gunpowderEra";
import { IconButton } from "../components/IconButton";
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
  const militaryHierarchy = useOptionsState(state => state.militaryHierarchy);
  const [units, setUnits] = useState<MilitaryUnitConfig[]>([]);
  const [gunpowderEraEnabled, setGunpowderEraEnabled] = useState(true);
  const [selectionDialog, setSelectionDialog] = useState<SelectionDialogState>(null);

  useEffect(() => {
    if (isOpen) {
      setUnits([...(worldContext.options?.military || [])]);
      setGunpowderEraEnabled(isGunpowderEraEnabled(worldContext.options));
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

    const updatedUnits = units.map(unit =>
      !gunpowderEraEnabled && isGunpowderEraMilitaryUnit(unit) ? { ...unit, enabled: false } : unit
    );
    worldContext.options.military = updatedUnits;
    worldContext.options.gunpowderEraEnabled = gunpowderEraEnabled;
    useOptionsState.getState().setOption("gunpowderEraEnabled", gunpowderEraEnabled);
    localStorage.setItem("military", JSON.stringify(updatedUnits));
    localStorage.setItem("gunpowderEraEnabled", String(gunpowderEraEnabled));
    Military.generate(worldContext, viewContext, appServices, getWorldState());
    document.dispatchEvent(new CustomEvent("fmg:refresh-military"));
    document.dispatchEvent(new CustomEvent("fmg:gunpowder-era-changed"));
    useMilitaryOverviewState.getState().refresh();
    closeDialog("militaryOptions");
  };

  return (
    <>
      <Dialog isOpen={isOpen} title="Military Options" onClose={() => closeDialog("militaryOptions")}>
        <div id="militaryOptionsContainer">
          <div>
            <div style={{ marginBottom: "10px" }}>
              <label
                htmlFor="militaryHierarchyMode"
                data-tip="Simple keeps the classic fixed field-army cap. Dynamic lets a field army split off ~150-troop detachments to react to a second simultaneous threat, merging them back once it's gone (docs/plan/military-movement.md Phase 4)."
              >
                Army organization:{" "}
              </label>
              <select
                id="militaryHierarchyMode"
                value={militaryHierarchy}
                onChange={e =>
                  useOptionsState.getState().setOption("militaryHierarchy", e.target.value as "simple" | "dynamic")
                }
              >
                <option value="simple">Simple (fixed field armies)</option>
                <option value="dynamic">Dynamic (split/merge detachments)</option>
              </select>
            </div>
            <div style={{ marginBottom: "10px" }}>
              <label
                htmlFor="gunpowderEraEnabled"
                data-tip="Enables artillery recruitment and the Gunpowder and Artillery goods. Turning it off removes them from production and trade."
              >
                <input
                  id="gunpowderEraEnabled"
                  type="checkbox"
                  checked={gunpowderEraEnabled}
                  onChange={event => setGunpowderEraEnabled(event.target.checked)}
                />{" "}
                Enable gunpowder era
              </label>
            </div>
            <div className="table">
              <table id="militaryOptionsTable">
                <thead>
                  <tr>
                    <th data-tip="Enable or disable this unit for recruitment">Enabled</th>
                    <th data-tip="Unit icon">Icon</th>
                    <th data-tip="Unit name. If name is changed for existing unit, old unit will be replaced">
                      Unit name
                    </th>
                    <th data-tip="Select allowed biomes">Biomes</th>
                    <th data-tip="Select allowed states">States</th>
                    <th data-tip="Select allowed cultures">Cultures</th>
                    <th data-tip="Select allowed religions">Religions</th>
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
                    if (!gunpowderEraEnabled && isGunpowderEraMilitaryUnit(unit)) return null;
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
                    const enabled = unit.enabled !== false;

                    return (
                      // biome-ignore lint/suspicious/noArrayIndexKey: military units order is static during rendering unless deleted
                      <tr key={index} style={{ opacity: enabled ? 1 : 0.5 }}>
                        <td>
                          <label
                            style={{ position: "relative", display: "inline-block", width: "32px", height: "18px" }}
                            title={enabled ? "Disable unit" : "Enable unit"}
                          >
                            <input
                              type="checkbox"
                              checked={enabled}
                              onChange={e => updateUnit(index, "enabled", e.target.checked)}
                              style={{
                                position: "absolute",
                                inset: 0,
                                opacity: 0,
                                margin: 0,
                                cursor: "pointer"
                              }}
                            />
                            <span
                              style={{
                                position: "absolute",
                                inset: 0,
                                background: enabled ? "#4a9e4a" : "#aaa",
                                borderRadius: "9px",
                                transition: "background 0.15s",
                                pointerEvents: "none"
                              }}
                            />
                            <span
                              style={{
                                position: "absolute",
                                top: "2px",
                                left: enabled ? "16px" : "2px",
                                width: "14px",
                                height: "14px",
                                borderRadius: "50%",
                                background: "#fff",
                                transition: "left 0.15s",
                                pointerEvents: "none"
                              }}
                            />
                          </label>
                        </td>
                        <td>
                          <button
                            type="button"
                            data-tip="Click to select unit icon"
                            onClick={() => {
                              selectIcon(icon || "🛡️", (val: string) => updateUnit(index, "icon", val));
                            }}
                          >
                            {icon?.startsWith("http") || icon?.startsWith("data:image") ? (
                              <img src={icon} alt="" />
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
                          <IconButton
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
            <div>
              <button type="button" onClick={applyMilitaryOptions}>
                Apply
              </button>
              <button type="button" onClick={addUnit}>
                Add
              </button>
              <button type="button" onClick={restoreDefaults}>
                Restore defaults
              </button>
              <button type="button" onClick={() => closeDialog("militaryOptions")}>
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
