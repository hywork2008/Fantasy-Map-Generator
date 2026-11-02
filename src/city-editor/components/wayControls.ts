import { editorText } from "../../i18n/editorMessages";
import { WAY_SLOPE_WIDTH_METERS, WAY_STEPPED_WIDTH_METERS } from "../controllers/tools/wayTool";
import type { EditorLifetime } from "../services/editorLifetime";
import type { InteractionState } from "../state/editorSession";
import type { FreeformWay } from "../types/terrain";
import { div } from "./editorControls";

export function buildWayControls(
  scope: EditorLifetime,
  interaction: InteractionState,
  preview: () => void,
  remove: (id: string) => void
) {
  interaction.wayProfile ??= "stepped";
  interaction.waySurface ??= "dirt";
  interaction.wayGrade ??= "cart";
  interaction.wayWidthMeters ||= interaction.wayProfile === "slope" ? WAY_SLOPE_WIDTH_METERS : WAY_STEPPED_WIDTH_METERS;
  interaction.wayPoints ??= [];
  const controls = div("ce-way-controls");
  controls.hidden = true;
  const profile = select(
    [
      ["stepped", editorText("cityEditor.messages.wayStepped")],
      ["slope", editorText("cityEditor.messages.waySlope")]
    ],
    editorText("cityEditor.messages.wayProfile"),
    interaction.wayProfile
  );
  const surface = select(
    [
      ["dirt", editorText("cityEditor.messages.wayDirt")],
      ["paved", editorText("cityEditor.messages.wayPaved")],
      ["cobble", editorText("cityEditor.messages.wayCobble")]
    ],
    editorText("cityEditor.messages.waySurface"),
    interaction.waySurface
  );
  const grade = select(
    [
      ["cart", editorText("cityEditor.messages.wayCart")],
      ["approach", editorText("cityEditor.messages.wayApproach")]
    ],
    editorText("cityEditor.messages.wayGrade"),
    interaction.wayGrade
  );
  const width = document.createElement("input");
  width.type = "number";
  width.min = "0.5";
  width.max = "40";
  width.step = "0.5";
  width.value = String(interaction.wayWidthMeters);
  width.setAttribute("aria-label", editorText("cityEditor.messages.wayWidth"));
  const status = document.createElement("output");
  status.className = "ce-way-status";
  const list = div("ce-way-list");
  scope.listen(profile, "change", () => {
    interaction.wayProfile = profile.value === "slope" ? "slope" : "stepped";
    interaction.wayWidthMeters = interaction.wayProfile === "slope" ? WAY_SLOPE_WIDTH_METERS : WAY_STEPPED_WIDTH_METERS;
    width.value = String(interaction.wayWidthMeters);
    preview();
  });
  scope.listen(surface, "change", () => {
    interaction.waySurface = surface.value === "paved" || surface.value === "cobble" ? surface.value : "dirt";
    preview();
  });
  scope.listen(grade, "change", () => {
    interaction.wayGrade = grade.value === "approach" ? "approach" : "cart";
    preview();
  });
  scope.listen(width, "input", () => {
    const value = Number(width.value);
    if (value >= 0.5 && value <= 40) interaction.wayWidthMeters = value;
    preview();
  });
  for (const [title, input] of [
    [editorText("cityEditor.messages.wayProfile"), profile],
    [editorText("cityEditor.messages.waySurface"), surface],
    [editorText("cityEditor.messages.wayGrade"), grade],
    [editorText("cityEditor.messages.wayWidth"), width]
  ] as const) {
    const label = document.createElement("label");
    label.append(title, input);
    controls.append(label);
  }
  const hint = document.createElement("p");
  hint.textContent = editorText("cityEditor.messages.wayHint");
  controls.append(hint, status, list);
  return {
    controls,
    status,
    sync(ways: readonly FreeformWay[]) {
      const signature = ways.map(way => way.id).join("|");
      if (list.dataset.ways === signature) return;
      list.dataset.ways = signature;
      list.replaceChildren();
      ways.forEach((way, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = `${editorText("cityEditor.messages.wayDelete")} ${index + 1}`;
        scope.listen(button, "click", () => remove(way.id));
        list.append(button);
      });
    }
  };
}

function select(options: ReadonlyArray<readonly [string, string]>, label: string, value: string): HTMLSelectElement {
  const node = document.createElement("select");
  node.setAttribute("aria-label", label);
  for (const [optionValue, text] of options) node.add(new Option(text, optionValue));
  node.value = value;
  return node;
}
