import { type EditorMessageKey, editorText } from "../../i18n/editorMessages";
import type { EditorLifetime } from "../services/editorLifetime";
import type { GenerationSettings } from "../types/generation";
import { div } from "./editorControls";

export function generationSection(title: EditorMessageKey, controls: HTMLElement[], requires?: string) {
  const section = document.createElement("fieldset");
  section.className = "ce-generation-section";
  const legend = document.createElement("legend");
  legend.textContent = editorText(title);
  section.append(legend, ...controls);
  if (requires) section.dataset.generationRequires = requires;
  return section;
}

export function standaloneSettings(...controls: HTMLElement[]) {
  const group = div("ce-standalone-settings");
  group.append(...controls);
  return group;
}

/** Keep nodes mounted: switching tabs must never rerun generation or reset edits. */
export function generationTabs(
  scope: EditorLifetime,
  entries: { id: string; title: EditorMessageKey; content: HTMLElement }[]
) {
  const root = div("ce-generation-workspace");
  const navigation = div("ce-generation-tabs");
  navigation.setAttribute("role", "tablist");
  navigation.setAttribute("aria-label", editorText("cityEditor.generationWorkspace.tabs"));
  const prefix = `ce-generation-${crypto.randomUUID()}`;
  const tabs = entries.map(entry => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.id = `${prefix}-${entry.id}-tab`;
    tab.dataset.generationTab = entry.id;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", `${prefix}-${entry.id}-panel`);
    tab.textContent = editorText(entry.title);
    entry.content.id = `${prefix}-${entry.id}-panel`;
    entry.content.dataset.generationPage = entry.id;
    entry.content.classList.add("ce-generation-tabpanel");
    entry.content.setAttribute("role", "tabpanel");
    entry.content.setAttribute("aria-labelledby", tab.id);
    entry.content.tabIndex = 0;
    navigation.append(tab);
    return tab;
  });
  const select = (index: number) => {
    tabs.forEach((tab, i) => {
      tab.setAttribute("aria-selected", String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      entries[i].content.hidden = i !== index;
    });
  };
  tabs.forEach((tab, index) => {
    scope.listen(tab, "click", () => select(index));
    scope.listen(tab, "keydown", event => {
      const target =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : event.key === "ArrowRight"
              ? (index + 1) % tabs.length
              : event.key === "ArrowLeft"
                ? (index + tabs.length - 1) % tabs.length
                : null;
      if (target === null) return;
      event.preventDefault();
      event.stopPropagation();
      select(target);
      tabs[target].focus();
    });
  });
  select(0);
  root.append(navigation, ...entries.map(entry => entry.content));
  return root;
}

/** Section visibility follows effective map inputs, including imported FMG features. */
export function syncGenerationSections(root: HTMLElement, settings: GenerationSettings) {
  const descriptor = settings.descriptor;
  const features = descriptor?.burg ?? settings.config.features;
  const conditions: Record<string, boolean> = {
    walls: features.walls,
    citadel: features.citadel,
    coast: descriptor ? !!descriptor.waterbody : settings.config.coast !== "none",
    rivers: (descriptor?.rivers ?? settings.config.rivers).length > 0,
    singleRiver: (descriptor?.rivers ?? settings.config.rivers).length === 1,
    terraces: !!settings.terraces,
    elevation: (settings.elevationPreset ?? "flat") !== "flat"
  };
  for (const section of root.querySelectorAll<HTMLElement>("[data-generation-requires]")) {
    section.hidden = !section.dataset.generationRequires!.split(",").every(key => conditions[key]);
  }
  for (const section of root.querySelectorAll<HTMLElement>(".ce-standalone-settings")) section.hidden = !!descriptor;
}
