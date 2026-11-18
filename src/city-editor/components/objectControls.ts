import { OBJECT_CATEGORIES, objectDrawing, placeableObject } from "../../buildings/placeableObjects";
import { placeableObjectsFor } from "../../buildings/placeablePeriod";
import { editorText } from "../../i18n/editorMessages";
import type { HistoricalPeriod } from "../../types/historicalPeriod";
import { objectScale } from "../generators/objectPlacement";
import type { EditorLifetime } from "../services/editorLifetime";
import type { InteractionState } from "../state/editorSession";
import { div } from "./editorControls";

/**
 * Category and model choice for the object tool. The list follows the city's historical period unless the
 * period is ignored; `sync` re-reads the period when the tool is opened.
 */
export function buildObjectControls(
  scope: EditorLifetime,
  interaction: InteractionState,
  preview: () => void,
  period: () => HistoricalPeriod | undefined = () => undefined
) {
  const controls = div("ce-object-controls");
  controls.hidden = true;
  const ignorePeriod = document.createElement("input");
  ignorePeriod.type = "checkbox";
  ignorePeriod.dataset.objectField = "ignorePeriod";
  const category = document.createElement("select");
  category.setAttribute("aria-label", editorText("cityEditor.messages.objectCategory"));
  const offered = () => placeableObjectsFor(period(), ignorePeriod.checked);
  const model = document.createElement("select");
  model.setAttribute("aria-label", editorText("cityEditor.messages.objectModel"));
  const scale = document.createElement("input");
  scale.type = "number";
  scale.min = "0.1";
  scale.max = "10";
  scale.step = "0.1";
  scale.value = "1";
  scale.setAttribute("aria-label", editorText("cityEditor.messages.objectScale"));
  const angle = document.createElement("input");
  angle.type = "number";
  angle.min = "-360";
  angle.max = "360";
  angle.step = "15";
  angle.value = "0";
  angle.setAttribute("aria-label", editorText("cityEditor.messages.rotation"));
  const dimensions = document.createElement("output");
  dimensions.title = editorText("cityEditor.messages.objectDimensions");
  function update() {
    const definition = placeableObject(interaction.objectType)!;
    const { bounds } = objectDrawing(definition);
    dimensions.textContent = `${[bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z, bounds.max.y - bounds.min.y].map(v => (v * interaction.objectScale).toFixed(1)).join(" × ")} m`;
    preview();
  }
  function populateCategories() {
    const previous = category.value,
      objects = offered();
    category.replaceChildren();
    for (const name of OBJECT_CATEGORIES)
      if (objects.some(item => item.category === name)) category.add(new Option(name, name));
    if ([...category.options].some(option => option.value === previous)) category.value = previous;
    populate();
  }
  function populate() {
    const previous = model.value;
    model.replaceChildren();
    for (const definition of offered().filter(item => item.category === category.value))
      model.add(new Option(definition.name, definition.id));
    if ([...model.options].some(option => option.value === previous)) model.value = previous;
    if (!model.value) return;
    if (interaction.objectType !== model.value) {
      interaction.objectType = model.value;
      interaction.objectScale = 1;
      scale.value = "1";
    }
    update();
  }
  scope.listen(category, "change", populate);
  scope.listen(ignorePeriod, "change", populateCategories);
  scope.listen(model, "change", () => {
    interaction.objectType = model.value;
    interaction.objectScale = 1;
    scale.value = "1";
    update();
  });
  scope.listen(scale, "input", () => {
    interaction.objectScale = objectScale(Number(scale.value));
    update();
  });
  scope.listen(angle, "input", () => {
    interaction.objectAngleDegrees = Number(angle.value) || 0;
    update();
  });
  for (const [title, input] of [
    [editorText("cityEditor.messages.objectCategory"), category],
    [editorText("cityEditor.messages.objectModel"), model],
    [editorText("cityEditor.messages.objectScale"), scale],
    [editorText("cityEditor.messages.rotation"), angle]
  ] as const) {
    const label = document.createElement("label");
    label.append(title, input);
    controls.append(label);
  }
  const ignoreLabel = document.createElement("label");
  ignoreLabel.className = "ce-object-ignore-period";
  ignoreLabel.append(ignorePeriod, editorText("cityEditor.messages.ignoreHistoricalPeriod"));
  controls.append(dimensions, ignoreLabel);
  populateCategories();
  return { controls, sync: populateCategories };
}
