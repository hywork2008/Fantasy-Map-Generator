import "./types"; // activate module augmentation for PackedGraph/State

import type { ExtensionAPI } from "../../types/extension-api";
import { advanceCharacterAging } from "../characters/advanceAge";
import { refreshCharactersOverviewIfOpen } from "../characters/controllers/characters-overview";
import { CHARACTERS_EXTENSION_ID } from "../characters/index";
import { seedMissingCharacterWealth } from "../economy/generators/characterStipends";
import { advanceAllRegimentMovement, advanceFrontierGovernance, Military } from "../hostCore";
import { tip } from "../hostServices";
import { measureGenerationStep } from "../hostUtils";
import {
  applyConflictAutonomy,
  endPlayerConflict,
  mayAdvanceAnyConflict,
  mayAdvanceAutonomousConflict,
  startPlayerConflict
} from "./conflictDirector";
import {
  clearPlayerCharacterSelection,
  refreshPlayerCharacterSelection,
  selectRandomPlayerCharacter
} from "./controllers/playerCharacter";
import { clearPlayerTravel, requestTravelToBurg, tickPlayerTravel } from "./controllers/playerCharacterTravel";
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
import { PlayerCharacterPanel } from "./ui/components/PlayerCharacterPanel";
import { StatesEditorPersonalityTab } from "./ui/components/StatesEditorPersonalityTab";

export const NOBILITY_EXTENSION_ID = "nobility";

let _unsubscribe: (() => void) | null = null;
let _unregisterMapReadyTask: (() => void) | null = null;
let _voyageIntelHandler: ((e: Event) => void) | null = null;
let _conflictAutonomyChangedHandler: ((e: Event) => void) | null = null;
let _playerConflictRequestedHandler: ((e: Event) => void) | null = null;
let _playerConflictEndedHandler: ((e: Event) => void) | null = null;
let _unregisterRegenerateCommand: (() => void) | null = null;
let _unregisterTickSystem: (() => void) | null = null;

type NobilityRegenerationMode = "bootstrap" | "full";

function isNobilityRegenerationRequest(value: unknown): value is { readonly mode: NobilityRegenerationMode } {
  return (
    !!value &&
    typeof value === "object" &&
    ((value as { mode?: unknown }).mode === "bootstrap" || (value as { mode?: unknown }).mode === "full")
  );
}

function regenerateNobilityData(mode: NobilityRegenerationMode): void {
  Characters.generate();
  applyAffinitiesToDiplomacy();
  applyPersonalityToCapitalGuard();
  if (mode === "full") {
    assignOfficers();
    assignProvinceLords();
  }
  Espionage.generate();
  if (mayAdvanceAutonomousConflict()) StrategicPlanner.generate();
  // Fabricate starting wealth for any newly-created titled/roled character so they aren't
  // stuck at 0 until the next Advance Time tick (docs/plan/state-treasury-department-budget.md
  // §7 item 8). Only ever touches characters still at wealth=0, so re-running this on every
  // regenerate is safe.
  seedMissingCharacterWealth();
  // Government roster was rebuilt — re-roll the focus character for the player HUD.
  selectRandomPlayerCharacter();
}

export function init(api: ExtensionAPI): void {
  initNobilityContext(api);

  _unregisterRegenerateCommand = api.registerExtensionCommand({
    extensionId: NOBILITY_EXTENSION_ID,
    name: "regenerate",
    topics: ["extension.characters", "extension.nobility", "map.politics", "simulation.military"],
    execute: value => {
      if (!api.isExtensionEnabled(NOBILITY_EXTENSION_ID)) {
        throw new Error("Nobility must be enabled to regenerate government data");
      }
      if (!isNobilityRegenerationRequest(value)) throw new Error("nobility.regenerate requires a regeneration mode");
      regenerateNobilityData(value.mode);
      return { changed: true };
    }
  });

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

  // Always-visible top-right HUD (not a modal). Mounted while the extension is enabled
  // via DialogsContainer's extension-dialog filter.
  api.registerDialog({
    id: "PlayerCharacterPanel",
    extensionId: NOBILITY_EXTENSION_ID,
    component: PlayerCharacterPanel
  });

  api.registerAction({
    id: "nobility-regenerate-characters",
    extensionId: NOBILITY_EXTENSION_ID,
    tab: "tools",
    section: "regenerate",
    label: "Characters",
    tooltip: "Click to regenerate rulers and government offices",
    onClick: () => {
      api.dispatchExtensionCommand({
        extensionId: NOBILITY_EXTENSION_ID,
        name: "regenerate",
        payload: { mode: "full" }
      });
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
    const worldContext = getWorldContext();

    if (isEnabled && !wasEnabled) {
      if (!worldContext.pack.characters || worldContext.pack.characters.length === 0) {
        api.dispatchExtensionCommand({
          extensionId: NOBILITY_EXTENSION_ID,
          name: "regenerate",
          payload: { mode: "bootstrap" }
        });
      } else {
        // Roster already exists (e.g. re-enable mid-session) — pick a focus character.
        selectRandomPlayerCharacter();
      }
    } else if (!isEnabled && wasEnabled) {
      clearPlayerTravel();
      clearPlayerCharacterSelection();
      api.dispatchExtensionCommand({ extensionId: CHARACTERS_EXTENSION_ID, name: "clear", payload: undefined });
    }
  });

  _unregisterMapReadyTask = api.registerMapReadyTask({
    id: "nobility.initialization",
    label: "Preparing nobility",
    run: context => {
      if (!context.isCurrent() || !api.isExtensionEnabled(NOBILITY_EXTENSION_ID)) return;
      if (api.isExtensionEnabled(NOBILITY_EXTENSION_ID)) {
        measureGenerationStep("generateNobility", () => {
          // A new map reuses state ids from 0 — any voyage-intel bonus accrued against the
          // previous map's states must not carry over.
          clearVoyageIntel();
          api.dispatchExtensionCommand({
            extensionId: NOBILITY_EXTENSION_ID,
            name: "regenerate",
            payload: { mode: "full" }
          });
        });
      }
    }
  });

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
    const suspended = applyConflictAutonomy(mode);
    if (suspended) {
      const affected = suspended.statePairs.length ? ` (${suspended.statePairs.join(", ")})` : "";
      tip(
        `${suspended.goalCount} autonomous conflict plan${suspended.goalCount === 1 ? "" : "s"} suspended${affected}`,
        false,
        "info",
        6000
      );
    }
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

  // Military phase runs after economy systems (logging / voyage intel events) so
  // same-tick voyage intel feeds Espionage.generate on this step.
  _unregisterTickSystem = api.registerSimulationSystem({
    id: "nobility.tick",
    phase: "military",
    reads: [
      "map.politics",
      "map.settlements",
      "simulation.military",
      "simulation.states",
      "extension.characters",
      "extension.nobility",
      "extension.shipbuilding"
    ],
    writes: [
      "extension.characters",
      "extension.nobility",
      "map.politics",
      "map.settlements",
      "simulation.military",
      "simulation.states"
    ],
    cadence: { every: 1 },
    profileLabel: "nobility",
    run: (context, writer) => {
      if (!api.isExtensionEnabled(NOBILITY_EXTENSION_ID)) return;

      const { years: deltaYears, months: deltaMonths, days: deltaDays } = context.delta;
      const effectiveDeltaYears = deltaYears + deltaMonths / 12 + deltaDays / 365.2425;

      advanceCharacterAging(effectiveDeltaYears);
      Characters.processResignationsAndSuccessions(effectiveDeltaYears);
      // Phase D: greed/commitment-driven skimming and court bribes.
      Characters.processCharacterCorruption(effectiveDeltaYears);
      assignOfficers();
      assignProvinceLords();
      // Consume in-flight player travel days; location updates on arrival.
      tickPlayerTravel(deltaDays);

      const canAdvanceConflict = mayAdvanceAnyConflict();
      if (api.simulationContext.currentDay === 1) {
        // Frontier governance is a separate choice from war planning: rulers
        // spend on recovery and border works before choosing fresh campaigns.
        // It deliberately runs only when Nobility is enabled; the host frontier
        // loop remains usable without this optional strategic layer.
        if (api.simulationContext.currentMonth === 1) {
          advanceFrontierGovernance(api.worldContext, api.simulationContext, context.rng);
          writer.markChanged("simulation.states");
        }
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

      const settlementsChanged = bordersChanged || marchCaptureOccurred;
      const militaryChanged = settlementsChanged || regimentsMoved;

      refreshCharactersOverviewIfOpen(api.isDialogOpen("charactersOverview"));
      // Keep the top-right player HUD honest after death/succession/title swaps.
      refreshPlayerCharacterSelection();

      writer.markChanged("extension.characters", "extension.nobility");
      if (settlementsChanged) writer.markChanged("map.politics", "map.settlements");
      if (militaryChanged) writer.markChanged("simulation.military");
    }
  });
}

export function cleanup(api: ExtensionAPI): void {
  clearPlayerTravel();
  clearPlayerCharacterSelection();
  api.unregisterToolAction("travelPlayerCharacterToBurg");
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }
  _unregisterMapReadyTask?.();
  _unregisterMapReadyTask = null;
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
  _unregisterRegenerateCommand?.();
  _unregisterRegenerateCommand = null;
  _unregisterTickSystem?.();
  _unregisterTickSystem = null;

  api.unregisterExtension(NOBILITY_EXTENSION_ID);
  clearNobilityContext();
}
