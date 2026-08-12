import { isEconomyContextReady } from "../economyContext";
import { applyConquestDisruptionToAcademies } from "./academyKnowledge";
import { applyGreatLibraryConquestDisruption } from "./greatLibrary";
import { applyConquestDisruptionToGuilds } from "./guildKnowledge";

/**
 * Single entry point for Nobility's captureBurg() (docs/plan/knowledge-guild-system.md §4 point 4,
 * §8.1 decision 3, §9 Phase 7) to disrupt a conquered Burg's Burg-scoped technique stocks. Both
 * GuildKnowledgeStock and AcademyKnowledgeStock are keyed purely by burgId, so without this a
 * conqueror would inherit a captured city's full accumulated technique for free the instant it
 * falls — this penalty plus the existing annual EWMA settling under the new owner is what actually
 * realizes "gradual integration over years, with room for loss in the chaos" instead of instant
 * full absorption. StateSecretStock/MartialDisciplineStock are State-scoped, not Burg-scoped, so
 * losing one city doesn't touch them — nothing to disrupt there.
 *
 * Cross-extension caller (Nobility) may run before, or entirely without, this extension's own
 * init having run — degrades to a no-op instead of throwing when economy's context isn't ready,
 * same guard as getMartialDisciplineMultiplier (§9 Phase 5).
 */
export function applyConquestDisruption(burgId: number): void {
  if (!isEconomyContextReady()) return;

  applyConquestDisruptionToGuilds(burgId);
  applyConquestDisruptionToAcademies(burgId);
  // docs/plan/great-library.md §征服・占領 — one-shot progress/endowment penalty plus a chance of
  // outright ruin. Burg-scoped like the two calls above; the project's stateId (patron) does not
  // change, so it registers as "occupied" in GreatLibrary.settleAnnual() going forward.
  applyGreatLibraryConquestDisruption(burgId);
}
