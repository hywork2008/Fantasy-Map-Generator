import { type EditorMessageKey, editorText } from "../../../i18n/editorMessages";
import { fabricHouseInfo } from "../../generators/vector/fabric/houses";
import type { EditorLifetime } from "../../services/editorLifetime";
import type { VectorCityDocument } from "../../types/vector/document";

const text = (key: string, values?: Record<string, string>) =>
  editorText(`cityEditor.vector.fabricHouse.${key}` as EditorMessageKey, values);

/** Read-only inspector of one generated house in the fabric records. Derives values for that house only. */
export function createVectorFabricHousePanel(
  scope: EditorLifetime,
  parent: HTMLElement,
  /** Read-only current document; never mutated. */
  peek: () => Readonly<VectorCityDocument>
) {
  const box = document.createElement("fieldset"),
    legend = document.createElement("legend"),
    list = document.createElement("dl"),
    note = document.createElement("p");
  box.dataset.vectorFabricHouse = "";
  box.hidden = true;
  legend.textContent = text("title");
  note.textContent = text("editLater");
  note.style.cssText = "margin:4px 0 0;font-size:.9em;opacity:.8";
  list.style.cssText = "display:grid;grid-template-columns:auto 1fr;gap:2px 8px;margin:0";
  box.append(legend, list, note);
  parent.append(box);
  scope.own(() => box.remove());
  let shown = "";
  const row = (key: string, label: string, value: string) => {
    const dt = document.createElement("dt"),
      dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = value;
    dd.style.margin = "0";
    dd.dataset.fabricHouseField = key;
    list.append(dt, dd);
  };
  const clear = () => {
    shown = "";
    box.hidden = true;
    list.replaceChildren();
  };
  /** Shows the generated house `id`; false (and hidden) when it is not a current generated house. */
  const select = (id: string): boolean => {
    const info = fabricHouseInfo(peek().fabric, id);
    if (!info) {
      clear();
      return false;
    }
    shown = id;
    list.replaceChildren();
    row("id", text("id"), info.id);
    row("district", text("district"), info.districtId);
    row("storeys", text("storeys"), String(info.storeys));
    row("dwellings", text("dwellings"), String(info.dwellings));
    row("area", "", text("area", { value0: info.areaMeters2.toFixed(1) }));
    row("entrance", "", text("entrance", { value0: info.entrance[0].toFixed(2), value1: info.entrance[1].toFixed(2) }));
    row("wall", "", text(info.insideWall ? "insideWall" : "outsideWall"));
    box.hidden = false;
    return true;
  };
  return {
    select,
    clear,
    /** After a document change: keeps the house while it still exists. */
    refresh() {
      if (shown && !select(shown)) clear();
    }
  };
}
