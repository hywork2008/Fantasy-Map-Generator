import "./types"; // activate module augmentation for PackedGraph/State

import { Military } from "../../generators/military-generator";
import { BordersRenderer } from "../../renderers/draw-borders";
import { MilitaryRenderer } from "../../renderers/draw-military";
import { StatesRenderer } from "../../renderers/draw-states";
import type { ExtensionAPI } from "../../types/extension-api";
import { refreshCharactersOverviewIfOpen } from "./controllers/characters-overview";
import { applyPersonalityToCapitalGuard } from "./generators/capitalGuardModifier";
import { Characters } from "./generators/characters-generator";
import type { CharacterSkills } from "./generators/characterTypes";
import { applyAffinitiesToDiplomacy } from "./generators/diplomacy-modifier";
import { Espionage } from "./generators/espionage-generator";
import { LocalSkirmish } from "./generators/localSkirmish";
import { assignOfficers } from "./generators/officerAssignment";
import { assignProvinceLords } from "./generators/provinceLordGenerator";
import { StrategicPlanner } from "./generators/strategic-planner";
import { clearNobilityContext, getWorldContext, initNobilityContext } from "./nobilityContext";
import { StatesEditorPersonalityTab } from "./ui/components/StatesEditorPersonalityTab";
import { CharacterDetailsDialog } from "./ui/dialogs/CharacterDetailsDialog";
import { CharactersOverviewDialog } from "./ui/dialogs/CharactersOverviewDialog";

export const NOBILITY_EXTENSION_ID = "nobility";

let _unsubscribe: (() => void) | null = null;
let _generatePostCoreHandler: (() => void) | null = null;
let _unregisterSkillModifier: (() => void) | null = null;

export function init(api: ExtensionAPI): void {
  initNobilityContext(api);

  // Supplies each character's base skill value to the generic cross-extension skill
  // registry (see src/services/skillModifierService.ts) — e.g. Shipbuilding reads a
  // state's ruler's Engineering skill via api.getEffectiveSkill() without importing
  // Nobility directly.
  _unregisterSkillModifier = api.registerSkillModifier(NOBILITY_EXTENSION_ID, (characterId, skill, currentValue) => {
    const character = getWorldContext().pack.characters?.find(c => c.i === characterId);
    if (!character) return currentValue;
    const value = character.skills[skill as keyof CharacterSkills];
    return value ?? currentValue;
  });

  api.registerExtension(
    {
      id: NOBILITY_EXTENSION_ID,
      name: "Nobility & Characters",
      description: "Adds ruler characters and central government offices for each state."
    },
    false
  );

  api.registerEditorTab({
    id: "states-personality",
    extensionId: NOBILITY_EXTENSION_ID,
    editorId: "statesEditor",
    label: "Personality",
    component: StatesEditorPersonalityTab
  });

  api.registerDialog({
    id: "CharactersOverviewDialog",
    extensionId: NOBILITY_EXTENSION_ID,
    component: CharactersOverviewDialog
  });

  api.registerDialog({
    id: "CharacterDetailsDialog",
    extensionId: NOBILITY_EXTENSION_ID,
    component: CharacterDetailsDialog
  });

  api.registerAction({
    id: "nobility-view-characters",
    extensionId: NOBILITY_EXTENSION_ID,
    tab: "tools",
    section: "edit",
    dialogId: "charactersOverview",
    label: "Characters",
    tooltip: "Click to view generated rulers and government offices",
    onClick: () => {
      document.dispatchEvent(new CustomEvent("react-tool-action", { detail: { action: "viewCharacters" } }));
    }
  });

  api.registerAction({
    id: "nobility-regenerate-characters",
    extensionId: NOBILITY_EXTENSION_ID,
    tab: "tools",
    section: "regenerate",
    label: "Characters",
    tooltip: "Click to regenerate rulers and government offices",
    onClick: () => {
      Characters.generate();
      applyAffinitiesToDiplomacy();
      applyPersonalityToCapitalGuard();
      assignOfficers();
      assignProvinceLords();
      Espionage.generate();
      StrategicPlanner.generate();
    }
  });

  api.registerToolAction("viewCharacters", () => {
    if (api.isDialogOpen("charactersOverview")) api.closeDialog("charactersOverview");
    else api.openDialog("charactersOverview");
  });

  _unsubscribe = api.subscribeExtensionState((state, prevState) => {
    const isEnabled = state.enabledExtensions[NOBILITY_EXTENSION_ID];
    const wasEnabled = prevState.enabledExtensions[NOBILITY_EXTENSION_ID];
    const worldContext = getWorldContext();

    if (isEnabled && !wasEnabled) {
      if (!worldContext.pack.characters || worldContext.pack.characters.length === 0) {
        Characters.generate();
        applyAffinitiesToDiplomacy();
        applyPersonalityToCapitalGuard();
        Espionage.generate();
        StrategicPlanner.generate();
      }
    } else if (!isEnabled && wasEnabled) {
      api.closeDialog("charactersOverview");
      Characters.clear();
    }
  });

  _generatePostCoreHandler = () => {
    if (api.isExtensionEnabled(NOBILITY_EXTENSION_ID)) {
      Characters.generate();
      applyAffinitiesToDiplomacy();
      applyPersonalityToCapitalGuard();
      assignOfficers();
      assignProvinceLords();
      Espionage.generate();
      StrategicPlanner.generate();
    }
  };
  document.addEventListener("fmg:generate-post-core", _generatePostCoreHandler);

  api.registerTimeTickHook(deltaYears => {
    if (!api.isExtensionEnabled(NOBILITY_EXTENSION_ID)) return;
    Characters.advanceAge(deltaYears);
    assignOfficers();
    assignProvinceLords();
    Espionage.generate();
    StrategicPlanner.generate();
    const siegeOccurred = StrategicPlanner.advanceTension();
    const skirmishOccurred = LocalSkirmish.resolve();
    const bordersChanged = siegeOccurred || skirmishOccurred;

    if (bordersChanged) {
      const worldState = window.fmg.actions.getWorldState();
      Military.generate(api.worldContext, api.viewContext, api.appServices, worldState);
      assignOfficers(); // Military.generate() rebuilt state.military from scratch — refill commander slots

      if (api.layerIsOn("toggleStates")) StatesRenderer.render(api.worldContext, api.viewContext, api.appServices);
      if (api.layerIsOn("toggleBorders")) BordersRenderer.render(api.worldContext, api.viewContext, api.appServices);
      if (api.layerIsOn("toggleMilitary")) MilitaryRenderer.render(api.worldContext, api.viewContext, api.appServices);
    }

    refreshCharactersOverviewIfOpen(api.isDialogOpen("charactersOverview"));
  });
}

export function cleanup(api: ExtensionAPI): void {
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }
  if (_generatePostCoreHandler) {
    document.removeEventListener("fmg:generate-post-core", _generatePostCoreHandler);
    _generatePostCoreHandler = null;
  }
  if (_unregisterSkillModifier) {
    _unregisterSkillModifier();
    _unregisterSkillModifier = null;
  }

  api.closeDialog("charactersOverview");
  api.unregisterToolAction("viewCharacters");
  api.unregisterExtension(NOBILITY_EXTENSION_ID);
  clearNobilityContext();
}
