import "./types"; // activate module augmentation for PackedGraph/State

import { Military } from "../../generators/military-generator";
import { advanceAllRegimentMovement } from "../../generators/regimentMovement";
import { BordersRenderer } from "../../renderers/draw-borders";
import { MilitaryRenderer } from "../../renderers/draw-military";
import { StatesRenderer } from "../../renderers/draw-states";
import type { ExtensionAPI } from "../../types/extension-api";
import { advanceCharacterAging } from "../characters/advanceAge";
import { refreshCharactersOverviewIfOpen } from "../characters/controllers/characters-overview";
import { CHARACTERS_EXTENSION_ID } from "../characters/index";
import { applyPersonalityToCapitalGuard } from "./generators/capitalGuardModifier";
import { Characters } from "./generators/characterLifecycle";
import { applyAffinitiesToDiplomacy } from "./generators/diplomacy-modifier";
import { Espionage } from "./generators/espionage-generator";
import { tryRecaptureHomeBurg } from "./generators/homeRecapture";
import { LocalSkirmish } from "./generators/localSkirmish";
import { tryCaptureOnPassing } from "./generators/marchCapture";
import { Mobilization } from "./generators/mobilization";
import { assignOfficers } from "./generators/officerAssignment";
import { assignProvinceLords } from "./generators/provinceLordGenerator";
import { StrategicPlanner } from "./generators/strategic-planner";
import { clearNobilityContext, getWorldContext, initNobilityContext } from "./nobilityContext";
import { StatesEditorPersonalityTab } from "./ui/components/StatesEditorPersonalityTab";

export const NOBILITY_EXTENSION_ID = "nobility";

let _unsubscribe: (() => void) | null = null;
let _generatePostCoreHandler: (() => void) | null = null;

export function init(api: ExtensionAPI): void {
  initNobilityContext(api);

  api.registerExtension(
    {
      id: NOBILITY_EXTENSION_ID,
      name: "Nobility & Characters",
      description: "Adds ruler characters and central government offices for each state.",
      // Nobility assigns titles/offices to, and runs political AI over, characters generated
      // by the Characters extension — it never generates or stores character data itself.
      dependencies: [{ id: CHARACTERS_EXTENSION_ID, required: true }]
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

  api.registerTimeTickHook((deltaYears, deltaMonths, deltaDays) => {
    if (!api.isExtensionEnabled(NOBILITY_EXTENSION_ID)) return;

    const effectiveDeltaYears = deltaYears + deltaMonths / 12 + deltaDays / 365.2425;

    advanceCharacterAging(effectiveDeltaYears);
    Characters.processResignationsAndSuccessions(effectiveDeltaYears);
    assignOfficers();
    assignProvinceLords();

    if (api.simulationContext.currentDay === 1) {
      StrategicPlanner.evaluatePlans();
      Mobilization.conscript(api.worldContext.pack);
    }

    Espionage.generate();
    StrategicPlanner.generate();
    const siegeOccurred = StrategicPlanner.advanceTension();
    const skirmishOccurred = LocalSkirmish.resolve(effectiveDeltaYears, deltaMonths, deltaDays);
    const bordersChanged = siegeOccurred || skirmishOccurred;

    if (bordersChanged) {
      if (api.layerIsOn("toggleStates")) StatesRenderer.render(api.worldContext, api.viewContext, api.appServices);
      if (api.layerIsOn("toggleBorders")) BordersRenderer.render(api.worldContext, api.viewContext, api.appServices);
    }

    Military.updateDynamic(api.worldContext, effectiveDeltaYears);

    // Regiment marching (docs/plan/military-movement.md Phase 2) runs every tick regardless of
    // bordersChanged — armies keep advancing toward their destination continuously rather than
    // teleporting instantly when borders change.
    let marchCaptureOccurred = false;
    const regimentsMoved = advanceAllRegimentMovement(
      api.worldContext.pack,
      api.worldContext,
      effectiveDeltaYears,
      (r, cell) => {
        if (tryRecaptureHomeBurg(r, cell) || tryCaptureOnPassing(r, cell)) marchCaptureOccurred = true;
      },
      StrategicPlanner.getActiveSiegeTargets()
    );

    if (marchCaptureOccurred) {
      if (api.layerIsOn("toggleStates")) StatesRenderer.render(api.worldContext, api.viewContext, api.appServices);
      if (api.layerIsOn("toggleBorders")) BordersRenderer.render(api.worldContext, api.viewContext, api.appServices);
    }

    if ((bordersChanged || marchCaptureOccurred || regimentsMoved) && api.layerIsOn("toggleMilitary")) {
      MilitaryRenderer.render(api.worldContext, api.viewContext, api.appServices);
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

  api.unregisterExtension(NOBILITY_EXTENSION_ID);
  clearNobilityContext();
}
