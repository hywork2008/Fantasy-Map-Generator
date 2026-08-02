import { openDialog } from "../../hostUi";
import { rn } from "../../hostUtils";
import { getGuildChapters, getGuildKnowledgeStocks, getWorldContext } from "../economyContext";
import { getGuildBonus } from "../generators/guildKnowledge";
import { type GuildOverviewRow, setGuildOverviewState } from "../store/guildOverviewState";

/**
 * Debug/transparency view over every Burg-scoped craft guild's technique stock and private
 * treasury (GuildKnowledgeStock, docs/plan/knowledge-guild-system.md), in the same spirit as the
 * Employment Overview panel. Reads already-persisted state from the last annual settlement
 * (GuildKnowledge.settleAnnual / GuildTreasury.settleAnnual) — it does not recompute anything live.
 */
export function open(): void {
  openDialog("guildOverview");
  refreshGuildOverview();
}

export function refreshGuildOverview(): void {
  const world = getWorldContext();
  const burgs = world.pack.burgs;
  const states = world.pack.states ?? [];
  const chapters = new Set(getGuildChapters().map(chapter => `${chapter.burgId}:${chapter.domain}`));

  const rows: GuildOverviewRow[] = [];
  for (const entry of getGuildKnowledgeStocks()) {
    const burg = burgs[entry.burgId];
    if (!burg?.i || burg.removed) continue;

    rows.push({
      id: `${entry.burgId}:${entry.domain}`,
      burgId: entry.burgId,
      burgName: burg.name || `Burg ${entry.burgId}`,
      stateId: burg.state ?? 0,
      stateName: (burg.state ? states[burg.state]?.name : undefined) ?? "—",
      domain: entry.domain,
      status: chapters.has(`${entry.burgId}:${entry.domain}`) ? "chapter" : "informal",
      stock: rn(entry.stock, 3),
      bonus: rn(getGuildBonus(entry.burgId, entry.domain), 3),
      treasury: rn(entry.treasury, 2)
    });
  }

  rows.sort((a, b) => b.stock - a.stock);
  setGuildOverviewState({ rows });
}
