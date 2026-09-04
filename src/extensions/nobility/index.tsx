import "./types"; // activate module augmentation for PackedGraph/State

import type { ExtensionAPI } from "../../types/extension-api";
import { advanceCharacterAging } from "../characters/advanceAge";
import { advanceCharacterHealth } from "../characters/characterHealth";
import { getSelectedAbilityPresetId } from "../characters/charactersContext";
import { refreshCharactersOverviewIfOpen } from "../characters/controllers/characters-overview";
import { CHARACTERS_EXTENSION_ID } from "../characters/index";
import { seedMissingCharacterWealth } from "../economy/generators/characterStipends";
import { advanceAllRegimentMovement, advanceFrontierGovernance, Military } from "../hostCore";
import { tip } from "../hostServices";
import { openDialog, type RegenerateConfirmConfig } from "../hostUi";
import { measureGenerationStep } from "../hostUtils";
import {
  applyConflictAutonomy,
  endPlayerConflict,
  mayAdvanceAnyConflict,
  mayAdvanceAutonomousConflict,
  shouldSuppressConflictAdvance,
  startPlayerConflict
} from "./conflictDirector";
import { refreshPlayerCharacterSelection } from "./controllers/playerCharacter";
import { clearPlayerTravel, requestTravelToBurg, tickPlayerTravel } from "./controllers/playerCharacterTravel";
import { applyPersonalityToCapitalGuard } from "./generators/capitalGuardModifier";
import { Characters } from "./generators/characterLifecycle";
import { pruneDeadCharactersAnnual } from "./generators/characterPruning";
import { applyAffinitiesToDiplomacy } from "./generators/diplomacy-modifier";
import { addVoyageIntel, clearVoyageIntel, Espionage } from "./generators/espionage-generator";
import { tryRecaptureHomeBurg } from "./generators/homeRecapture";
import { LocalSkirmish } from "./generators/localSkirmish";
import { tryCaptureOnPassing } from "./generators/marchCapture";
import { Mobilization } from "./generators/mobilization";
import { assignOfficers } from "./generators/officerAssignment";
import { assignProvinceLords } from "./generators/provinceLordGenerator";
import { StrategicPlanner } from "./generators/strategic-planner";
import { clearNobilityContext, getApi, getWorldContext, initNobilityContext } from "./nobilityContext";
import { resolveCharacterRegenerationSeed } from "./resolveCharacterRegenerationSeed";
import { StatesEditorPersonalityTab } from "./ui/components/StatesEditorPersonalityTab";

export const NOBILITY_EXTENSION_ID = "nobility";
/**
 * Declared locally rather than imported from `../economy` so this extension does not pull the
 * whole economy entry module into its own bundle just to name a dependency — same pattern as
 * `ui/components/PlayerCharacterPanel.tsx`.
 */
const ECONOMY_EXTENSION_ID = "economy";

let _unsubscribe: (() => void) | null = null;
let _unregisterMapReadyTask: (() => void) | null = null;
let _voyageIntelHandler: ((e: Event) => void) | null = null;
let _conflictAutonomyChangedHandler: ((e: Event) => void) | null = null;
let _playerConflictRequestedHandler: ((e: Event) => void) | null = null;
let _playerConflictEndedHandler: ((e: Event) => void) | null = null;
let _unregisterRegenerateCommand: (() => void) | null = null;
let _unregisterTickSystem: (() => void) | null = null;

type NobilityRegenerationMode = "bootstrap" | "full";

type NobilityRegenerationRequest = {
  readonly mode: NobilityRegenerationMode;
  /** When set, overrides the map seed for Characters.generate RNG. */
  readonly randomSeed?: string | number;
};

function isNobilityRegenerationRequest(value: unknown): value is NobilityRegenerationRequest {
  if (!value || typeof value !== "object") return false;
  const mode = (value as { mode?: unknown }).mode;
  if (mode !== "bootstrap" && mode !== "full") return false;
  const randomSeed = (value as { randomSeed?: unknown }).randomSeed;
  if (randomSeed !== undefined && typeof randomSeed !== "string" && typeof randomSeed !== "number") return false;
  return true;
}

function regenerateNobilityData(mode: NobilityRegenerationMode, randomSeed?: string | number): void {
  Characters.generate(randomSeed !== undefined ? { randomSeed } : {});
  if (getSelectedAbilityPresetId() !== "ck3e") {
    refreshPlayerCharacterSelection();
    refreshCharactersOverviewIfOpen(getApi().isDialogOpen("charactersOverview"));
    return;
  }
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
  // Government rebuilds must not replace a living player character created by
  // Characters. When none is focused, the controller picks a political focus.
  refreshPlayerCharacterSelection();
  // Overview reads pack via getCharacters() on render; bump so an open dialog refreshes.
  refreshCharactersOverviewIfOpen(getApi().isDialogOpen("charactersOverview"));
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
      regenerateNobilityData(value.mode, value.randomSeed);
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
      // Same host confirm dialog as Routes regenerate: options live inside the dialog,
      // and "do not ask again" is suppressed because seed policy is chosen each time.
      const regenerateConfig: RegenerateConfirmConfig = {
        featureName: "characters",
        showDontAskAgain: false,
        characterEntropy: "mapSeed",
        onProceed: (_dontAskAgain, options) => {
          const entropy = options?.characterEntropy ?? "mapSeed";
          const randomSeed = resolveCharacterRegenerationSeed(entropy, String(getWorldContext().seed));
          api.dispatchExtensionCommand({
            extensionId: NOBILITY_EXTENSION_ID,
            name: "regenerate",
            payload: { mode: "full", randomSeed }
          });
        }
      };
      openDialog("regenerateConfirm", regenerateConfig);
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
    if (isEnabled && !wasEnabled) {
      // Character creation depends on complete burg and state data. The task is
      // automatically run after core generation, or queued immediately for a live map.
      api.requestMapReadyTask("nobility.initialization");
    } else if (!isEnabled && wasEnabled) {
      clearPlayerTravel();
      Characters.clear();
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

      // Resolve sickness/health before aging so this same tick's mortality roll already
      // sees any fresh affliction (see characterHealth.ts's diseaseDeathRiskFor()).
      advanceCharacterHealth(effectiveDeltaYears);
      advanceCharacterAging(effectiveDeltaYears);
      // Annual maintenance, independent of ability preset: sweep long-dead characters nothing
      // still references (see characterPruning.ts) so the roster — and the full-pack/simulation
      // snapshot timeEngine.ts clones once per Advance action — doesn't grow without bound over
      // a long session.
      if (api.simulationContext.currentDay === 1 && api.simulationContext.currentMonth === 1) {
        pruneDeadCharactersAnnual();
      }
      if (getSelectedAbilityPresetId() !== "ck3e") {
        // D&D characters have no CK3 court attributes or political-AI participation.
        tickPlayerTravel(deltaDays);
        return;
      }
      Characters.processResignationsAndSuccessions(effectiveDeltaYears);
      // Phase D: greed/commitment-driven skimming and court bribes.
      Characters.processCharacterCorruption(effectiveDeltaYears);
      assignOfficers();
      assignProvinceLords();
      // Consume in-flight player travel days; location updates on arrival.
      tickPlayerTravel(deltaDays);

      // Loop-reduction Phase 1b (docs/plan/advance-time-loop-reduction.md): a multi-day
      // fast-forward (Advance Week/Month/Year, isBulkAdvance) under player-directed conflict
      // policy means the player is explicitly not resolving turn-by-turn warfare right now —
      // armies do not need to plan, besiege, skirmish, or move for those days. Confirmed with
      // the user (2026-08-13) as an intentional divergence from day-by-day stepping: Advance Day
      // always resolves military in full; Advance Week/Month/Year skips it while
      // conflictAutonomy is "playerDirected". Autonomous-policy maps are unaffected — the
      // political AI needs continuous resolution regardless of batch size.
      const suppressConflictAdvance = shouldSuppressConflictAdvance(context.isBulkAdvance);
      const canAdvanceConflict = mayAdvanceAnyConflict() && !suppressConflictAdvance;
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
      // teleporting instantly when borders change. Skipped entirely when suppressConflictAdvance
      // (also avoids advanceAllRegimentMovement's route-graph rebuild, its dominant cost).
      let marchCaptureOccurred = false;
      const regimentsMoved = suppressConflictAdvance
        ? false
        : advanceAllRegimentMovement(
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
