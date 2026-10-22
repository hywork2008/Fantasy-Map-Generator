import { useCharactersUiState } from "../characters/ui/charactersUiState";
import "./types"; // activate module augmentation for PackedGraph/State

import type { ExtensionAPI } from "../../types/extension-api";
import { refreshCharactersOverviewIfOpen } from "../characters/controllers/characters-overview";
import { CHARACTERS_EXTENSION_ID } from "../characters/simulation";
import { tip } from "../hostServices";
import { exitPlayerMoveMode, requestTravelToBurg } from "./controllers/playerCharacterTravel";
import { bindNobilityView } from "./nobilityContext";
import { NOBILITY_COURT_CHANGED_EVENT, NOBILITY_EXTENSION_ID, nobilitySimulation } from "./simulation";
import { StatesEditorPersonalityTab } from "./ui/components/StatesEditorPersonalityTab";

export { NOBILITY_EXTENSION_ID };

/**
 * Declared locally rather than imported from `../economy` so this extension does not pull the
 * whole economy entry module into its own bundle just to name a dependency — same pattern as
 * `ui/components/PlayerCharacterPanel.tsx`.
 */
const ECONOMY_EXTENSION_ID = "economy";

let _unsubscribe: (() => void) | null = null;
let _unregisterSimulation: (() => void) | null = null;
let _courtChangedHandler: (() => void) | null = null;

export function init(api: ExtensionAPI): void {
  api.registerExtension(
    {
      id: NOBILITY_EXTENSION_ID,
      name: "Nobility & Characters",
      description: "Defines government institutions and generates selected people on demand.",
      // Nobility assigns titles/offices to, and runs political AI over, characters generated
      // by the Characters extension — it never generates or stores character data itself.
      //
      // Economy is optional but real: conquest disrupts a captured burg's guild/academy technique
      // stocks (localDefense.ts), regiments fight on Economy's martial-discipline and individual
      // mastery multipliers, player travel routes on Economy's caravan pathfinder, and new
      // characters are seeded with Economy's starting wealth. Every one of those degrades to a
      // no-op without Economy, so it is not `required` — but leaving it undeclared meant the
      // Extensions tab could not tell the user any of it was missing.
      // docs/plan/economy-coupling-audit.md T4.
      dependencies: [
        { id: CHARACTERS_EXTENSION_ID, required: true },
        { id: ECONOMY_EXTENSION_ID, required: false }
      ]
    },
    false
  );
  _unregisterSimulation = api.registerSimulationExtension(nobilitySimulation);
  bindNobilityView(api);
  _courtChangedHandler = () => {
    refreshCharactersOverviewIfOpen(api.isDialogOpen("charactersOverview"));
  };
  document.addEventListener(NOBILITY_COURT_CHANGED_EVENT, _courtChangedHandler);

  api.registerEditorTab({
    id: "states-personality",
    extensionId: NOBILITY_EXTENSION_ID,
    editorId: "statesEditor",
    label: "Personality",
    component: StatesEditorPersonalityTab
  });

  api.registerAction({
    id: "nobility-regenerate-characters",
    extensionId: NOBILITY_EXTENSION_ID,
    tab: "tools",
    section: "regenerate",
    label: "Organizations",
    tooltip: "Refresh government roles and browse people without replacing existing characters",
    onClick: () => {
      api.dispatchExtensionCommand({
        extensionId: NOBILITY_EXTENSION_ID,
        name: "regenerate",
        payload: { mode: "full" }
      });
      useCharactersUiState.getState().setActiveTab("organizations");
      api.openDialog("charactersOverview");
    }
  });

  // Edit Burg footer "travel here" — same confirm + advance flow as the Player Character Move button.
  api.registerToolAction("travelPlayerCharacterToBurg", detail => {
    if (!api.isExtensionEnabled(NOBILITY_EXTENSION_ID)) {
      tip("Enable Nobility & Characters to travel with a player character", false, "error");
      return;
    }
    const burgId = Number(detail?.burgId);
    if (!Number.isFinite(burgId) || burgId <= 0) {
      tip("Invalid destination burg", false, "error");
      return;
    }
    requestTravelToBurg(burgId);
  });

  _unsubscribe = api.subscribeExtensionState((state, prevState) => {
    const isEnabled = state.enabledExtensions[NOBILITY_EXTENSION_ID];
    const wasEnabled = prevState.enabledExtensions[NOBILITY_EXTENSION_ID];
    if (!isEnabled && wasEnabled) exitPlayerMoveMode();
  });
}

export function cleanup(api: ExtensionAPI): void {
  exitPlayerMoveMode();
  api.unregisterToolAction("travelPlayerCharacterToBurg");
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }
  if (_courtChangedHandler) document.removeEventListener(NOBILITY_COURT_CHANGED_EVENT, _courtChangedHandler);
  _courtChangedHandler = null;
  _unregisterSimulation?.();
  _unregisterSimulation = null;
  bindNobilityView(null);
  api.unregisterExtension(NOBILITY_EXTENSION_ID);
}
