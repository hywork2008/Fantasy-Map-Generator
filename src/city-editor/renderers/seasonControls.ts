import type { TreeDisplayMonth } from "../../city3d/treeSeason";
import { editorText } from "../../i18n/editorMessages";
import i18n from "../../i18n/index";

/** The 3D view's month for trees. A display preference only: never saved in the city or undone. */
export interface SeasonSettings {
  month: TreeDisplayMonth;
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
  let shown = "";
  const refresh = () => {
    const { month, climate } = source();
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
    // Older sites carry no monthly climate: every tree keeps its default look.
    select.disabled = !climate;
    select.title = climate ? "" : editorText("cityEditor.messages.treeSeasonNoClimate");
  };
  refresh();
  listen(select, "change", () => {
    settings.month = select.value === "descriptor" ? "descriptor" : Number(select.value);
    onChange();
  });
  label.append(title, select);
  panel.append(legend, label);
  return { panel, refresh };
}
