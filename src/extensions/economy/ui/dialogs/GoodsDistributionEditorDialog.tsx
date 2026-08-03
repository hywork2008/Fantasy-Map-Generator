import React from "react";
import { closeDialog, Dialog, useDialogState } from "../../../hostUi";

import {
  addCondition,
  addGroup,
  close as closeDistributionEditor,
  type GoodDistributionDraft,
  removeCondition,
  removeGroup,
  setConditionBiomeIds,
  setConditionBiomeTagValues,
  setConditionFunction,
  setConditionHabitatValues,
  setConditionNegate,
  setConditionNumberValue,
  setConditionShoreValues,
  setConditionTypeValues,
  setDraftChance,
  setDraftColor,
  setDraftIcon,
  setDraftName,
  setDraftTagsText,
  setDraftUnit,
  setDraftValue
} from "../../controllers/goods-distribution-editor";
import {
  BIOME_TAG_OPTIONS,
  type DistCondition,
  FEATURE_TYPE_OPTIONS,
  FN_DEFS,
  HABITAT_OPTIONS,
  SHORE_OPTIONS
} from "../../controllers/goodsDistributionExpression";
import { getGoods, getWorldContext } from "../../economyContext";
import { useGoodsDistributionEditorState } from "../../store/goodsDistributionEditorState";
import "./goodsDistributionEditorDialog.css";

function getSelectedValues(event: React.ChangeEvent<HTMLSelectElement>): string[] {
  return Array.from(event.target.selectedOptions).map(option => option.value);
}

type BiomeOption = { id: number; name: string; color: string };

function serializeCondition(condition: DistCondition): string {
  return JSON.stringify({
    fnId: condition.fnId,
    negate: condition.negate,
    biomeIds: condition.biomeIds,
    biomeTagValues: condition.biomeTagValues,
    shoreValues: condition.shoreValues,
    typeValues: condition.typeValues,
    habitatValues: condition.habitatValues,
    numberVal: condition.numberVal
  });
}

function getOccurrenceKey(occurrences: Map<string, number>, signature: string): string {
  const occurrence = occurrences.get(signature) ?? 0;
  occurrences.set(signature, occurrence + 1);
  return `${signature}:${occurrence}`;
}

function paramSignature(def: (typeof FN_DEFS)[number]): string {
  switch (def.paramType) {
    case "none":
      return "";
    case "biomes":
      return "id, ...";
    case "biomeTags":
      return '"tag", ...';
    case "shore":
      return "ring, ...";
    case "featureType":
      return '"type", ...';
    case "habitats":
      return '"habitat", ...';
    default:
      return "value";
  }
}

const ConditionParams: React.FC<{
  condition: DistCondition;
  groupIndex: number;
  conditionIndex: number;
  biomes: BiomeOption[];
}> = ({ condition, groupIndex, conditionIndex, biomes }) => {
  const def = FN_DEFS.find(item => item.id === condition.fnId);
  if (!def) return null;

  if (def.paramType === "none") {
    return <div className="gde__params-empty">no parameters</div>;
  }

  if (def.paramType === "number") {
    return (
      <div className="gde__params">
        <input
          type="number"
          value={condition.numberVal}
          placeholder={def.paramLabel || "value"}
          onChange={event => setConditionNumberValue(groupIndex, conditionIndex, event.target.value)}
        />
        {def.paramLabel && <div className="gde__params-label">{def.paramLabel}</div>}
      </div>
    );
  }

  if (def.paramType === "biomes") {
    return (
      <select
        multiple
        className="gde__multi"
        size={6}
        value={condition.biomeIds.map(String)}
        onChange={event => setConditionBiomeIds(groupIndex, conditionIndex, getSelectedValues(event).map(Number))}
      >
        {biomes.map(biome => (
          <option key={biome.id} value={String(biome.id)}>
            {biome.name}
          </option>
        ))}
      </select>
    );
  }

  if (def.paramType === "biomeTags") {
    return (
      <select
        multiple
        className="gde__multi"
        size={6}
        value={condition.biomeTagValues}
        onChange={event => setConditionBiomeTagValues(groupIndex, conditionIndex, getSelectedValues(event))}
      >
        {BIOME_TAG_OPTIONS.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (def.paramType === "shore") {
    return (
      <select
        multiple
        className="gde__multi"
        size={5}
        value={condition.shoreValues}
        onChange={event => setConditionShoreValues(groupIndex, conditionIndex, getSelectedValues(event))}
      >
        {SHORE_OPTIONS.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (def.paramType === "habitats") {
    const habitatOptions = def.id === "coastalHabitat" ? HABITAT_OPTIONS.slice(0, 4) : HABITAT_OPTIONS.slice(4);
    return (
      <select
        multiple
        className="gde__multi"
        size={6}
        value={condition.habitatValues}
        onChange={event => setConditionHabitatValues(groupIndex, conditionIndex, getSelectedValues(event))}
      >
        {habitatOptions.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <select
      multiple
      className="gde__multi"
      size={5}
      value={condition.typeValues}
      onChange={event => setConditionTypeValues(groupIndex, conditionIndex, getSelectedValues(event))}
    >
      {FEATURE_TYPE_OPTIONS.map(option => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
};

export const GoodsDistributionEditorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("goodsDistributionEditor"));
  const onApply = useDialogState(
    state =>
      state.dialogConfigs.goodsDistributionEditor?.onApply as ((draft: GoodDistributionDraft) => void) | undefined
  );
  const dialogTitle = useGoodsDistributionEditorState(state => state.dialogTitle);
  const name = useGoodsDistributionEditorState(state => state.name);
  const color = useGoodsDistributionEditorState(state => state.color);
  const icon = useGoodsDistributionEditorState(state => state.icon);
  const value = useGoodsDistributionEditorState(state => state.value);
  const unit = useGoodsDistributionEditorState(state => state.unit);
  const tagsText = useGoodsDistributionEditorState(state => state.tagsText);
  const chance = useGoodsDistributionEditorState(state => state.chance);
  const groups = useGoodsDistributionEditorState(state => state.groups);
  const expression = useGoodsDistributionEditorState(state => state.expression);
  const cellCountText = useGoodsDistributionEditorState(state => state.cellCountText);
  const previewText = useGoodsDistributionEditorState(state => state.previewText);
  const isInitialized = useGoodsDistributionEditorState(state => state.isInitialized);
  const biomes = React.useMemo(() => {
    const biomesData = getWorldContext().biomesData;
    return (biomesData.i || []).map(id => ({
      id,
      name: biomesData.name[id] || `Biome ${id}`,
      color: biomesData.color[id] || "#ccc"
    }));
  }, []);
  const iconOptions = React.useMemo(() => {
    const goods = getGoods();
    return Array.from(new Set(goods.map(good => good.icon))).sort();
  }, []);

  if (!isOpen || !isInitialized) return null;

  const handleClose = () => {
    closeDistributionEditor();
    closeDialog("goodsDistributionEditor");
  };

  const handleApply = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    onApply?.({
      dialogTitle,
      name: trimmedName,
      color,
      icon: icon.trim() || "good-wood",
      value,
      unit: unit.trim() || "unit",
      tagsText,
      chance,
      distribution: expression.trim()
    });
    handleClose();
  };

  return (
    <Dialog
      isOpen={isOpen}
      title={dialogTitle}
      onClose={handleClose}
      className="goods-distribution-editor"
      buttons={[
        { label: "Cancel", onClick: handleClose },
        { label: "Apply", onClick: handleApply }
      ]}
    >
      <div className="gde">
        <div className="gde__intro">
          Edit the good metadata and its raw resource distribution. Leave distribution empty for manufactured-only
          goods.
        </div>

        <div className="gde__meta">
          <label>
            <span>Name</span>
            <input value={name} onChange={event => setDraftName(event.target.value)} />
          </label>
          <label>
            <span>Color</span>
            <input type="color" value={color} onChange={event => setDraftColor(event.target.value)} />
          </label>
          <label>
            <span>Value</span>
            <input
              type="number"
              min={0}
              step={1}
              value={value}
              onChange={event => setDraftValue(Number(event.target.value) || 0)}
            />
          </label>
          <label>
            <span>Chance (%)</span>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={chance}
              onChange={event => setDraftChance(Math.max(0, Math.min(100, Number(event.target.value) || 0)))}
            />
          </label>
          <label>
            <span>Unit</span>
            <input value={unit} onChange={event => setDraftUnit(event.target.value)} />
          </label>
          <label>
            <span>Icon</span>
            <input list="goods-icon-options" value={icon} onChange={event => setDraftIcon(event.target.value)} />
            <datalist id="goods-icon-options">
              {iconOptions.map(option => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </label>
          <label className="gde__meta-span2">
            <span>Tags</span>
            <input
              value={tagsText}
              onChange={event => setDraftTagsText(event.target.value)}
              placeholder="food, luxury, ore"
            />
          </label>
        </div>

        <div className="gde__body">
          <div className="gde__builder">
            {(() => {
              const groupOccurrences = new Map<string, number>();
              return groups.map((group, groupIndex) => {
                const groupSignature = group.map(serializeCondition).join("&&") || "empty-group";
                const groupKey = getOccurrenceKey(groupOccurrences, groupSignature);
                const conditionOccurrences = new Map<string, number>();

                return (
                  <React.Fragment key={groupKey}>
                    {groupIndex > 0 && <div className="gde__or-sep">OR</div>}
                    <div className="gde__group">
                      {group.map((condition, conditionIndex) => {
                        const def = FN_DEFS.find(item => item.id === condition.fnId);
                        const conditionKey = getOccurrenceKey(conditionOccurrences, serializeCondition(condition));
                        return (
                          <div key={conditionKey}>
                            {conditionIndex > 0 && <div className="gde__and-sep">AND</div>}
                            <div className="gde__cond-row">
                              <label className="gde__not">
                                <input
                                  type="checkbox"
                                  className="native"
                                  checked={condition.negate}
                                  onChange={event =>
                                    setConditionNegate(groupIndex, conditionIndex, event.target.checked)
                                  }
                                />
                                NOT
                              </label>
                              <select
                                value={condition.fnId}
                                onChange={event => setConditionFunction(groupIndex, conditionIndex, event.target.value)}
                              >
                                {FN_DEFS.map(option => (
                                  <option key={option.id} value={option.id}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              <div className="gde__params">
                                <ConditionParams
                                  condition={condition}
                                  groupIndex={groupIndex}
                                  conditionIndex={conditionIndex}
                                  biomes={biomes}
                                />
                                {def?.note && <div className="gde__params-note">{def.note}</div>}
                              </div>
                              <button
                                type="button"
                                className="icon-trash-empty"
                                onClick={() => removeCondition(groupIndex, conditionIndex)}
                                aria-label="Remove condition"
                              />
                            </div>
                          </div>
                        );
                      })}
                      <div className="gde__group-footer">
                        <button type="button" onClick={() => addCondition(groupIndex)}>
                          + Add condition
                        </button>
                        {groups.length > 1 && (
                          <button
                            type="button"
                            className="icon-trash-empty"
                            onClick={() => removeGroup(groupIndex)}
                            aria-label="Remove OR group"
                          />
                        )}
                      </div>
                    </div>
                  </React.Fragment>
                );
              });
            })()}

            <button type="button" className="gde__add-or" onClick={addGroup}>
              + Add OR group
            </button>

            <div className="gde__output">
              <div className="gde__output-title">Distribution</div>
              <div className="gde__expression-row">
                <textarea
                  className="gde__expression"
                  readOnly
                  rows={2}
                  value={expression}
                  aria-label="Distribution expression"
                />
                <span className="gde__cell-count">{cellCountText}</span>
              </div>
              <div className="gde__preview">{previewText}</div>
            </div>
          </div>

          <aside className="gde__ref">
            <div className="gde__ref-title">Function Reference</div>
            {FN_DEFS.map(def => (
              <div key={def.id} className="gde__ref-card">
                <code>{`${def.id}(${paramSignature(def)})`}</code>
                <div className="gde__ref-desc">{def.description}</div>
                {def.note && <div className="gde__ref-note">{def.note}</div>}
              </div>
            ))}
            <div className="gde__ref-card">
              <div className="gde__ref-title">Biome options</div>
              <div className="gde__biome-list">
                {biomes.map(biome => (
                  <div key={biome.id} className="gde__biome-item">
                    <span className="gde__biome-swatch" style={{ background: biome.color }} />
                    {biome.name}
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </Dialog>
  );
};
