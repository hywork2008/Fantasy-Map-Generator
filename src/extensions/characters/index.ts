import "./types"; // activate module augmentation for PackedGraph.characters

import type { ExtensionAPI } from "../../types/extension-api";
import { clearCharacters } from "./advanceAge";
import { clearCharactersContext, getWorldContext, initCharactersContext } from "./charactersContext";
import type { CharacterSkills } from "./characterTypes";
import { CharacterDetailsDialog } from "./ui/dialogs/CharacterDetailsDialog";
import { CharactersOverviewDialog } from "./ui/dialogs/CharactersOverviewDialog";

export const CHARACTERS_EXTENSION_ID = "characters";

let _unsubscribe: (() => void) | null = null;
let _unregisterSkillModifier: (() => void) | null = null;
let _unregisterClearCommand: (() => void) | null = null;

export function init(api: ExtensionAPI): void {
  initCharactersContext(api);

  _unregisterClearCommand = api.registerExtensionCommand({
    extensionId: CHARACTERS_EXTENSION_ID,
    name: "clear",
    execute: value => {
      if (value !== undefined) throw new Error("characters.clear does not accept a payload");
      const characters = getWorldContext().pack.characters;
      if (!characters?.length) return { changed: false };
      clearCharacters();
      return { changed: true };
    }
  });

  api.registerExtension(
    {
      id: CHARACTERS_EXTENSION_ID,
      name: "Characters",
      description:
        "Base character roster (name, age, skills, personality, family) used by Nobility and future NPC extensions."
    },
    false
  );

  // Supplies each character's base skill value to the generic cross-extension skill
  // registry (see src/services/skillModifierService.ts) — e.g. Shipbuilding reads a
  // state's ruler's Engineering skill via api.getEffectiveSkill() without importing
  // Nobility or Characters directly.
  _unregisterSkillModifier = api.registerSkillModifier(CHARACTERS_EXTENSION_ID, (characterId, skill, currentValue) => {
    const character = getWorldContext().pack.characters?.find(c => c.i === characterId);
    if (!character) return currentValue;
    const value = character.skills[skill as keyof CharacterSkills];
    return value ?? currentValue;
  });

  api.registerDialog({
    id: "CharactersOverviewDialog",
    extensionId: CHARACTERS_EXTENSION_ID,
    component: CharactersOverviewDialog
  });

  api.registerDialog({
    id: "CharacterDetailsDialog",
    extensionId: CHARACTERS_EXTENSION_ID,
    component: CharacterDetailsDialog
  });

  api.registerAction({
    id: "characters-view-characters",
    extensionId: CHARACTERS_EXTENSION_ID,
    tab: "tools",
    section: "edit",
    dialogId: "charactersOverview",
    label: "Characters",
    tooltip: "Click to view the generated character roster",
    onClick: () => {
      document.dispatchEvent(new CustomEvent("react-tool-action", { detail: { action: "viewCharacters" } }));
    }
  });

  api.registerToolAction("viewCharacters", () => {
    if (api.isDialogOpen("charactersOverview")) api.closeDialog("charactersOverview");
    else api.openDialog("charactersOverview");
  });

  _unsubscribe = api.subscribeExtensionState((state, prevState) => {
    const isEnabled = state.enabledExtensions[CHARACTERS_EXTENSION_ID];
    const wasEnabled = prevState.enabledExtensions[CHARACTERS_EXTENSION_ID];

    if (!isEnabled && wasEnabled) {
      api.closeDialog("charactersOverview");
      api.closeDialog("characterDetails");
      api.dispatchExtensionCommand({ extensionId: CHARACTERS_EXTENSION_ID, name: "clear", payload: undefined });
    }
  });
}

export function cleanup(api: ExtensionAPI): void {
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }
  if (_unregisterSkillModifier) {
    _unregisterSkillModifier();
    _unregisterSkillModifier = null;
  }
  _unregisterClearCommand?.();
  _unregisterClearCommand = null;

  api.closeDialog("charactersOverview");
  api.closeDialog("characterDetails");
  api.unregisterToolAction("viewCharacters");
  api.unregisterExtension(CHARACTERS_EXTENSION_ID);
  clearCharactersContext();
}
