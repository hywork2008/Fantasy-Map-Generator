import { OBJECT_CATEGORIES, placeableObject } from "../../../buildings/placeableObjects";
import { placeableObjectsFor } from "../../../buildings/placeablePeriod";
import { type EditorMessageKey, editorText } from "../../../i18n/editorMessages";
import { addVectorObject, isVectorObject, removeVectorObject } from "../../generators/vector/editing/objects";
import type { EditorLifetime } from "../../services/editorLifetime";
import type { VectorCityDocument } from "../../types/vector/document";

const text = (key: string) => editorText(`cityEditor.vector.objects.${key}` as EditorMessageKey);

/**
 * Object tool of the meshless editor: picks a catalogue model and places it where the map is clicked.
 * The list follows the city's historical period unless the period is ignored.
 */
export function createVectorObjectPanel(
  scope: EditorLifetime,
  parent: HTMLElement,
  map: HTMLElement,
  read: () => VectorCityDocument,
  commit: (doc: VectorCityDocument, label: string) => void,
  /** Read-only current document; never mutated. */
  peek: () => Readonly<VectorCityDocument> = read,
  placed: (id: string) => void = () => {}
) {
  const box = document.createElement("fieldset"),
    legend = document.createElement("legend"),
    status = document.createElement("output");
  box.dataset.vectorObjects = "";
  box.style.cssText = "display:flex;flex-direction:column;gap:6px";
  legend.textContent = text("title");
  box.append(legend);
  parent.append(box);
  const labelled = <T extends HTMLElement>(key: string, input: T) => {
    const label = document.createElement("label");
    label.append(text(key), input);
    box.append(label);
    return input;
  };
  const ignorePeriod = document.createElement("input");
  ignorePeriod.type = "checkbox";
  ignorePeriod.dataset.objectField = "ignorePeriod";
  const ignoreLabel = document.createElement("label");
  ignoreLabel.append(ignorePeriod, text("ignorePeriod"));
  box.append(ignoreLabel);
  const category = labelled("category", document.createElement("select"));
  category.dataset.objectField = "category";
  const model = labelled("model", document.createElement("select"));
  model.dataset.objectField = "model";
  const facing = labelled("facing", document.createElement("input"));
  facing.type = "number";
  facing.min = "0";
  facing.max = "359";
  facing.step = "15";
  facing.value = "0";
  facing.dataset.objectField = "facing";
  const offered = () => placeableObjectsFor(peek().context.historicalPeriod, ignorePeriod.checked);
  const fill = (select: HTMLSelectElement, options: readonly [string, string][]) => {
    const previous = select.value;
    select.replaceChildren(...options.map(([value, name]) => new Option(name, value)));
    if (options.some(([value]) => value === previous)) select.value = previous;
  };
  const fillModels = () => {
    fill(
      model,
      offered()
        .filter(item => item.category === category.value)
        .map(item => [item.id, item.name])
    );
    place.disabled = !model.value;
    if (!model.value) stop();
  };
  const fillCategories = () => {
    const objects = offered();
    fill(
      category,
      OBJECT_CATEGORIES.filter(name => objects.some(item => item.category === name)).map(name => [name, name])
    );
    fillModels();
  };
  scope.listen(ignorePeriod, "change", fillCategories);
  scope.listen(category, "change", fillModels);

  let placing = false;
  const place = document.createElement("button");
  place.type = "button";
  place.dataset.objectAction = "place";
  box.append(place);
  const showMode = () => {
    place.textContent = text(placing ? "stop" : "place");
    place.setAttribute("aria-pressed", String(placing));
    map.style.cursor = placing ? "crosshair" : "";
  };
  function stop() {
    if (!placing) return;
    placing = false;
    status.textContent = "";
    showMode();
  }
  scope.listen(place, "click", () => {
    placing = !placing && !!model.value;
    status.textContent = placing ? text("placing") : "";
    showMode();
  });
  scope.listen(window, "keydown", event => {
    if (event.key === "Escape") stop();
  });
  scope.own(() => {
    map.style.cursor = "";
  });
  scope.listen(
    map,
    "pointerdown",
    event => {
      if (!placing || event.button !== 0) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const svg = map.querySelector("svg"),
        matrix = svg?.getScreenCTM?.();
      if (!matrix) return;
      const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
      try {
        const name = placeableObject(model.value)?.name ?? model.value;
        const { document: next, placementId } = addVectorObject(
          read(),
          model.value,
          [p.x, -p.y],
          Number(facing.value) || 0
        );
        commit(next, `${text("title")}: ${name}`);
        status.textContent = `${text("placed")} ${name}`;
        placed(placementId);
      } catch (error) {
        const code = error instanceof Error ? error.message : String(error);
        status.textContent = `${text("failed")} ${errorText(code)}`;
      }
    },
    { capture: true }
  );

  const list = labelled("placedList", document.createElement("select"));
  list.dataset.objectField = "placed";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = text("remove");
  remove.dataset.objectAction = "remove";
  box.append(remove, status);
  scope.listen(remove, "click", () => {
    if (!list.value) return;
    try {
      commit(removeVectorObject(read(), list.value), text("remove"));
      status.textContent = "";
    } catch (error) {
      status.textContent = `${text("failed")} ${errorText(error instanceof Error ? error.message : String(error))}`;
    }
  });
  const errorText = (code: string) => {
    const key = `cityEditor.vector.objects.errors.${code}` as EditorMessageKey,
      message = editorText(key);
    return message === key ? code : message;
  };

  showMode();
  fillCategories();
  return {
    refresh() {
      fillCategories();
      const doc = peek();
      fill(
        list,
        Object.values(doc.placements)
          .filter(p => isVectorObject(p.id))
          .map(p => [p.id, `${placeableObject(p.modelId)?.name ?? p.modelId} · ${p.id}`])
      );
      remove.disabled = !list.value;
    },
    select(id: string) {
      if ([...list.options].some(option => option.value === id)) list.value = id;
    }
  };
}
