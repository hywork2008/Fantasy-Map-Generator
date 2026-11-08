import { type EditorMessageKey, editorText } from "../../../i18n/editorMessages";
import {
  setVectorPlacementLevel,
  setVectorPlacementPolicy,
  transformVectorPlacement
} from "../../generators/vector/editing/placements";
import type { EditorLifetime } from "../../services/editorLifetime";
import type { VectorCityDocument, VectorPlacement } from "../../types/vector/document";

const text = (key: string) => editorText(`cityEditor.vector.dependencies.${key}` as EditorMessageKey);
const generatedHouse = (p: VectorPlacement) =>
  p.origin === "automatic" && (p.building?.kind ?? p.display?.kind) === "housing";
const option = (p: VectorPlacement) => {
  const o = document.createElement("option");
  o.value = p.id;
  o.textContent = `${p.building?.label ?? p.modelId} · ${p.id}${p.editPolicy === "fixed" ? " 🔒" : ""}`;
  return o;
};
export function createVectorPlacementPanel(
  scope: EditorLifetime,
  parent: HTMLElement,
  read: () => VectorCityDocument,
  submit: (doc: VectorCityDocument, label: string) => void,
  /** Read-only current document for selection and display; never mutated. Defaults to a copy. */
  peek: () => Readonly<VectorCityDocument> = read
) {
  const box = document.createElement("fieldset"),
    legend = document.createElement("legend"),
    select = document.createElement("select"),
    status = document.createElement("output");
  select.style.maxWidth = "100%";
  legend.textContent = text("placements");
  select.dataset.placementField = "id";
  box.append(legend, select);
  parent.append(box);
  const number = (key: string) => {
    const label = document.createElement("label"),
      input = document.createElement("input");
    input.type = "number";
    input.step = "any";
    input.dataset.placementField = key;
    label.append(text(key), input);
    box.append(label);
    return input;
  };
  const x = number("east"),
    y = number("north"),
    facing = number("facing"),
    foundation = number("foundationLevel");
  const refreshFields = () => {
    const doc = peek(),
      p = Object.hasOwn(doc.placements, select.value) ? doc.placements[select.value] : undefined;
    if (!p) return;
    x.value = String(p.position[0]);
    y.value = String(p.position[1]);
    facing.value = String(p.facingDegrees);
    const terrain = doc.environment?.terrain;
    foundation.disabled = !terrain;
    foundation.value = String(
      terrain?.plots.find(plot => plot.ownerId === p.id.replace(/^freeform:placement:/, ""))?.levelMeters ?? 0
    );
  };
  scope.listen(select, "change", refreshFields);
  const button = (key: string, action: () => void) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text(key);
    b.dataset.placementAction = key;
    box.append(b);
    scope.listen(b, "click", () => {
      try {
        action();
        status.textContent = "";
      } catch (error) {
        status.textContent = `${text("failed")} ${error instanceof Error ? error.message : String(error)}`;
      }
    });
  };
  button("move", () =>
    submit(
      transformVectorPlacement(read(), select.value, [Number(x.value), Number(y.value)], Number(facing.value)),
      text("move")
    )
  );
  button("lock", () => {
    const doc = read();
    submit(
      setVectorPlacementPolicy(
        doc,
        select.value,
        doc.placements[select.value].editPolicy === "fixed" ? "editable" : "fixed"
      ),
      text("lock")
    );
  });
  button("setFoundation", () =>
    submit(setVectorPlacementLevel(read(), select.value, Number(foundation.value)), text("setFoundation"))
  );
  box.append(status);
  return {
    select(id: string) {
      const doc = peek();
      if (!Object.hasOwn(doc.placements, id)) return;
      // Generated houses are chosen on the map, so they join the list only while selected.
      if (![...select.options].some(o => o.value === id)) {
        for (const o of [...select.options]) if (o.dataset.transient) o.remove();
        const o = option(doc.placements[id]);
        o.dataset.transient = "true";
        select.append(o);
      }
      select.value = id;
      refreshFields();
    },
    refresh() {
      const doc = peek(),
        old = select.value,
        shown = Object.values(doc.placements).filter(p => p.building || p.display);
      box.hidden = !shown.length;
      // A list of every generated house would grow with the city; it lists facilities and authored items.
      select.replaceChildren(...shown.filter(p => !generatedHouse(p) || p.id === old).map(option));
      if (Object.hasOwn(doc.placements, old)) select.value = old;
      refreshFields();
    }
  };
}
