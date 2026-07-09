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
  setConditionFunction,
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
  type DistCondition,
  FEATURE_TYPE_OPTIONS,
  FN_DEFS,
  SHORE_OPTIONS
} from "../../controllers/goodsDistributionExpression";
import { getWorldContext } from "../../economyContext";
import { useGoodsDistributionEditorState } from "../../store/goodsDistributionEditorState";

function getSelectedValues(event: React.ChangeEvent<HTMLSelectElement>): string[] {
  return Array.from(event.target.selectedOptions).map(option => option.value);
}

const styles = {
  wrap: { display: "flex" },
  body: { display: "flex" },
  builder: { display: "flex" },
  condRow: { display: "grid" },
  params: { display: "flex" },
  groupFooter: { display: "flex" },
  output: { display: "flex" },
  metaGrid: { display: "grid" },
  ref: { overflowY: "auto" as const }
};

type BiomeOption = { id: number; name: string; color: string };

function serializeCondition(condition: DistCondition): string {
  return JSON.stringify({
    fnId: condition.fnId,
    negate: condition.negate,
    biomeIds: condition.biomeIds,
    shoreValues: condition.shoreValues,
    typeValues: condition.typeValues,
    numberVal: condition.numberVal
  });
}

function getOccurrenceKey(occurrences: Map<string, number>, signature: string): string {
  const occurrence = occurrences.get(signature) ?? 0;
  occurrences.set(signature, occurrence + 1);
  return `${signature}:${occurrence}`;
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
    return <div>no parameters</div>;
  }

  if (def.paramType === "number") {
    return (
      <div style={styles.params}>
        <input
          type="number"
          value={condition.numberVal}
          placeholder={def.paramLabel || "value"}
          onChange={event => setConditionNumberValue(groupIndex, conditionIndex, event.target.value)}
        />
        {def.paramLabel && <div>{def.paramLabel}</div>}
      </div>
    );
  }

  if (def.paramType === "biomes") {
    return (
      <select
        multiple
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

  if (def.paramType === "shore") {
    return (
      <select
        multiple
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

  return (
    <select
      multiple
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
    const goods = getWorldContext().pack.goods || [];
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
      buttons={[
        { label: "Cancel", onClick: handleClose },
        { label: "Apply", onClick: handleApply }
      ]}
    >
      <div style={styles.wrap} className="fmg-dialog-content overflow-hidden">
        <div className="header">
          Edit the good metadata and its raw resource distribution. Leave distribution empty for manufactured-only
          goods.
        </div>
        <div style={styles.metaGrid}>
          <label>
            <div>Name</div>
            <input value={name} onChange={event => setDraftName(event.target.value)} />
          </label>
          <label>
            <div>Color</div>
            <input type="color" value={color} onChange={event => setDraftColor(event.target.value)} />
          </label>
          <label>
            <div>Value</div>
            <input
              type="number"
              min={0}
              step={1}
              value={value}
              onChange={event => setDraftValue(Number(event.target.value) || 0)}
            />
          </label>
          <label>
            <div>Chance (%)</div>
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
            <div>Unit</div>
            <input value={unit} onChange={event => setDraftUnit(event.target.value)} />
          </label>
          <label>
            <div>Icon</div>
            <input list="goods-icon-options" value={icon} onChange={event => setDraftIcon(event.target.value)} />
            <datalist id="goods-icon-options">
              {iconOptions.map(option => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </label>
          <label>
            <div>Tags</div>
            <input
              value={tagsText}
              onChange={event => setDraftTagsText(event.target.value)}
              placeholder="food, luxury, ore"
            />
          </label>
        </div>
        <div style={styles.body} className="table overflow-hidden">
          <div style={styles.builder}>
            {(() => {
              const groupOccurrences = new Map<string, number>();
              return groups.map((group, groupIndex) => {
                const groupSignature = group.map(serializeCondition).join("&&") || "empty-group";
                const groupKey = getOccurrenceKey(groupOccurrences, groupSignature);
                const conditionOccurrences = new Map<string, number>();

                return (
                  <React.Fragment key={groupKey}>
                    {groupIndex > 0 && <div>OR</div>}
                    <div>
                      {group.map((condition, conditionIndex) => {
                        const def = FN_DEFS.find(item => item.id === condition.fnId);
                        const conditionKey = getOccurrenceKey(conditionOccurrences, serializeCondition(condition));
                        return (
                          <div key={conditionKey}>
                            {conditionIndex > 0 && <div>AND</div>}
                            <div style={styles.condRow}>
                              <label className="d-flex">
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
                              <div style={styles.params}>
                                <ConditionParams
                                  condition={condition}
                                  groupIndex={groupIndex}
                                  conditionIndex={conditionIndex}
                                  biomes={biomes}
                                />
                                {def?.note && <div>{def.note}</div>}
                              </div>
                              <button
                                type="button"
                                className="icon-trash-empty"
                                onClick={() => removeCondition(groupIndex, conditionIndex)}
                              />
                            </div>
                          </div>
                        );
                      })}
                      <div style={styles.groupFooter}>
                        <button type="button" onClick={() => addCondition(groupIndex)}>
                          + Add condition
                        </button>
                        {groups.length > 1 && (
                          <button type="button" className="icon-trash-empty" onClick={() => removeGroup(groupIndex)} />
                        )}
                      </div>
                    </div>
                  </React.Fragment>
                );
              });
            })()}
            <button type="button" onClick={addGroup}>
              + Add OR group
            </button>
            <div style={styles.output}>
              <div>Distribution</div>
              <div className="d-flex">
                <input readOnly value={expression} />
                <span>{cellCountText}</span>
              </div>
              <div>{previewText}</div>
            </div>
          </div>
          <div style={styles.ref}>
            <div>Function Reference</div>
            {FN_DEFS.map(def => {
              const paramSig =
                def.paramType === "none"
                  ? ""
                  : def.paramType === "biomes"
                    ? "id, ..."
                    : def.paramType === "shore"
                      ? "ring, ..."
                      : def.paramType === "featureType"
                        ? '"type", ...'
                        : "value";
              return (
                <div key={def.id}>
                  <code>{`${def.id}(${paramSig})`}</code>
                  <div>{def.description}</div>
                  {def.note && <div>{def.note}</div>}
                </div>
              );
            })}
            <div>
              <div>Biome options</div>
              <div className="d-grid">
                {biomes.map(biome => (
                  <div key={biome.id} className="d-flex">
                    <span style={{ display: "inline-block", background: biome.color }} />
                    {biome.name}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
};
