import type { TreeDisplayMonth } from "../../city3d/treeSeason";
import { type EditorMessageKey, editorText } from "../../i18n/editorMessages";
import i18n from "../../i18n/index";

/** The 3D view's season for trees. A display preference only: never saved in the city or undone. */
export interface SeasonSettings {
  month: TreeDisplayMonth;
  latitude: number;
  standaloneMonth: number;
}

const monthName = (month: number) =>
  new Intl.DateTimeFormat(i18n.language || "en", { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(2001, month - 1, 1))
  );

export function createSeasonControls(
  settings: SeasonSettings,
  /** The map's month and whether the site has monthly climate; read again on `refresh`. */
  source: () => { month?: number; climate: boolean },
  listen: (target: EventTarget, type: string, handler: () => void) => void,
  onChange: () => void
): { panel: HTMLFieldSetElement; refresh(): void } {
  const panel = document.createElement("fieldset");
  panel.className = "ce-fog-settings";
  const legend = document.createElement("legend");
  legend.textContent = editorText("cityEditor.messages.treeSeason");
  const label = document.createElement("label");
  const title = document.createElement("span");
  title.textContent = editorText("cityEditor.messages.treeSeasonMonth");
  const select = document.createElement("select");
  select.name = "treeSeasonMonth";
  const slider = (
    key: "latitude" | "standaloneMonth",
    name: string,
    text: EditorMessageKey,
    min: number,
    max: number
  ) => {
    const label = document.createElement("label");
    const title = document.createElement("span");
    title.textContent = editorText(text);
    const input = document.createElement("input");
    input.type = "range";
    input.name = name;
    input.min = String(min);
    input.max = String(max);
    input.step = "1";
    const output = document.createElement("output");
    const refresh = () => {
      input.value = String(settings[key]);
      output.value = key === "latitude" ? `${settings[key]}°` : String(settings[key]);
      input.setAttribute("aria-valuetext", key === "latitude" ? output.value : monthName(settings[key]));
    };
    listen(input, "input", () => {
      settings[key] = Number(input.value);
      refresh();
      onChange();
    });
    refresh();
    label.append(title, input, output);
    return { label, refresh };
  };
  const latitude = slider("latitude", "treeSeasonLatitude", "cityEditor.messages.treeSeasonLatitude", -90, 90);
  const monthSlider = slider("standaloneMonth", "treeSeasonMonth", "cityEditor.messages.treeSeasonMonth", 1, 12);
  const hint = document.createElement("p");
  hint.textContent = editorText("cityEditor.messages.treeSeasonPreviewHint");
  let shown = "";
  const refresh = () => {
    const { month, climate } = source();
    label.hidden = !climate;
    latitude.label.hidden = climate;
    monthSlider.label.hidden = climate;
    hint.hidden = climate;
    latitude.refresh();
    monthSlider.refresh();
    // Rebuilt only when the site changes, so an open drop-down is never replaced under the viewer.
    const key = `${month}|${climate}|${i18n.language}`;
    if (key === shown) return;
    shown = key;
    select.replaceChildren(
      ...[
        [
          "descriptor",
          month
            ? editorText("cityEditor.messages.treeSeasonFromMap", { month: monthName(month) })
            : editorText("cityEditor.messages.treeSeasonDefault")
        ],
        ...Array.from({ length: 12 }, (_, m) => [String(m + 1), monthName(m + 1)])
      ].map(([value, text]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = text;
        return option;
      })
    );
    select.value = String(settings.month);
  };
  refresh();
  listen(select, "change", () => {
    settings.month = select.value === "descriptor" ? "descriptor" : Number(select.value);
    onChange();
  });
  label.append(title, select);
  panel.append(legend, label, latitude.label, monthSlider.label, hint);
  return { panel, refresh };
}
