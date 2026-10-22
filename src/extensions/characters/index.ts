import "./types"; // activate module augmentation for PackedGraph.characters

import type { ExtensionAPI } from "../../types/extension-api";
import { bindCharactersView } from "./charactersContext";
import { clearPlayerCharacterSelection } from "./controllers/playerCharacter";
import { CHARACTERS_EXTENSION_ID, CHARACTERS_SPECIALIZATIONS_CHANGED_EVENT, charactersSimulation } from "./simulation";
import { useCharactersUiState } from "./ui/charactersUiState";
import { BurgEditorCharactersTab } from "./ui/components/BurgEditorCharactersTab";
import { PlayerCharacterPanel } from "./ui/components/PlayerCharacterPanel";
import { CharacterDetailsDialog } from "./ui/dialogs/CharacterDetailsDialog";
import { CharactersOverviewDialog } from "./ui/dialogs/CharactersOverviewDialog";
import { PlayerCharacterDialog } from "./ui/dialogs/PlayerCharacterDialog";
import { RelationshipCompatibilityDialog } from "./ui/dialogs/RelationshipCompatibilityDialog";

export { CHARACTERS_EXTENSION_ID };

let _unsubscribe: (() => void) | null = null;
let _unregisterSimulation: (() => void) | null = null;

function bumpCharactersRefreshToken(): void {
  useCharactersUiState.getState().bumpRefreshToken();
}

export function init(api: ExtensionAPI): void {
  api.registerExtension(
    {
      id: CHARACTERS_EXTENSION_ID,
      name: "Characters",
      description:
        "Base character roster (name, age, skills, personality, family) used by Nobility and future NPC extensions."
    },
    false
  );
  _unregisterSimulation = api.registerSimulationExtension(charactersSimulation);
  bindCharactersView(api);
  document.addEventListener(CHARACTERS_SPECIALIZATIONS_CHANGED_EVENT, bumpCharactersRefreshToken);
  document.addEventListener("fmg:roster-changed", bumpCharactersRefreshToken);
  document.addEventListener("fmg:roster-stopped", bumpCharactersRefreshToken);

  api.registerEditorTab({
    id: "burg-characters",
    extensionId: CHARACTERS_EXTENSION_ID,
    editorId: "burgEditor",
    label: "Characters",
    component: BurgEditorCharactersTab
  });

  api.registerDialog({
    id: "CharactersOverviewDialog",
    extensionId: CHARACTERS_EXTENSION_ID,
    component: CharactersOverviewDialog
  });

  api.registerDialog({
    id: "RelationshipCompatibilityDialog",
    extensionId: CHARACTERS_EXTENSION_ID,
    component: RelationshipCompatibilityDialog
  });

  api.registerAction({
    id: "characters-relationship-compatibility",
    extensionId: CHARACTERS_EXTENSION_ID,
    tab: "tools",
    section: "edit",
    dialogId: "relationshipCompatibility",
    label: "Character Compatibility",
    tooltip: "Inspect personality compatibility used in solidarity calculations",
    onClick: () => {
      if (api.isDialogOpen("relationshipCompatibility")) api.closeDialog("relationshipCompatibility");
      else api.openDialog("relationshipCompatibility");
    }
  });

  api.registerDialog({
    id: "CharacterDetailsDialog",
    extensionId: CHARACTERS_EXTENSION_ID,
    component: CharacterDetailsDialog
  });

  api.registerDialog({
    id: "PlayerCharacterDialog",
    extensionId: CHARACTERS_EXTENSION_ID,
    component: PlayerCharacterDialog
  });

  // Always-visible top-right player focus. It is owned by Characters so it is
  // available without Nobility or other simulation extensions.
  api.registerDialog({
    id: "PlayerCharacterPanel",
    extensionId: CHARACTERS_EXTENSION_ID,
    component: PlayerCharacterPanel
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

  api.registerAction({
    id: "characters-create-player",
    extensionId: CHARACTERS_EXTENSION_ID,
    tab: "tools",
    section: "edit",
    dialogId: "playerCharacter",
    label: "Player Character",
    tooltip: "Create a named player character with a race and skills",
    onClick: () => {
      document.dispatchEvent(new CustomEvent("react-tool-action", { detail: { action: "createPlayerCharacter" } }));
    }
  });

  api.registerToolAction("createPlayerCharacter", () => {
    if (api.isDialogOpen("playerCharacter")) api.closeDialog("playerCharacter");
    else api.openDialog("playerCharacter");
  });

  api.registerAction({
    id: "characters-settings",
    extensionId: CHARACTERS_EXTENSION_ID,
    tab: "tools",
    section: "edit",
    dialogId: "racePersonNames",
    label: "Character Settings",
    tooltip: "Configure the ability system and races available to new characters",
    onClick: () => {
      document.dispatchEvent(new CustomEvent("react-tool-action", { detail: { action: "charactersSettings" } }));
    }
  });

  api.registerToolAction("charactersSettings", () => {
    if (api.isDialogOpen("racePersonNames")) api.closeDialog("racePersonNames");
    else api.openDialog("racePersonNames");
  });

  _unsubscribe = api.subscribeExtensionState((state, prevState) => {
    const isEnabled = state.enabledExtensions[CHARACTERS_EXTENSION_ID];
    const wasEnabled = prevState.enabledExtensions[CHARACTERS_EXTENSION_ID];

    if (!isEnabled && wasEnabled) {
      api.closeDialog("charactersOverview");
      api.closeDialog("relationshipCompatibility");
      api.closeDialog("characterDetails");
      api.closeDialog("playerCharacter");
      clearPlayerCharacterSelection();
    }
  });
}

export function cleanup(api: ExtensionAPI): void {
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }
  document.removeEventListener(CHARACTERS_SPECIALIZATIONS_CHANGED_EVENT, bumpCharactersRefreshToken);
  document.removeEventListener("fmg:roster-changed", bumpCharactersRefreshToken);
  document.removeEventListener("fmg:roster-stopped", bumpCharactersRefreshToken);
  _unregisterSimulation?.();
  _unregisterSimulation = null;
  bindCharactersView(null);

  api.closeDialog("charactersOverview");
  api.closeDialog("relationshipCompatibility");
  api.closeDialog("characterDetails");
  api.closeDialog("playerCharacter");
  clearPlayerCharacterSelection();
  api.unregisterToolAction("viewCharacters");
  api.unregisterToolAction("createPlayerCharacter");
  api.unregisterToolAction("charactersSettings");
  api.unregisterExtension(CHARACTERS_EXTENSION_ID);
}
