import type React from "react";
import { useEffect, useState } from "react";
import { appServices } from "../../context/appServices";
import { viewContext } from "../../context/viewContext";
import { worldContext } from "../../context/worldContext";
import { Burgs } from "../../generators/burgs-generator";
import { BurgIconsRenderer, BurgLabelsRenderer } from "../../renderers";
import { burgGroupSelectionStore, useBurgGroupSelectionState } from "../../store/burgGroupSelectionState";
import { useBurgsOverviewState } from "../../store/burgsOverviewState";
import { dialogStore, useDialogState } from "../../store/dialogState";
import type { Burg, BurgGroup } from "../../types/models";
import { layerIsOn } from "../../utils/nodeUtils";
import { tip } from "../../utils/uiHelpers";
import { Dialog } from "./Dialog";
import { closeDialog, openConfirm } from "./dialogService";
import { FeaturesSelectionDialog } from "./FeaturesSelectionDialog";
import { SelectionDialog } from "./SelectionDialog";

const GROUP_NAME_REGEXP = /^[\p{L}_][\p{L}\p{N}_-]*$/u;

export const BurgGroupsEditorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("burgGroupsEditor"));
  const selDialog = useBurgGroupSelectionState(s => s.dialog);
  const closeSelDialog = useBurgGroupSelectionState(s => s.close);
  const [groups, setGroups] = useState<(BurgGroup & { _id?: string })[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const initialGroups = JSON.parse(JSON.stringify(worldContext.options.burgs.groups));
      setGroups(initialGroups.map((g: BurgGroup) => ({ ...g, _id: crypto.randomUUID() })));
      setErrorMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAdd = () => {
    setGroups(prev => [
      ...prev,
      {
        name: "",
        active: true,
        order: 1,
        isDefault: prev.length === 0,
        _id: crypto.randomUUID()
      } as BurgGroup & { _id?: string }
    ]);
  };

  const handleRestore = () => {
    const defaultGroups = JSON.parse(JSON.stringify(Burgs.getDefaultGroups()));
    setGroups(defaultGroups.map((g: BurgGroup) => ({ ...g, _id: crypto.randomUUID() })));
  };

  const handleApply = () => {
    if (groups.length === 0) {
      setErrorMsg("At least one group should be defined");
      return;
    }
    const names = groups.map(g => g.name);
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      if (!GROUP_NAME_REGEXP.test(g.name)) {
        setErrorMsg(
          `Group ${i + 1}: Name must start with a letter or underscore and then contain only letters, digits, underscores, or dashes`
        );
        return;
      }
      if (names.filter(n => n === g.name).length > 1) {
        setErrorMsg(`Group name '${g.name}' should be unique`);
        return;
      }
    }
    if (!groups.some(g => g.active)) {
      setErrorMsg("At least one group should be active");
      return;
    }
    if (!groups.some(g => g.isDefault)) {
      setErrorMsg("At least one group should be default");
      return;
    }

    worldContext.options.burgs.groups = JSON.parse(JSON.stringify(groups));
    localStorage.setItem("burg-groups", JSON.stringify(worldContext.options.burgs.groups));

    // put burgs to new groups
    const validBurgs = worldContext.pack.burgs.filter((b: Burg) => b.i && !b.removed);
    const populations = validBurgs
      .map((b: Burg) => b.population)
      .filter((p): p is number => p !== undefined)
      .sort((a, b) => a - b);

    validBurgs.forEach((burg: Burg) => {
      Burgs.defineGroup(burg, populations);
    });

    if (layerIsOn("toggleBurgIcons")) BurgIconsRenderer.render(worldContext, viewContext, appServices);
    if (layerIsOn("toggleLabels")) BurgLabelsRenderer.render(worldContext, viewContext, appServices);

    if (dialogStore.getState().openDialogs.has("burgsOverview")) useBurgsOverviewState.getState().refresh();

    closeDialog("burgGroupsEditor");
  };

  const updateGroup = (index: number, changes: Partial<BurgGroup>) => {
    setGroups(prev => {
      const next = [...prev];
      if ("isDefault" in changes && changes.isDefault) {
        for (const g of next) {
          g.isDefault = false;
        }
      }
      next[index] = { ...next[index], ...changes };
      return next;
    });
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    setGroups(prev => {
      const next = [...prev];
      const temp = next[index - 1];
      next[index - 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  const moveDown = (index: number) => {
    if (index === groups.length - 1) return;
    setGroups(prev => {
      const next = [...prev];
      const temp = next[index + 1];
      next[index + 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  const removeGroup = (index: number) => {
    if (groups.length < 2) {
      tip("At least one group should be defined", false, "error");
      return;
    }
    openConfirm(
      "Are you sure you want to remove the group? <br>This WON'T change the burgs unless the changes are applied",
      {
        title: "Remove group",
        confirm: "Remove",
        onConfirm: () => {
          setGroups(prev => prev.filter((_, i) => i !== index));
        }
      }
    );
  };

  const selectLimitation = (
    index: number,
    byLabel: string,
    data: { i?: number; name?: string; color?: string; removed?: boolean }[],
    initial: number[] | undefined,
    field: "biomes" | "states" | "cultures" | "religions"
  ) => {
    burgGroupSelectionStore.getState().open({
      kind: "items",
      title: "Limit group",
      byLabel,
      items: data,
      initial,
      onApply: selected => {
        updateGroup(index, { [field]: selected && selected.length > 0 ? selected : undefined } as Partial<BurgGroup>);
      }
    });
  };

  const selectFeaturesLimitation = (index: number, initial: Record<string, boolean> = {}) => {
    burgGroupSelectionStore.getState().open({
      kind: "features",
      initial,
      onApply: values => {
        updateGroup(index, { features: Object.keys(values).length ? values : undefined });
      }
    });
  };

  const burgCounts = groups.map(g => {
    return worldContext.pack?.burgs?.filter((burg: Burg) => !burg.removed && burg.group === g.name).length ?? 0;
  });

  return (
    <>
      <Dialog
        isOpen={isOpen}
        title="Configure Burg groups"
        onClose={() => closeDialog("burgGroupsEditor")}
        buttons={[
          { label: "Apply", onClick: handleApply },
          { label: "Add", onClick: handleAdd },
          { label: "Restore", onClick: handleRestore },
          { label: "Cancel", onClick: () => closeDialog("burgGroupsEditor") }
        ]}
        className="fmg-dialog--auto-width fmg-dialog--overflow-hidden"
      >
        <div id="burgGroupsEditorContainer" style={{ overflowY: "auto", overflowX: "hidden", maxHeight: "60vh" }}>
          {errorMsg && <div style={{ color: "#d22", marginBottom: "0.5em" }}>{errorMsg}</div>}
          <table id="burgGroupsTable" className="table">
            <thead>
              <tr>
                <th data-tip="Rendering order: higher values are rendered on top">Order</th>
                <th data-tip="Type group name. Must start with a letter or underscore, followed by letters, digits, underscores, or dashes. Spaces are not allowed">
                  Name
                </th>
                <th data-tip="Burg preview generator">Preview</th>
                <th data-tip="Set min population constraint in population points (see the multiplier in Units Editor)">
                  Min Pop
                </th>
                <th data-tip="Set max population constraint in population points (see the multiplier in Units Editor)">
                  Max Pop
                </th>
                <th data-tip="Set population percentile: 0-100, where 90 means the burg must have a population higher than 90% of all burgs">
                  Pop %
                </th>
                <th data-tip="Select allowed biomes">Biomes</th>
                <th data-tip="Select allowed states">States</th>
                <th data-tip="Select allowed cultures">Cultures</th>
                <th data-tip="Select allowed religions">Religions</th>
                <th data-tip="Select allowed features">Features</th>
                <th data-tip="Number of burgs in group">Count</th>
                <th data-tip="Activate/deactivate group">Active</th>
                <th data-tip="Select group to be assigned if other groups are not passed">Default</th>
                <th data-tip="Assignment order: move group up" />
                <th data-tip="Assignment order: move group down" />
                <th data-tip="Remove group" />
              </tr>
            </thead>
            <tbody id="burgGroupsBody">
              {groups.map((group, index) => (
                <tr key={group._id}>
                  <td data-tip="Rendering order: higher values are rendered on top">
                    <input
                      type="number"
                      min="1"
                      max="999"
                      step="1"
                      required
                      value={group.order || ""}
                      onChange={e => updateGroup(index, { order: e.target.valueAsNumber || 0 })}
                    />
                  </td>
                  <td data-tip="Type group name. Must start with a letter or underscore, followed by letters, digits, underscores, or dashes. Spaces are not allowed">
                    <input
                      type="text"
                      required
                      value={group.name}
                      onChange={e => updateGroup(index, { name: e.target.value })}
                    />
                  </td>
                  <td data-tip="Burg preview generator">
                    <select
                      value={group.preview || ""}
                      onChange={e => updateGroup(index, { preview: e.target.value || undefined })}
                    >
                      <option value="">no</option>
                      <option value="watabou-city">Watabou City</option>
                      <option value="watabou-village">Watabou Village</option>
                      <option value="watabou-dwelling">Watabou Dwelling</option>
                    </select>
                  </td>
                  <td data-tip="Set min population constraint in population points (see the multiplier in Units Editor)">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={group.min ?? ""}
                      onChange={e => updateGroup(index, { min: e.target.value ? e.target.valueAsNumber : undefined })}
                    />
                  </td>
                  <td data-tip="Set max population constraint in population points (see the multiplier in Units Editor)">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={group.max ?? ""}
                      onChange={e => updateGroup(index, { max: e.target.value ? e.target.valueAsNumber : undefined })}
                    />
                  </td>
                  <td data-tip="Set population percentile: 0-100, where 90 means the burg must have a population higher than 90% of all burgs">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="any"
                      value={group.percentile ?? ""}
                      onChange={e =>
                        updateGroup(index, { percentile: e.target.value ? e.target.valueAsNumber : undefined })
                      }
                    />
                  </td>
                  <td data-tip="Select allowed biomes">
                    <button
                      type="button"
                      onClick={() => {
                        const biomes = Array(worldContext.biomesData.i.length)
                          .fill(null)
                          .map((_, i) => ({
                            i,
                            name: worldContext.biomesData.name[i],
                            color: worldContext.biomesData.color[i]
                          }));
                        selectLimitation(index, "biomes", biomes, group.biomes, "biomes");
                      }}
                    >
                      {group.biomes?.length ? "some" : "all"}
                    </button>
                  </td>
                  <td data-tip="Select allowed states">
                    <button
                      type="button"
                      onClick={() =>
                        selectLimitation(index, "states", worldContext.pack.states, group.states, "states")
                      }
                    >
                      {group.states?.length ? "some" : "all"}
                    </button>
                  </td>
                  <td data-tip="Select allowed cultures">
                    <button
                      type="button"
                      onClick={() =>
                        selectLimitation(index, "cultures", worldContext.pack.cultures, group.cultures, "cultures")
                      }
                    >
                      {group.cultures?.length ? "some" : "all"}
                    </button>
                  </td>
                  <td data-tip="Select allowed religions">
                    <button
                      type="button"
                      onClick={() =>
                        selectLimitation(
                          index,
                          "religions",
                          worldContext.pack.religions ?? [],
                          group.religions,
                          "religions"
                        )
                      }
                    >
                      {group.religions?.length ? "some" : "all"}
                    </button>
                  </td>
                  <td data-tip="Select allowed features">
                    <button
                      type="button"
                      onClick={() =>
                        selectFeaturesLimitation(index, group.features as Record<string, boolean> | undefined)
                      }
                    >
                      {group.features && Object.keys(group.features).length ? "some" : "any"}
                    </button>
                  </td>
                  <td data-tip="Number of burgs in group">{burgCounts[index]}</td>
                  <td data-tip="Activate/deactivate group">
                    <input
                      type="checkbox"
                      className="native"
                      checked={group.active}
                      onChange={e => updateGroup(index, { active: e.target.checked })}
                    />
                  </td>
                  <td data-tip="Select group to be assigned if other groups are not passed">
                    <input
                      type="radio"
                      checked={!!group.isDefault}
                      onChange={e => updateGroup(index, { isDefault: e.target.checked })}
                    />
                  </td>
                  <td data-tip="Assignment order: move group up">
                    <button type="button" className="icon-up-big" onClick={() => moveUp(index)} />
                  </td>
                  <td data-tip="Assignment order: move group down">
                    <button type="button" className="icon-down-big" onClick={() => moveDown(index)} />
                  </td>
                  <td data-tip="Remove group">
                    <button type="button" className="icon-trash" onClick={() => removeGroup(index)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Dialog>

      {selDialog?.kind === "items" && (
        <SelectionDialog
          isOpen={true}
          title={selDialog.title}
          byLabel={selDialog.byLabel}
          items={selDialog.items}
          initial={selDialog.initial}
          onApply={selDialog.onApply}
          onClose={closeSelDialog}
        />
      )}
      {selDialog?.kind === "features" && (
        <FeaturesSelectionDialog
          isOpen={true}
          initial={selDialog.initial}
          onApply={selDialog.onApply}
          onClose={closeSelDialog}
        />
      )}
    </>
  );
};
