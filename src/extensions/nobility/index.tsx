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
import {
  applyConflictAutonomy,
  endPlayerConflict,
  mayAdvanceAnyConflict,
  mayAdvanceAutonomousConflict,
  startPlayerConflict
} from "./conflictDirector";
import { applyPersonalityToCapitalGuard } from "./generators/capitalGuardModifier";
import { Characters } from "./generators/characterLifecycle";
import { applyAffinitiesToDiplomacy } from "./generators/diplomacy-modifier";
import { addVoyageIntel, clearVoyageIntel, Espionage } from "./generators/espionage-generator";
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
let _voyageIntelHandler: ((e: Event) => void) | null = null;
let _conflictAutonomyChangedHandler: ((e: Event) => void) | null = null;
let _playerConflictRequestedHandler: ((e: Event) => void) | null = null;
let _playerConflictEndedHandler: ((e: Event) => void) | null = null;

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
      if (mayAdvanceAutonomousConflict()) StrategicPlanner.generate();
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
        if (mayAdvanceAutonomousConflict()) StrategicPlanner.generate();
      }
    } else if (!isEnabled && wasEnabled) {
      Characters.clear();
    }
  });

  _generatePostCoreHandler = () => {
    if (api.isExtensionEnabled(NOBILITY_EXTENSION_ID)) {
      // A new map reuses state ids from 0 — any voyage-intel bonus accrued against the
      // previous map's states must not carry over.
      clearVoyageIntel();
      Characters.generate();
      applyAffinitiesToDiplomacy();
      applyPersonalityToCapitalGuard();
      assignOfficers();
      assignProvinceLords();
      Espionage.generate();
      if (mayAdvanceAutonomousConflict()) StrategicPlanner.generate();
    }
  };
  document.addEventListener("fmg:generate-post-core", _generatePostCoreHandler);

  // Listen for Shipbuilding's trade-voyage espionage (optional dependency — harmless
  // no-op if Shipbuilding is never enabled). State-navy hulls posing as merchants feed
  // an intrigue bonus into Espionage.generate()'s next recompute rather than writing
  // simulationContext.intelligence directly, since that's fully overwritten every tick
  // by Espionage.generate() itself. See docs/plan/ships.md ("航海訓練・偽装通商・諜報（暫定案）").
  _voyageIntelHandler = e => {
    if (!api.isExtensionEnabled(NOBILITY_EXTENSION_ID)) return;
    const { observerStateId, targetStateId, amount } = (e as CustomEvent).detail as {
      observerStateId: number;
      targetStateId: number;
      amount: number;
    };
    if (!(amount > 0)) return;
    addVoyageIntel(observerStateId, targetStateId, amount);
  };
  document.addEventListener("fmg:shipbuilding-voyage-intel", _voyageIntelHandler);

  _conflictAutonomyChangedHandler = event => {
    const detail = (event as CustomEvent<unknown>).detail;
    const mode =
      typeof detail === "object" && detail !== null && "mode" in detail
        ? (detail as { mode: unknown }).mode
        : undefined;
    applyConflictAutonomy(mode);
  };
  document.addEventListener("fmg:conflict-autonomy-changed", _conflictAutonomyChangedHandler);

  _playerConflictRequestedHandler = event => {
    if (!api.isExtensionEnabled(NOBILITY_EXTENSION_ID)) return;
    const detail = (event as CustomEvent<unknown>).detail;
    if (
      typeof detail !== "object" ||
      detail === null ||
      !("attackerStateId" in detail) ||
      !("defenderStateId" in detail)
    ) {
      return;
    }
    startPlayerConflict(detail as { attackerStateId: number; defenderStateId: number });
  };
  document.addEventListener("fmg:player-conflict-requested", _playerConflictRequestedHandler);

  _playerConflictEndedHandler = event => {
    const detail = (event as CustomEvent<unknown>).detail;
    if (
      typeof detail !== "object" ||
      detail === null ||
      !("attackerStateId" in detail) ||
      !("defenderStateId" in detail)
    ) {
      return;
    }
    endPlayerConflict(detail as { attackerStateId: number; defenderStateId: number });
  };
  document.addEventListener("fmg:player-conflict-ended", _playerConflictEndedHandler);

  api.registerTimeTickHook((deltaYears, deltaMonths, deltaDays) => {
    if (!api.isExtensionEnabled(NOBILITY_EXTENSION_ID)) return;

    const effectiveDeltaYears = deltaYears + deltaMonths / 12 + deltaDays / 365.2425;

    advanceCharacterAging(effectiveDeltaYears);
    Characters.processResignationsAndSuccessions(effectiveDeltaYears);
    assignOfficers();
    assignProvinceLords();

    const canAdvanceConflict = mayAdvanceAnyConflict();
    if (api.simulationContext.currentDay === 1) {
      if (canAdvanceConflict) StrategicPlanner.evaluatePlans();
      Mobilization.conscript(api.worldContext.pack);
    }

    Espionage.generate();
    if (canAdvanceConflict) StrategicPlanner.generate();
    const siegeOccurred = canAdvanceConflict ? StrategicPlanner.advanceTension() : false;
    const skirmishOccurred = canAdvanceConflict
      ? LocalSkirmish.resolve(effectiveDeltaYears, deltaMonths, deltaDays)
      : false;
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
        if (!canAdvanceConflict) return;
        if (tryRecaptureHomeBurg(r, cell) || tryCaptureOnPassing(r, cell)) marchCaptureOccurred = true;
      },
      canAdvanceConflict ? StrategicPlanner.getActiveSiegeTargets() : undefined
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
  if (_voyageIntelHandler) {
    document.removeEventListener("fmg:shipbuilding-voyage-intel", _voyageIntelHandler);
    _voyageIntelHandler = null;
  }
  if (_conflictAutonomyChangedHandler) {
    document.removeEventListener("fmg:conflict-autonomy-changed", _conflictAutonomyChangedHandler);
    _conflictAutonomyChangedHandler = null;
  }
  if (_playerConflictRequestedHandler) {
    document.removeEventListener("fmg:player-conflict-requested", _playerConflictRequestedHandler);
    _playerConflictRequestedHandler = null;
  }
  if (_playerConflictEndedHandler) {
    document.removeEventListener("fmg:player-conflict-ended", _playerConflictEndedHandler);
    _playerConflictEndedHandler = null;
  }
  clearVoyageIntel();

  api.unregisterExtension(NOBILITY_EXTENSION_ID);
  clearNobilityContext();
}
