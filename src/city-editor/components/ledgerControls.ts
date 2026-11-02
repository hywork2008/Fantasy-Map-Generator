import { editorText } from "../../i18n/editorMessages";
import { zoneKindOf } from "../controllers/tools/ledgerTool";
import type { EditorLifetime } from "../services/editorLifetime";
import type { InteractionState } from "../state/editorSession";
import type { LandZone } from "../types/freeformCity";
import type { TerrainRiverCorridor } from "../types/terrain";
import { div } from "./editorControls";

export function buildLedgerControls(
  scope: EditorLifetime,
  interaction: InteractionState,
  preview: () => void,
  removeRiver: (id: string) => void,
  removeZone: (id: string) => void
) {
  interaction.riverWidthMeters ||= 8;
  interaction.zoneKind ??= "park";
  interaction.ledgerPoints ??= [];
  const controls = div("ce-ledger-controls");
  controls.hidden = true;
  const width = document.createElement("input");
  width.type = "number";
  width.min = "1";
  width.max = "80";
  width.step = "0.5";
  width.value = String(interaction.riverWidthMeters);
  width.className = "ce-river-width";
  width.setAttribute("aria-label", editorText("cityEditor.messages.freeRiverWidth"));
  const kind = document.createElement("select");
  kind.className = "ce-zone-kind";
  kind.setAttribute("aria-label", editorText("cityEditor.messages.zoneKind"));
  for (const [value, key] of [
    ["park", "cityEditor.messages.zonePark"],
    ["farm", "cityEditor.messages.zoneFarm"],
    ["forest", "cityEditor.messages.zoneForest"]
  ] as const)
    kind.add(new Option(editorText(key), value));
  kind.value = interaction.zoneKind;
  const status = document.createElement("output");
  status.className = "ce-ledger-status";
  const list = div("ce-ledger-list");
  const hint = document.createElement("p");
  hint.className = "ce-ledger-hint";
  scope.listen(width, "input", () => {
    const value = Number(width.value);
    if (value >= 1 && value <= 80) interaction.riverWidthMeters = value;
    preview();
  });
  scope.listen(kind, "change", () => {
    interaction.zoneKind = zoneKindOf(kind.value);
    preview();
  });
  const widthLabel = document.createElement("label");
  widthLabel.className = "ce-river-width-label";
  widthLabel.append(editorText("cityEditor.messages.freeRiverWidth"), width);
  const kindLabel = document.createElement("label");
  kindLabel.className = "ce-zone-kind-label";
  kindLabel.append(editorText("cityEditor.messages.zoneKind"), kind);
  controls.append(widthLabel, kindLabel, hint, status, list);
  return {
    controls,
    status,
    sync(tool: InteractionState["tool"], rivers: readonly TerrainRiverCorridor[], zones: readonly LandZone[]) {
      const zoning = tool === "zone";
      widthLabel.hidden = zoning;
      kindLabel.hidden = !zoning;
      hint.textContent = editorText(zoning ? "cityEditor.messages.zoneHint" : "cityEditor.messages.freeRiverHint");
      const rows = zoning
        ? zones.map(zone => ({ id: zone.id, label: zone.kind }))
        : rivers.map(river => ({ id: river.id, label: "" }));
      const signature = `${tool}|${rows.map(row => row.id).join("|")}`;
      if (list.dataset.rows === signature) return;
      list.dataset.rows = signature;
      list.replaceChildren();
      rows.forEach((row, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = `${editorText(zoning ? "cityEditor.messages.zoneDelete" : "cityEditor.messages.freeRiverDelete")} ${index + 1}`;
        scope.listen(button, "click", () => (zoning ? removeZone(row.id) : removeRiver(row.id)));
        list.append(button);
      });
    }
  };
}
