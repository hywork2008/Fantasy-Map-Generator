import { type EditorMessageKey, editorText } from "../../i18n/editorMessages";
import { buildBlockFabric } from "../generators/blockInfill";
import {
  FACILITY_LABELS,
  type FacilityKind,
  MAX_FACILITY_COUNT,
  setFacilityCount
} from "../generators/facilitySettings";
import type { EditorLifetime } from "../services/editorLifetime";
import type { CityDocument } from "../types/document";

/** Uses the same automatic siting/clearance rules as imported FMG facilities. */
export function buildFacilityPanel(ctx: {
  scope: EditorLifetime;
  getDocument: () => CityDocument;
  commit: (next: CityDocument, label: string) => void;
}): { root: HTMLDetailsElement; sync: () => void } {
  const root = document.createElement("details");
  root.className = "ce-facility-controls";
  const summary = document.createElement("summary");
  summary.textContent = editorText("cityEditor.messages.facilityManagement");
  const select = document.createElement("select");
  select.setAttribute("aria-label", summary.textContent);
  for (const [kind, label] of Object.entries(FACILITY_LABELS)) {
    const option = document.createElement("option");
    option.value = kind;
    option.textContent = editorText(`cityEditor.messages.${label}` as EditorMessageKey, { value0: "" }).replace(
      /^（|）$/g,
      ""
    );
    select.append(option);
  }
  const count = document.createElement("input");
  count.type = "number";
  count.min = "0";
  count.max = String(MAX_FACILITY_COUNT);
  count.step = "1";
  count.placeholder = editorText("cityEditor.messages.facilityAutomatic");
  count.setAttribute("aria-label", editorText("cityEditor.messages.facilityCount"));
  const automatic = document.createElement("button");
  automatic.type = "button";
  automatic.textContent = editorText("cityEditor.messages.facilityAutomatic");
  const apply = document.createElement("button");
  apply.type = "button";
  apply.textContent = editorText("cityEditor.messages.facilityApply");
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = editorText("cityEditor.messages.facilityRemove");
  const status = document.createElement("output");
  status.setAttribute("aria-live", "polite");
  const kind = () => select.value as FacilityKind;
  const sync = () => {
    count.max = kind() === "gallows" ? "1" : String(MAX_FACILITY_COUNT);
    count.value = ctx.getDocument().facilityCounts?.[kind()]?.toString() ?? "";
    const enabled = !!ctx.getDocument().fabric?.generation;
    if (enabled && root.open) {
      const plan = buildBlockFabric(ctx.getDocument()).aerialLandmarks;
      const selected = kind();
      let actual = 0;
      if (plan) {
        actual += plan.monasteries.filter(m => m.kind === selected).length;
        actual += plan.guildHalls.filter(h => h.domain === selected).length;
        actual += plan.guildYards.filter(y => y.kind === selected).length;
        actual += plan.storageYards.filter(y =>
          selected === "publicGranary" ? y.origin === "publicWorks" : y.form === selected && !y.origin
        ).length;
        actual += plan.gateInns.filter(i => i.kind === selected).length;
        if (selected === "tannery") actual = plan.tanneries.length;
        if (selected === "gallows") actual = plan.gallows.length;
      }
      status.textContent = editorText("cityEditor.messages.facilityPlacedCount", { value0: actual });
    } else status.textContent = "";
    // Generated towns have the road and land-use context needed by these works.
    apply.disabled = remove.disabled = automatic.disabled = count.disabled = !enabled;
  };
  ctx.scope.listen(select, "change", sync);
  ctx.scope.listen(root, "toggle", sync);
  ctx.scope.listen(apply, "click", () => {
    if (!count.value || !count.reportValidity()) return;
    ctx.commit(setFacilityCount(ctx.getDocument(), kind(), count.valueAsNumber), summary.textContent!);
    sync();
  });
  ctx.scope.listen(remove, "click", () => {
    ctx.commit(setFacilityCount(ctx.getDocument(), kind(), 0), summary.textContent!);
    sync();
  });
  ctx.scope.listen(automatic, "click", () => {
    ctx.commit(setFacilityCount(ctx.getDocument(), kind(), undefined), summary.textContent!);
    sync();
  });
  root.append(summary, select, count, apply, remove, automatic, status);
  sync();
  return { root, sync };
}
