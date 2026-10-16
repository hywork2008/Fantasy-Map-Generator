import "./types"; // activate module augmentation for PackedGraph/State

import { simEvents } from "../../simulation/events";
import { simulationView } from "../../simulation/viewPort";
import type { SimulationExtension, SimulationExtensionAPI } from "../../types/extension-api";
import { advanceCharacterAging } from "../characters/advanceAge";
import { advanceCharacterHealth } from "../characters/characterHealth";
import { getSelectedAbilityPresetId } from "../characters/charactersContext";
import { seedMissingCharacterWealth } from "../economy/generators/characterStipends";
import { advanceAllRegimentMovement, advanceFrontierGovernance, Military, raiseUndeadOnCellEntered } from "../hostCore";
import { measureGenerationStep } from "../hostUtils";
import {
  applyConflictAutonomy,
  endPlayerConflict,
  mayAdvanceAnyConflict,
  mayAdvanceAutonomousConflict,
  shouldSuppressConflictAdvance,
  startPlayerConflict
} from "./conflictDirector";
import { applyPersonalityToCapitalGuard } from "./generators/capitalGuardModifier";
import { Characters } from "./generators/characterLifecycle";
import { pruneDeadCharactersAnnual } from "./generators/characterPruning";
import { repairDemonInfiltrationTrueIdentities } from "./generators/demonInfiltration";
import { applyAffinitiesToDiplomacy } from "./generators/diplomacy-modifier";
import { addVoyageIntel, clearVoyageIntel, Espionage } from "./generators/espionage-generator";
import { tryRecaptureHomeBurg } from "./generators/homeRecapture";
import { HumanCapitalAllocation } from "./generators/humanCapitalAllocation";
import { LocalSkirmish } from "./generators/localSkirmish";
import { tryCaptureOnPassing } from "./generators/marchCapture";
import { Mobilization } from "./generators/mobilization";
import { assignOfficers } from "./generators/officerAssignment";
import { assignProvinceLords } from "./generators/provinceLordGenerator";
import { StrategicPlanner } from "./generators/strategic-planner";
import { clearNobilityContext, initNobilityContext } from "./nobilityContext";
import { refreshPlayerCharacterSelection } from "./playerCharacterFocus";
import { clearPendingPlayerTravel, tickPlayerTravel } from "./playerTravel";
import { NOBILITY_TICK_SYSTEM_IDS, NOBILITY_TICK_TOPIC_CONTRACTS, type NobilityTickSystemId } from "./tickSystemIds";

/**
 * Nobility simulation entry (docs/plan/simulation-core-separation.md §7, S5): the regenerate
 * command, the map-ready task, the court/military tick chain and the conflict/voyage events.
 * The editor tab, actions and overview refreshes stay in `index.tsx`, driven by COURT_CHANGED_EVENT.
 */

export const NOBILITY_EXTENSION_ID = "nobility";

/** Characters, titles or the player focus changed; open character views should refresh. */
export const NOBILITY_COURT_CHANGED_EVENT = "fmg:nobility-court-changed";

/** Each loaded character list needs the legacy true-form migration only once. */
const _repairedDemonInfiltrationCharacterLists = new WeakSet<object>();

function notifyCourtChanged(): void {
  simEvents.dispatchEvent(new CustomEvent(NOBILITY_COURT_CHANGED_EVENT));
}

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
    notifyCourtChanged();
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
  notifyCourtChanged();
}

function register(api: SimulationExtensionAPI): () => void {
  initNobilityContext(api);
  const listeners: [string, (event: Event) => void][] = [];
  const on = (type: string, listener: (event: Event) => void) => {
    api.events.addEventListener(type, listener);
    listeners.push([type, listener]);
  };
  /** Unregister handles for the NOBILITY_TICK_SYSTEM_IDS chain, dropped in reverse on unregister. */
  const _unregisterTickSystems: (() => void)[] = [];

  const unregisterRegenerateCommand = api.registerExtensionCommand({
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

  const unsubscribe = api.subscribeExtensionState((state, prevState) => {
    const isEnabled = state.enabledExtensions[NOBILITY_EXTENSION_ID];
    const wasEnabled = prevState.enabledExtensions[NOBILITY_EXTENSION_ID];
    if (isEnabled && !wasEnabled) {
      // Character creation depends on complete burg and state data. The task is
      // automatically run after core generation, or queued immediately for a live map.
      api.requestMapReadyTask("nobility.initialization");
    } else if (!isEnabled && wasEnabled) {
      clearPendingPlayerTravel();
      Characters.clear();
    }
  });

  const unregisterMapReadyTask = api.registerMapReadyTask({
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
  on("fmg:shipbuilding-voyage-intel", e => {
    if (!api.isExtensionEnabled(NOBILITY_EXTENSION_ID)) return;
    const { observerStateId, targetStateId, amount } = (e as CustomEvent).detail as {
      observerStateId: number;
      targetStateId: number;
      amount: number;
    };
    if (!(amount > 0)) return;
    addVoyageIntel(observerStateId, targetStateId, amount);
  });

  on("fmg:conflict-autonomy-changed", event => {
    const detail = (event as CustomEvent<unknown>).detail;
    const mode =
      typeof detail === "object" && detail !== null && "mode" in detail
        ? (detail as { mode: unknown }).mode
        : undefined;
    const suspended = applyConflictAutonomy(mode);
    if (suspended) {
      const affected = suspended.statePairs.length ? ` (${suspended.statePairs.join(", ")})` : "";
      simulationView.tip(
        `${suspended.goalCount} autonomous conflict plan${suspended.goalCount === 1 ? "" : "s"} suspended${affected}`,
        false,
        "info",
        6000
      );
    }
  });

  on("fmg:player-conflict-requested", event => {
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
  });

  on("fmg:player-conflict-ended", event => {
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
  });

  // Military phase runs after economy systems (logging / voyage intel events) so
  // same-tick voyage intel feeds Espionage.generate on this step.
  // docs/plan/advance-time-history-mode.md Phase H1: the tick used to be one `nobility.tick`
  // system. Splitting it along NOBILITY_TICK_SYSTEM_IDS keeps the exact same step order (each
  // step declares `after: [previous]`) while letting history mode disable individual steps.
  type NobilityTickSystem = Parameters<typeof api.registerSimulationSystem>[0];
  type NobilityTickContext = Parameters<NobilityTickSystem["run"]>[0];

  let nextNobilityTickSystemIndex = 0;
  const registerNobilityTickSystem = (id: NobilityTickSystemId, run: NobilityTickSystem["run"]): void => {
    const index = nextNobilityTickSystemIndex++;
    if (NOBILITY_TICK_SYSTEM_IDS[index] !== id) {
      throw new Error(
        `Nobility tick system '${id}' registered at position ${index}, ` +
          `where tickSystemIds.ts declares '${NOBILITY_TICK_SYSTEM_IDS[index] ?? "(past the end)"}'`
      );
    }
    const previous = index > 0 ? NOBILITY_TICK_SYSTEM_IDS[index - 1] : null;
    const topics = NOBILITY_TICK_TOPIC_CONTRACTS[id];
    _unregisterTickSystems.push(
      api.registerSimulationSystem({
        id,
        phase: "military",
        reads: topics.reads,
        writes: topics.writes,
        after: previous ? [previous] : undefined,
        cadence: { every: 1 },
        profileLabel: id.replace("nobility.", "nobility:"),
        run: (context, writer) => {
          if (!api.isExtensionEnabled(NOBILITY_EXTENSION_ID)) return;
          run(context, writer);
        }
      })
    );
  };

  /** Years covered by one tick — the same expression every former inline step used. */
  const tickYears = (context: NobilityTickContext): number =>
    context.delta.years + context.delta.months / 12 + context.delta.days / 365.2425;
  const isAnnualBoundary = (): boolean =>
    api.simulationContext.currentDay === 1 && api.simulationContext.currentMonth === 1;
  /** CK3 courts only: D&D characters have no court attributes or political-AI participation. */
  const usesCourtSystems = (): boolean => getSelectedAbilityPresetId() === "ck3e";
  /**
   * Loop-reduction Phase 1b (docs/plan/advance-time-loop-reduction.md): a multi-day fast-forward
   * (Advance Week/Month/Year, isBulkAdvance) under player-directed conflict policy means the
   * player is explicitly not resolving turn-by-turn warfare right now — armies do not need to
   * plan, besiege, skirmish, or move for those days. Confirmed with the user (2026-08-13) as an
   * intentional divergence from day-by-day stepping: Advance Day always resolves military in
   * full; Advance Week/Month/Year skips it while conflictAutonomy is "playerDirected".
   * Autonomous-policy maps are unaffected — the political AI needs continuous resolution
   * regardless of batch size.
   */
  const canAdvanceConflictThisTick = (context: NobilityTickContext): boolean =>
    mayAdvanceAnyConflict() && !shouldSuppressConflictAdvance(context.isBulkAdvance);

  registerNobilityTickSystem("nobility.characterLifecycle", (context, _writer) => {
    const effectiveDeltaYears = tickYears(context);
    // Resolve sickness/health before aging so this same tick's mortality roll already
    // sees any fresh affliction (see characterHealth.ts's diseaseDeathRiskFor()).
    advanceCharacterHealth(effectiveDeltaYears);
    const characters = api.worldContext.pack.characters;
    if (characters?.length && !_repairedDemonInfiltrationCharacterLists.has(characters)) {
      repairDemonInfiltrationTrueIdentities({
        characters,
        pack: api.worldContext.pack
      });
      _repairedDemonInfiltrationCharacterLists.add(characters);
    }
    advanceCharacterAging(effectiveDeltaYears);
    // Annual maintenance, independent of ability preset: sweep long-dead characters nothing
    // still references (see characterPruning.ts) so the roster — and the full-pack/simulation
    // snapshot timeEngine.ts clones once per Advance action — doesn't grow without bound over
    // a long session.
    if (isAnnualBoundary()) pruneDeadCharactersAnnual();
    if (!usesCourtSystems()) return;
    Characters.processResignationsAndSuccessions(effectiveDeltaYears);
    if (isAnnualBoundary()) Characters.replenishDemonInfiltrationCentury();
    // Phase D: greed/commitment-driven skimming and court bribes.
    Characters.processCharacterCorruption(effectiveDeltaYears);
  });

  registerNobilityTickSystem("nobility.appointments", (_context, _writer) => {
    if (!usesCourtSystems()) return;
    assignOfficers();
    assignProvinceLords();
    // A capable, humane court (or a culture that values learning) can correct one obvious
    // named-personnel mismatch each year. It runs after ordinary officer vacancy assignment
    // so it only fills a command the regular system left open.
    if (isAnnualBoundary()) HumanCapitalAllocation.settleAnnual();
  });

  registerNobilityTickSystem("nobility.playerTravel", (context, _writer) => {
    // Consume in-flight player travel days; location updates on arrival. Runs for every ability
    // preset — the pre-split tick reached this both in the D&D early-return branch and at the
    // end of the CK3 branch.
    tickPlayerTravel(context.delta.days);
  });

  registerNobilityTickSystem("nobility.frontierGovernance", (context, writer) => {
    if (!usesCourtSystems()) return;
    // Frontier governance is a separate choice from war planning: rulers
    // spend on recovery and border works before choosing fresh campaigns.
    // It deliberately runs only when Nobility is enabled; the host frontier
    // loop remains usable without this optional strategic layer.
    if (api.simulationContext.currentDay !== 1 || api.simulationContext.currentMonth !== 1) return;
    advanceFrontierGovernance(api.worldContext, api.simulationContext, context.rng);
    writer.markChanged("simulation.states");
  });

  registerNobilityTickSystem("nobility.strategy", (context, _writer) => {
    if (!usesCourtSystems()) return;
    if (api.simulationContext.currentDay === 1) {
      if (canAdvanceConflictThisTick(context)) StrategicPlanner.evaluatePlans();
      Mobilization.conscript(api.worldContext.pack);
    }
    Espionage.generate();
    if (canAdvanceConflictThisTick(context)) StrategicPlanner.generate();
  });

  registerNobilityTickSystem("nobility.combat", (context, writer) => {
    if (!usesCourtSystems()) return;
    const canAdvanceConflict = canAdvanceConflictThisTick(context);
    const siegeOccurred = canAdvanceConflict ? StrategicPlanner.advanceTension() : false;
    const skirmishOccurred = canAdvanceConflict
      ? LocalSkirmish.resolve(tickYears(context), context.delta.months, context.delta.days)
      : false;

    Military.updateDynamic(api.worldContext, tickYears(context));

    if (siegeOccurred || skirmishOccurred) {
      writer.markChanged("map.politics", "map.settlements", "simulation.military");
    }
  });

  registerNobilityTickSystem("nobility.regimentMovement", (context, writer) => {
    if (!usesCourtSystems()) return;
    // Regiment marching (docs/plan/military-movement.md Phase 2) runs every tick regardless of
    // bordersChanged — armies keep advancing toward their destination continuously rather than
    // teleporting instantly when borders change. Skipped entirely when suppressConflictAdvance
    // (also avoids advanceAllRegimentMovement's route-graph rebuild, its dominant cost).
    if (shouldSuppressConflictAdvance(context.isBulkAdvance)) return;
    const canAdvanceConflict = canAdvanceConflictThisTick(context);
    let marchCaptureOccurred = false;
    const regimentsMoved = advanceAllRegimentMovement(
      api.worldContext.pack,
      api.worldContext,
      tickYears(context),
      (r, cell) => {
        if (!canAdvanceConflict) return;
        raiseUndeadOnCellEntered(r, cell);
        if (tryRecaptureHomeBurg(r, cell) || tryCaptureOnPassing(r, cell)) marchCaptureOccurred = true;
      },
      canAdvanceConflict ? StrategicPlanner.getActiveSiegeTargets() : undefined
    );

    if (marchCaptureOccurred) writer.markChanged("map.politics", "map.settlements");
    if (marchCaptureOccurred || regimentsMoved) writer.markChanged("simulation.military");
  });

  registerNobilityTickSystem("nobility.finalize", (_context, writer) => {
    notifyCourtChanged();
    // Keep the top-right player HUD honest after death/succession/title swaps.
    refreshPlayerCharacterSelection();
    writer.markChanged("extension.characters", "extension.nobility");
  });

  return () => {
    clearPendingPlayerTravel();
    unsubscribe();
    unregisterMapReadyTask();
    for (const [type, listener] of listeners) api.events.removeEventListener(type, listener);
    clearVoyageIntel();
    unregisterRegenerateCommand();
    // Reverse order: the registry refuses to remove a system another one still declares `after`.
    while (_unregisterTickSystems.length) _unregisterTickSystems.pop()?.();
    clearNobilityContext();
  };
}

export const nobilitySimulation: SimulationExtension = {
  id: NOBILITY_EXTENSION_ID,
  requires: ["characters"],
  register
};
