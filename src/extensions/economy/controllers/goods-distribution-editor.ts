// @ts-nocheck

import {
  getGoodsDistributionEditorState,
  setGoodsDistributionEditorState
} from "../../../store/goodsDistributionEditorState";
import { openDialog } from "../../../ui/dialogs/dialogService";
import { getWorldContext } from "../economyContext";
import { Goods } from "../generators/goods-generator";
import {
  countMatchingCells,
  createDefaultCondition,
  type DistCondition,
  FN_DEFS,
  generateExpression,
  interpretDistribution,
  parseExpression
} from "./goodsDistributionExpression";

const pack = () => getWorldContext().pack;
const biomesData = () => getWorldContext().biomesData;

export interface GoodDistributionDraft {
  dialogTitle?: string;
  name: string;
  color: string;
  icon: string;
  value: number;
  unit: string;
  tagsText: string;
  chance: number;
  distribution: string;
}

const DEFAULT_DRAFT: GoodDistributionDraft = {
  dialogTitle: "Distribution Editor",
  name: "",
  color: "#888888",
  icon: "good-wood",
  value: 1,
  unit: "unit",
  tagsText: "",
  chance: 4,
  distribution: ""
};

function cloneGroups(groups: DistCondition[][]): DistCondition[][] {
  return structuredClone(groups);
}

function resetState(): void {
  setGoodsDistributionEditorState({
    groups: [],
    expression: "",
    cellCountText: "",
    previewText: "",
    activePicker: null,
    isInitialized: false,
    dialogTitle: DEFAULT_DRAFT.dialogTitle,
    name: DEFAULT_DRAFT.name,
    color: DEFAULT_DRAFT.color,
    icon: DEFAULT_DRAFT.icon,
    value: DEFAULT_DRAFT.value,
    unit: DEFAULT_DRAFT.unit,
    tagsText: DEFAULT_DRAFT.tagsText,
    chance: DEFAULT_DRAFT.chance
  });
}

function syncState(groups: DistCondition[][]) {
  const expression = generateExpression(groups);
  const cellCountText = countMatchingCells(expression, pack(), cellId => Goods.getMethods(cellId)) || "";
  const previewText = interpretDistribution(expression, biomesData());

  setGoodsDistributionEditorState({
    groups: cloneGroups(groups),
    expression,
    cellCountText,
    previewText,
    activePicker: null,
    isInitialized: true
  });
}

function open(onApply: (draft: GoodDistributionDraft) => void, draft?: Partial<GoodDistributionDraft>) {
  const initialDraft = { ...DEFAULT_DRAFT, ...draft };
  const groups: DistCondition[][] = parseExpression(initialDraft.distribution) ?? [[createDefaultCondition()]];
  setGoodsDistributionEditorState({
    dialogTitle: initialDraft.dialogTitle,
    name: initialDraft.name,
    color: initialDraft.color,
    icon: initialDraft.icon,
    value: initialDraft.value,
    unit: initialDraft.unit,
    tagsText: initialDraft.tagsText,
    chance: initialDraft.chance
  });
  syncState(groups);
  openDialog("goodsDistributionEditor", { onApply, onClose: resetState });
}

export function close(): void {
  resetState();
}

function updateGroups(mutator: (groups: DistCondition[][]) => void): void {
  const groups = cloneGroups(getGoodsDistributionEditorState().groups);
  mutator(groups);
  if (!groups.length) groups.push([createDefaultCondition()]);
  syncState(groups);
}

export function addGroup(): void {
  updateGroups(groups => {
    groups.push([createDefaultCondition()]);
  });
}

export function addCondition(groupIndex: number): void {
  updateGroups(groups => {
    groups[groupIndex]?.push(createDefaultCondition());
  });
}

export function removeGroup(groupIndex: number): void {
  updateGroups(groups => {
    groups.splice(groupIndex, 1);
  });
}

export function removeCondition(groupIndex: number, conditionIndex: number): void {
  updateGroups(groups => {
    groups[groupIndex]?.splice(conditionIndex, 1);
    if (groups[groupIndex] && !groups[groupIndex].length) groups.splice(groupIndex, 1);
  });
}

export function setConditionNegate(groupIndex: number, conditionIndex: number, negate: boolean): void {
  updateGroups(groups => {
    const condition = groups[groupIndex]?.[conditionIndex];
    if (condition) condition.negate = negate;
  });
}

export function setConditionFunction(groupIndex: number, conditionIndex: number, fnId: string): void {
  updateGroups(groups => {
    const condition = groups[groupIndex]?.[conditionIndex];
    if (!condition) return;
    condition.fnId = fnId;
    condition.biomeIds = [];
    condition.shoreValues = [];
    condition.typeValues = [];
    condition.numberVal = FN_DEFS.find(def => def.id === fnId)?.defaultVal ?? "";
  });
}

export function setConditionNumberValue(groupIndex: number, conditionIndex: number, numberVal: string): void {
  updateGroups(groups => {
    const condition = groups[groupIndex]?.[conditionIndex];
    if (condition) condition.numberVal = numberVal;
  });
}

export function setConditionBiomeIds(groupIndex: number, conditionIndex: number, biomeIds: number[]): void {
  updateGroups(groups => {
    const condition = groups[groupIndex]?.[conditionIndex];
    if (condition) condition.biomeIds = biomeIds;
  });
}

export function setConditionShoreValues(groupIndex: number, conditionIndex: number, shoreValues: string[]): void {
  updateGroups(groups => {
    const condition = groups[groupIndex]?.[conditionIndex];
    if (condition) condition.shoreValues = shoreValues;
  });
}

export function setConditionTypeValues(groupIndex: number, conditionIndex: number, typeValues: string[]): void {
  updateGroups(groups => {
    const condition = groups[groupIndex]?.[conditionIndex];
    if (condition) condition.typeValues = typeValues;
  });
}

export function setDraftName(name: string): void {
  setGoodsDistributionEditorState({ name });
}

export function setDraftColor(color: string): void {
  setGoodsDistributionEditorState({ color });
}

export function setDraftIcon(icon: string): void {
  setGoodsDistributionEditorState({ icon });
}

export function setDraftValue(value: number): void {
  setGoodsDistributionEditorState({ value });
}

export function setDraftUnit(unit: string): void {
  setGoodsDistributionEditorState({ unit });
}

export function setDraftTagsText(tagsText: string): void {
  setGoodsDistributionEditorState({ tagsText });
}

export function setDraftChance(chance: number): void {
  setGoodsDistributionEditorState({ chance });
}

export const DistributionEditor = {
  open,
  close,
  addGroup,
  addCondition,
  removeGroup,
  removeCondition,
  setConditionNegate,
  setConditionFunction,
  setConditionNumberValue,
  setConditionBiomeIds,
  setConditionShoreValues,
  setConditionTypeValues,
  setDraftName,
  setDraftColor,
  setDraftIcon,
  setDraftValue,
  setDraftUnit,
  setDraftTagsText,
  setDraftChance
};
