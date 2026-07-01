import { tip } from "../services/tooltipService";
import { confirmationDialog } from "./editorHelpers";

export interface ConfirmMergeConfig {
  entityType: "state" | "province";
  rulingId: number | null;
  selectedIds: number[];
  getEntityName: (id: number) => string;
  onConfirm: (mergeList: number[], rulingId: number) => void;
}

export function confirmMergeDialog({
  entityType,
  rulingId,
  selectedIds,
  getEntityName,
  onConfirm
}: ConfirmMergeConfig): void {
  if (!rulingId) {
    tip(`Please select a ${entityType} to merge into`, false, "error");
    return;
  }
  const mergeList = selectedIds.filter(id => id !== rulingId);
  if (!mergeList.length) {
    tip(`Please select several ${entityType}s to merge`, false, "error");
    return;
  }
  const plural = entityType === "state" ? "states" : "provinces";
  const pluralData = entityType === "state" ? "burgs, provinces, regiments" : "burgs and cells";
  const coaPrefix = entityType === "state" ? "stateCOA" : "provinceCOA";

  const emblem = (i: number) => `<svg class="coaIcon" viewBox="0 0 200 200"><use href="#${coaPrefix}${i}"></use></svg>`;

  confirmationDialog({
    title: `Merge ${plural}`,
    message: `
      <p>The following ${plural} will be <strong>removed</strong>: ${mergeList.map(id => `${emblem(id)}${getEntityName(id)}`).join(", ")}.</p>
      <p>Removed ${plural} data (${pluralData}) will be assigned to ${emblem(rulingId)}${getEntityName(rulingId)}.</p>
      <p>Are you sure you want to merge ${plural}? This action cannot be reverted.</p>`,
    confirm: "Merge",
    onConfirm: () => onConfirm(mergeList, rulingId)
  });
}
