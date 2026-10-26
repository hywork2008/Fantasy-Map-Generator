import { OBJECT_CATEGORIES, objectDrawing, PLACEABLE_OBJECTS, placeableObject } from "../../buildings/placeableObjects";
import { editorText } from "../../i18n/editorMessages";
import { objectScale } from "../generators/objectPlacement";
import type { EditorLifetime } from "../services/editorLifetime";
import type { InteractionState } from "../state/editorSession";
import { div } from "./editorControls";

export function buildObjectControls(scope: EditorLifetime, interaction: InteractionState, preview: () => void) {
  const controls = div("ce-object-controls");
  controls.hidden = true;
  const category = document.createElement("select");
  category.setAttribute("aria-label", editorText("cityEditor.messages.objectCategory"));
  for (const name of OBJECT_CATEGORIES) category.add(new Option(name, name));
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
  function populate() {
    model.replaceChildren();
    for (const definition of PLACEABLE_OBJECTS.filter(item => item.category === category.value))
      model.add(new Option(definition.name, definition.id));
    interaction.objectType = model.value;
    interaction.objectScale = 1;
    scale.value = "1";
    update();
  }
  scope.listen(category, "change", populate);
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
  controls.append(dimensions);
  populate();
  return controls;
}
