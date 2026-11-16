import { type EditorMessageKey, editorText } from "../../../i18n/editorMessages";
import { fabricHouseInfo } from "../../generators/vector/fabric/houses";
import { fabricLine, isDetachedFabricLine } from "../../generators/vector/fabric/lines";
import type { EditorLifetime } from "../../services/editorLifetime";
import type { VectorCityDocument } from "../../types/vector/document";

const text = (key: string, values?: Record<string, string>) =>
  editorText(`cityEditor.vector.fabricHouse.${key}` as EditorMessageKey, values);

/** Read-only inspector of one generated house in the fabric records. Derives values for that house only. */
export function createVectorFabricHousePanel(
  scope: EditorLifetime,
  parent: HTMLElement,
  /** Read-only current document; never mutated. */
  peek: () => Readonly<VectorCityDocument>,
  /** Replace the shown house by a manual placement; returns a status message. */
  detach?: (id: string) => string,
  /** Remove the shown house and keep its lot empty; returns a status message. */
  clearHouse?: (id: string) => string,
  /** Move the shown fabric street or lane to a road path; returns a status message. */
  detachLine?: (id: string) => string
) {
  const box = document.createElement("fieldset"),
    legend = document.createElement("legend"),
    list = document.createElement("dl"),
    note = document.createElement("p"),
    action = document.createElement("button"),
    remove = document.createElement("button"),
    toPath = document.createElement("button"),
    status = document.createElement("output");
  box.dataset.vectorFabricHouse = "";
  box.hidden = true;
  legend.textContent = text("title");
  note.textContent = text("editLater");
  note.style.cssText = "margin:4px 0 0;font-size:.9em;opacity:.8";
  list.style.cssText = "display:grid;grid-template-columns:auto 1fr;gap:2px 8px;margin:0";
  action.type = "button";
  action.textContent = text("detach");
  action.dataset.fabricHouseAction = "detach";
  action.hidden = !detach;
  remove.type = "button";
  remove.textContent = text("clear");
  remove.dataset.fabricHouseAction = "clear";
  remove.hidden = !clearHouse;
  status.setAttribute("aria-live", "polite");
  toPath.type = "button";
  toPath.textContent = text("detachLine");
  toPath.dataset.fabricHouseAction = "detachLine";
  toPath.hidden = true;
  box.append(legend, list, note, action, remove, toPath, status);
  scope.listen(toPath, "click", () => {
    if (!shownLine || !detachLine) return;
    const message = detachLine(shownLine);
    status.textContent = message;
    box.hidden = false;
  });
  scope.listen(remove, "click", () => {
    if (!shown || !clearHouse) return;
    const message = clearHouse(shown);
    status.textContent = message;
    box.hidden = false;
  });
  scope.listen(action, "click", () => {
    if (!shown || !detach) return;
    // A successful detach removes the house from the records; the panel stays to report it.
    const message = detach(shown);
    status.textContent = message;
    box.hidden = false;
  });
  parent.append(box);
  scope.own(() => box.remove());
  let shown = "",
    shownLine = "";
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
    shownLine = "";
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
    shownLine = "";
    legend.textContent = text("title");
    note.hidden = action.hidden = remove.hidden = false;
    action.hidden = !detach;
    remove.hidden = !clearHouse;
    toPath.hidden = true;
    status.textContent = "";
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
  /** Shows fabric street or lane `id`; false (and hidden) when it is not a drawn fabric line. */
  const selectLine = (id: string): boolean => {
    const doc = peek(),
      line = fabricLine(doc.fabric, id);
    if (!line || isDetachedFabricLine(doc.fabric, id)) {
      clear();
      return false;
    }
    shown = "";
    shownLine = id;
    legend.textContent = text("lineTitle");
    note.hidden = action.hidden = remove.hidden = true;
    toPath.hidden = !detachLine;
    status.textContent = "";
    list.replaceChildren();
    const length = line.points
      .slice(1)
      .reduce((n, p, i) => n + Math.hypot(p[0] - line.points[i][0], p[1] - line.points[i][1]), 0);
    row("id", text("id"), id);
    row("width", "", text("lineWidth", { value0: line.widthMeters.toFixed(1), value1: length.toFixed(1) }));
    box.hidden = false;
    return true;
  };
  return {
    select,
    selectLine,
    clear,
    /** After a document change: keeps the house while it still exists. */
    refresh() {
      if (shown && !select(shown)) clear();
      else if (shownLine && !selectLine(shownLine)) clear();
    }
  };
}
