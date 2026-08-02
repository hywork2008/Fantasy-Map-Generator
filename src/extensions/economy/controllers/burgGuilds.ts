import { getGuildChapters, getGuildKnowledgeStocks, getWorldContext } from "../economyContext";
import type { BurgGuildListRow } from "../generators/guildChapterTypes";
import { getGuildBonus } from "../generators/guildKnowledge";
import { findMaster } from "../generators/guildSuccession";
import { getIndividualSkill } from "../generators/individualSkillMastery";

/** Returns formal halls and informal practitioner stocks for one Burg's editor tab. */
export function listGuildsForBurg(burgId: number): BurgGuildListRow[] {
  const chapters = getGuildChapters().filter(chapter => chapter.burgId === burgId);
  const stocks = getGuildKnowledgeStocks().filter(stock => stock.burgId === burgId);
  const stockByDomain = new Map(stocks.map(stock => [stock.domain, stock]));
  const chapterByDomain = new Map(chapters.map(chapter => [chapter.domain, chapter]));
  const domains = new Set([...stockByDomain.keys(), ...chapterByDomain.keys()]);
  const characters = getWorldContext().pack.characters ?? [];

  return [...domains]
    .map<BurgGuildListRow>(domain => {
      const stock = stockByDomain.get(domain);
      const chapter = chapterByDomain.get(domain);
      const master = findMaster(characters, burgId, domain);
      const mastery = master && domain === "metallurgy" ? getIndividualSkill(master.i) : undefined;
      return {
        domain,
        status: chapter ? "chapter" : "informal",
        stock: stock?.stock ?? 0,
        bonus: getGuildBonus(burgId, domain),
        treasury: stock?.treasury ?? 0,
        suitability: chapter?.suitability ?? null,
        foundedYear: chapter?.foundedYear ?? null,
        masterCharacterId: master?.i ?? null,
        masterName: master?.name ?? null,
        masterProficiency: mastery?.proficiency ?? null,
        masterAptitude: mastery?.aptitude ?? null,
        masterTechniques: mastery?.techniques ?? [],
        masterReconstructionLeads: mastery?.reconstructionLeads ?? []
      };
    })
    .toSorted((a, b) => {
      if (a.status !== b.status) return a.status === "chapter" ? -1 : 1;
      return b.stock - a.stock || a.domain.localeCompare(b.domain);
    });
}
