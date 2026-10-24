import { type EditorMessageKey, editorText } from "../../i18n/editorMessages";
import { generationStages } from "../controllers/generationStages";
import type { EditorLifetime } from "../services/editorLifetime";
import type { GenerationSettings } from "../types/generation";
import { bringPanelToFront, createEditorControls, div } from "./editorControls";

export interface HelpEntry {
  id: string;
  title: EditorMessageKey;
  content: EditorMessageKey[];
}

/** Every static paragraph removed from the controls has an explicit topic here. */
export const OPERATION_HELP_ENTRIES: HelpEntry[] = [
  {
    id: "grid",
    title: "cityEditor.messages.grid",
    content: ["cityEditor.messages.chooseAGridThenPressToStartANewCity"]
  },
  {
    id: "grid-evolution",
    title: "cityEditor.messages.gridEvolution",
    content: ["cityEditor.messages.gridEvolutionSpiralScatterIncrementalVoronoiCentralRelaxationOneIteration"]
  },
  {
    id: "appearance",
    title: "cityEditor.messages.housingCulture",
    content: ["cityEditor.messages.housingAppearanceHelp"]
  },
  {
    id: "generation",
    title: "cityEditor.messages.generateCompleteCity",
    content: ["cityEditor.messages.completeGenerationBuildsWallsStreetsAndBuildingsUseTheSlider"]
  },
  {
    id: "edits",
    title: "cityEditor.messages.generateFromEdits",
    content: ["cityEditor.messages.generateFromEditsHelp"]
  },
  { id: "fort", title: "cityEditor.messages.fortMode", content: ["cityEditor.messages.motteBaileyHelp"] },
  {
    id: "skeleton",
    title: "cityEditor.messages.skeletonFirst",
    content: [
      "cityEditor.messages.skeletonGridNotice",
      "cityEditor.messages.skeletonLater",
      "cityEditor.messages.skeletonBastionEra"
    ]
  },
  {
    id: "elevation",
    title: "cityEditor.messages.elevationPreset",
    content: ["cityEditor.messages.elevationPresetHelp"]
  },
  { id: "relief", title: "cityEditor.messages.elevationRelief", content: ["cityEditor.messages.elevationReliefHelp"] },
  { id: "river-drop", title: "cityEditor.messages.riverDrop", content: ["cityEditor.messages.riverDropHelp"] },
  {
    id: "walls",
    title: "cityEditor.messages.urbanAreaInsideWalls",
    content: ["cityEditor.messages.blankUsesTinySmall100Medium45Large20Approximate"]
  },
  {
    id: "rendering",
    title: "cityEditor.messages.renderQuality",
    content: ["cityEditor.messages.lightweightRenderingOmitsFieldRowsAndPlantingDetailsMinimalRendering"]
  },
  {
    id: "steps",
    title: "cityEditor.messages.nextStep",
    content: ["cityEditor.messages.stepThroughTheLastPressedProcessOneLoopIterationAt"]
  }
];

export function mountOperationHelp(root: HTMLElement, scope: EditorLifetime, settings: () => GenerationSettings): void {
  const { floatingWindow, makeButton } = createEditorControls(scope);
  const panel = floatingWindow("ce-help", editorText("cityEditor.messages.operationHelp"));
  panel.root.hidden = true;
  panel.root.setAttribute("role", "region");
  panel.root.setAttribute("aria-label", editorText("cityEditor.messages.operationHelp"));
  const navigation = document.createElement("nav");
  navigation.className = "ce-help-navigation";
  navigation.setAttribute("aria-label", editorText("cityEditor.messages.helpTopics"));
  const article = document.createElement("article");
  article.className = "ce-help-article";
  article.id = "ce-help-article";
  article.tabIndex = 0;
  const layout = div("ce-help-layout");
  layout.append(navigation, article);
  panel.content.append(layout);
  let selected = "grid";
  let returnFocus: HTMLElement | null = null;
  const close = () => {
    panel.root.hidden = true;
    returnFocus?.focus();
  };
  const closeButton = makeButton("×", close);
  closeButton.setAttribute("aria-label", editorText("cityEditor.messages.closeHelp"));
  scope.listen(closeButton, "pointerdown", event => event.stopPropagation());
  panel.root.querySelector(".ce-panel-titlebar-actions")!.prepend(closeButton);
  const render = () => {
    const entries: HelpEntry[] = [
      ...OPERATION_HELP_ENTRIES,
      ...generationStages(settings()).map(stage => ({
        id: `stage-${stage.id}`,
        title: stage.labelKey,
        content: [stage.hintKey]
      }))
    ];
    const current = entries.find(entry => entry.id === selected) ?? entries[0];
    navigation.replaceChildren();
    for (const entry of entries) {
      const button = makeButton(editorText(entry.title), () => {
        selected = entry.id;
        showArticle(entry);
        for (const item of navigation.querySelectorAll("button")) {
          item.classList.toggle("is-active", item === button);
          if (item === button) item.setAttribute("aria-current", "true");
          else item.removeAttribute("aria-current");
        }
      });
      button.dataset.helpTopic = entry.id;
      button.setAttribute("aria-controls", article.id);
      if (entry === current) {
        button.classList.add("is-active");
        button.setAttribute("aria-current", "true");
      }
      navigation.append(button);
    }
    showArticle(current);
  };
  const showArticle = (entry: HelpEntry) => {
    const heading = document.createElement("h2");
    heading.textContent = editorText(entry.title);
    article.replaceChildren(heading);
    for (const key of entry.content) {
      const paragraph = document.createElement("p");
      paragraph.textContent = editorText(key);
      article.append(paragraph);
    }
    article.scrollTop = 0;
  };
  const open = (topic: string, trigger: HTMLElement) => {
    selected = topic;
    returnFocus = trigger;
    render();
    panel.root.hidden = false;
    if (panel.content.hidden) panel.root.querySelector<HTMLButtonElement>(".ce-panel-collapse")?.click();
    bringPanelToFront(panel.root);
    navigation.querySelector<HTMLButtonElement>('[aria-current="true"]')?.focus();
  };
  const launcher = makeButton(editorText("cityEditor.messages.operationHelp"), () => open(selected, launcher));
  launcher.className = "ce-help-launcher";
  for (const [selector, topic] of [
    [".ce-document", "grid"],
    [".ce-generate", "generation"],
    [".ce-toolbar", "steps"]
  ]) {
    const actions = root.querySelector(`${selector} .ce-panel-titlebar-actions`);
    if (!actions) continue;
    const button = makeButton("?", () => open(topic, button));
    button.className = "ce-panel-help";
    button.setAttribute("aria-label", editorText("cityEditor.messages.operationHelp"));
    scope.listen(button, "pointerdown", event => event.stopPropagation());
    actions.prepend(button);
  }
  scope.listen(panel.root, "keydown", event => {
    event.stopPropagation();
    if (event.key === "Escape") close();
  });
  root.append(panel.root, launcher);
}
