import { type EditorMessageKey, editorText } from "../../../i18n/editorMessages";
import {
  setVectorPlacementLevel,
  setVectorPlacementPolicy,
  transformVectorPlacement
} from "../../generators/vector/editing/placements";
import type { EditorLifetime } from "../../services/editorLifetime";
import type { VectorCityDocument } from "../../types/vector/document";

const text = (key: string) => editorText(`cityEditor.vector.dependencies.${key}` as EditorMessageKey);
export function createVectorPlacementPanel(
  scope: EditorLifetime,
  parent: HTMLElement,
  read: () => VectorCityDocument,
  submit: (doc: VectorCityDocument, label: string) => void
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
    const p = read().placements[select.value];
    if (!p) return;
    x.value = String(p.position[0]);
    y.value = String(p.position[1]);
    facing.value = String(p.facingDegrees);
    const terrain = read().environment?.terrain;
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
      if (!read().placements[id]) return;
      select.value = id;
      refreshFields();
    },
    refresh() {
      const doc = read(),
        old = select.value;
      box.hidden = !Object.values(doc.placements).some(p => p.building || p.display);
      select.replaceChildren(
        ...Object.values(doc.placements)
          .filter(p => p.building || p.display)
          .map(p => {
            const o = document.createElement("option");
            o.value = p.id;
            o.textContent = `${p.building?.label ?? p.modelId} · ${p.id}${p.editPolicy === "fixed" ? " 🔒" : ""}`;
            return o;
          })
      );
      if (doc.placements[old]) select.value = old;
      refreshFields();
    }
  };
}
