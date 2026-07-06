import "./types"; // activate module augmentation for PackedGraph/State
import type { ExtensionAPI } from "../../types/extension-api";
import { Characters } from "./generators/characters-generator";
import { applyAffinitiesToDiplomacy } from "./generators/diplomacy-modifier";
import { clearNobilityContext, getWorldContext, initNobilityContext } from "./nobilityContext";
import { StatesEditorPersonalityTab } from "./ui/components/StatesEditorPersonalityTab";
import { CharacterDetailsDialog } from "./ui/dialogs/CharacterDetailsDialog";
import { CharactersOverviewDialog } from "./ui/dialogs/CharactersOverviewDialog";

export const NOBILITY_EXTENSION_ID = "nobility";

let _unsubscribe: (() => void) | null = null;
let _generatePostCoreHandler: (() => void) | null = null;

export function init(api: ExtensionAPI): void {
  initNobilityContext(api);

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
    }
  };
  document.addEventListener("fmg:generate-post-core", _generatePostCoreHandler);
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

  api.closeDialog("charactersOverview");
  api.unregisterToolAction("viewCharacters");
  api.unregisterExtension(NOBILITY_EXTENSION_ID);
  clearNobilityContext();
}
