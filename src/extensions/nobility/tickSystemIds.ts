/**
 * Execution order of the Nobility tick chain.
 *
 * The tick used to be a single `nobility.tick` system whose ~20 steps were sequenced only by
 * where they happened to sit in one 100-line `run()`. Each step is now its own simulation system,
 * and `registerNobilityTickSystem` in index.tsx walks this list to wire `after: [previous]` — so
 * the order lives in one readable place instead of being implied by call-site order, and the host
 * registry enforces it. index.tsx asserts its registrations against this list.
 *
 * This is the Nobility counterpart of `src/extensions/economy/tickSystemIds.ts`
 * (docs/plan/economy-coupling-audit.md T1). It is what lets Advance Time's history mode mask
 * individual steps — "age and succeed, but do not march armies" — instead of the whole tick
 * (docs/plan/advance-time-history-mode.md §5.3, Phase H1).
 *
 * Kept in its own module so tests can read the order without importing the extension entry point
 * and its whole renderer/UI graph.
 */
import type { DataTopic } from "../../runtime/worldRuntime";

export const NOBILITY_TICK_SYSTEM_IDS = [
  /** Health, aging, annual pruning, resignations/successions, court corruption. */
  "nobility.characterLifecycle",
  /** Officer and province-lord vacancy filling, plus the annual human-capital correction. */
  "nobility.appointments",
  /** Consumes in-flight player travel days. */
  "nobility.playerTravel",
  /** Annual frontier governance spend (recovery and border works). */
  "nobility.frontierGovernance",
  /** War planning, conscription and espionage. */
  "nobility.strategy",
  /** Siege tension, local skirmishes, and the dynamic military recount that follows them. */
  "nobility.combat",
  /** Regiment marching and the captures it triggers on arrival. */
  "nobility.regimentMovement",
  /**
   * Per-tick UI refresh and the unconditional character/nobility topic marks.
   *
   * Not in the original design sketch's 7-step list: the refreshes and the unconditional
   * `markChanged("extension.characters", "extension.nobility")` sat at the very end of the old
   * monolithic `run()` and must keep running whichever steps a history-mode mask disables, so
   * they need a step of their own rather than riding on one that can be switched off.
   */
  "nobility.finalize"
] as const;

export type NobilityTickSystemId = (typeof NOBILITY_TICK_SYSTEM_IDS)[number];

/**
 * Topic contracts for the extracted Nobility tick steps.
 *
 * A step-level upper bound rather than the union formerly declared by `nobility.tick`: a
 * calendar-gated step may not mutate on every invocation, but it may only read/write topics
 * listed here when it does.
 */
export type NobilityTickTopicContract = Readonly<{
  reads: readonly DataTopic[];
  writes: readonly DataTopic[];
}>;

export const NOBILITY_TICK_TOPIC_CONTRACTS: Readonly<Record<NobilityTickSystemId, NobilityTickTopicContract>> = {
  "nobility.characterLifecycle": {
    reads: ["extension.characters", "extension.nobility", "simulation.states"],
    writes: ["extension.characters", "extension.nobility", "simulation.states"]
  },
  "nobility.appointments": {
    reads: ["map.politics", "map.settlements", "extension.characters", "extension.nobility", "simulation.states"],
    writes: ["extension.characters", "extension.nobility", "simulation.states"]
  },
  "nobility.playerTravel": {
    reads: ["map.settlements", "extension.characters"],
    writes: ["extension.characters"]
  },
  "nobility.frontierGovernance": {
    reads: ["map.politics", "map.settlements", "simulation.states", "extension.nobility"],
    writes: ["simulation.states", "extension.nobility"]
  },
  "nobility.strategy": {
    reads: [
      "map.politics",
      "map.settlements",
      "simulation.military",
      "simulation.states",
      "extension.characters",
      "extension.nobility",
      "extension.shipbuilding"
    ],
    writes: ["extension.nobility", "simulation.military", "simulation.states"]
  },
  "nobility.combat": {
    reads: ["map.politics", "map.settlements", "simulation.military", "simulation.states", "extension.nobility"],
    writes: ["map.politics", "map.settlements", "simulation.military", "simulation.states", "extension.nobility"]
  },
  "nobility.regimentMovement": {
    reads: ["map.politics", "map.settlements", "simulation.military", "simulation.states", "extension.nobility"],
    writes: ["map.politics", "map.settlements", "simulation.military", "simulation.states", "extension.nobility"]
  },
  "nobility.finalize": {
    reads: ["extension.characters", "extension.nobility"],
    writes: ["extension.characters", "extension.nobility"]
  }
};
