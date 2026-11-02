import { placementCatalog } from "../../buildings/placementModels";
import { editorText } from "../../i18n/editorMessages";
import type { EditorLifetime } from "../services/editorLifetime";
import type { InteractionState } from "../state/editorSession";
import { div } from "./editorControls";

export function buildBuildingControls(scope: EditorLifetime, interaction: InteractionState, preview: () => void) {
  const controls = div("ce-building-controls");
  controls.hidden = true;
  const catalog = placementCatalog();
  const categories = [...new Set(catalog.map(item => item.category))];
  const category = document.createElement("select");
  category.setAttribute("aria-label", editorText("cityEditor.messages.buildingCategory"));
  for (const name of categories) category.add(new Option(name, name));
  const model = document.createElement("select");
  model.setAttribute("aria-label", editorText("cityEditor.messages.buildingModel"));
  const facing = document.createElement("input");
  facing.type = "number";
  facing.min = "0";
  facing.max = "359";
  facing.step = "1";
  facing.value = "0";
  facing.setAttribute("aria-label", editorText("cityEditor.messages.buildingFacing"));
  const status = document.createElement("output");
  status.className = "ce-building-status";
  function fillModels() {
    model.replaceChildren();
    for (const item of catalog.filter(entry => entry.category === category.value))
      model.add(new Option(item.name, item.id));
  }
  function populate(fromUser: boolean) {
    fillModels();
    interaction.buildingModelId = model.value;
    if (!fromUser) return;
    interaction.buildingEditId = null;
    preview();
  }
  scope.listen(category, "change", () => populate(true));
  scope.listen(model, "change", () => {
    interaction.buildingModelId = model.value;
    interaction.buildingEditId = null;
    preview();
  });
  scope.listen(facing, "input", () => {
    interaction.buildingFacingDegrees = Number(facing.value) || 0;
    preview();
  });
  for (const [title, input] of [
    [editorText("cityEditor.messages.buildingCategory"), category],
    [editorText("cityEditor.messages.buildingModel"), model],
    [editorText("cityEditor.messages.buildingFacing"), facing]
  ] as const) {
    const label = document.createElement("label");
    label.append(title, input);
    controls.append(label);
  }
  const hint = document.createElement("p");
  hint.textContent = editorText("cityEditor.messages.buildingHint");
  controls.append(hint, status);
  if (categories.length) {
    category.value = categories[0];
    populate(false);
  }
  return {
    controls,
    status,
    syncFacing(degrees: number) {
      if (document.activeElement === facing) return;
      facing.value = String(Math.round(((degrees % 360) + 360) % 360));
    },
    syncFromInteraction() {
      const item = catalog.find(entry => entry.id === interaction.buildingModelId);
      if (!item) return;
      if (category.value !== item.category) {
        category.value = item.category;
        fillModels();
      }
      if (model.value !== item.id) model.value = item.id;
      if (document.activeElement !== facing) facing.value = String(Math.round(interaction.buildingFacingDegrees));
    }
  };
}
