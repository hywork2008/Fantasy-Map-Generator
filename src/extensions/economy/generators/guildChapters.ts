import type { RNGService } from "../../../context/appServices";
import {
  getGuildChapters,
  getGuildChaptersLastSettledYear,
  getGuildKnowledgeStocks,
  getSimulationYear,
  getWorldContext,
  setGuildChapters,
  setGuildChaptersLastSettledYear
} from "../economyContext";
import { buildGuildChapterSuitabilityContext, scoreGuildChapterSuitability } from "./guildChapterSuitability";
import type { GuildChapter } from "./guildChapterTypes";
import { CRAFT_KNOWLEDGE_DOMAINS, type CraftKnowledgeDomain } from "./guildKnowledgeTypes";
import { isTextileGuildWorkViable } from "./textileDemand";

export const MAX_CHAPTERS_PER_BURG = 4;
export const CHAPTER_FOUND_THRESHOLD = 0.35;
export const CHAPTER_ANNUAL_FOUND_CHANCE = 0.15;
export const CHAPTER_DISSOLVE_STOCK_EPS = 0.02;
export const CHAPTER_DISSOLVE_SUITABILITY = 0.2;
export const CHAPTER_DISSOLVE_YEARS = 3;

function keyOf(burgId: number, domain: CraftKnowledgeDomain): string {
  return `${burgId}:${domain}`;
}

export function maxChaptersForDomainInState(stateBurgCount: number): number {
  return Math.max(1, Math.min(6, Math.ceil(stateBurgCount / 10)));
}

function isLiveBurgId(burgId: number): boolean {
  const burg = getWorldContext().pack.burgs[burgId];
  return Boolean(burg?.i && burg.state && !burg.removed);
}

function sortedCandidates(
  context: ReturnType<typeof buildGuildChapterSuitabilityContext>,
  stateId: number,
  domain: CraftKnowledgeDomain,
  existingInState: number
) {
  const burgIds = context.burgsByState.get(stateId) ?? [];
  return burgIds
    .map(burgId => ({
      burgId,
      score: scoreGuildChapterSuitability(burgId, domain, context) * (1 / (1 + 0.35 * existingInState))
    }))
    .toSorted((a, b) => b.score - a.score || a.burgId - b.burgId);
}

function chapterCountAtBurg(chapters: readonly GuildChapter[], burgId: number): number {
  return chapters.filter(chapter => chapter.burgId === burgId).length;
}

function chapterCountInStateDomain(
  chapters: readonly GuildChapter[],
  stateId: number,
  domain: CraftKnowledgeDomain
): number {
  const burgs = getWorldContext().pack.burgs;
  return chapters.filter(chapter => burgs[chapter.burgId]?.state === stateId && chapter.domain === domain).length;
}

function addBestChapter(
  chapters: GuildChapter[],
  stateId: number,
  domain: CraftKnowledgeDomain,
  year: number,
  context: ReturnType<typeof buildGuildChapterSuitabilityContext>
): boolean {
  const currentCount = chapterCountInStateDomain(chapters, stateId, domain);
  const candidates = sortedCandidates(context, stateId, domain, currentCount);
  for (const candidate of candidates) {
    if (candidate.score < CHAPTER_FOUND_THRESHOLD) return false;
    if (chapters.some(chapter => chapter.burgId === candidate.burgId && chapter.domain === domain)) continue;
    if (chapterCountAtBurg(chapters, candidate.burgId) >= MAX_CHAPTERS_PER_BURG) continue;
    // A textile hall represents paid craft work, not a capital-city decoration. It is founded only
    // where the immediately available fibre/cloth and the next three months of household orders can
    // support at least the two-person minimum without seeding synthetic materials.
    if (domain === "textiles" && !isTextileGuildWorkViable(candidate.burgId)) continue;
    chapters.push({
      burgId: candidate.burgId,
      domain,
      foundedYear: year,
      status: "chapter",
      suitability: scoreGuildChapterSuitability(candidate.burgId, domain, context)
    });
    return true;
  }
  return false;
}

export function isFormalGuildChapter(burgId: number, domain: CraftKnowledgeDomain): boolean {
  return getGuildChapters().some(chapter => chapter.burgId === burgId && chapter.domain === domain);
}

export class GuildChaptersModule {
  /** Replaces formal halls after a full Economy generation, without touching knowledge stocks. */
  seedAfterGenerate(): void {
    const context = buildGuildChapterSuitabilityContext();
    const year = getSimulationYear();
    const chapters: GuildChapter[] = [];

    for (const [stateId, burgIds] of context.burgsByState) {
      const cap = maxChaptersForDomainInState(burgIds.length);
      for (const domain of CRAFT_KNOWLEDGE_DOMAINS) {
        while (chapterCountInStateDomain(chapters, stateId, domain) < cap) {
          if (!addBestChapter(chapters, stateId, domain, year, context)) break;
        }
      }
    }

    setGuildChapters(chapters);
    setGuildChaptersLastSettledYear(year);
  }

  /** Refreshes location quality and makes at most one probabilistic founding per state/domain/year. */
  settleAnnual(rng: Pick<RNGService, "P">): boolean {
    const year = getSimulationYear();
    if (getGuildChaptersLastSettledYear() === year) return false;
    setGuildChaptersLastSettledYear(year);

    const context = buildGuildChapterSuitabilityContext();
    const stocks = new Map(getGuildKnowledgeStocks().map(stock => [keyOf(stock.burgId, stock.domain), stock]));
    const chapters = getGuildChapters()
      .filter(chapter => isLiveBurgId(chapter.burgId))
      .map(chapter => ({
        ...chapter,
        suitability: scoreGuildChapterSuitability(chapter.burgId, chapter.domain, context)
      }))
      .filter(chapter => {
        const stock = stocks.get(keyOf(chapter.burgId, chapter.domain))?.stock ?? 0;
        const dissolve =
          stock < CHAPTER_DISSOLVE_STOCK_EPS &&
          chapter.suitability < CHAPTER_DISSOLVE_SUITABILITY &&
          chapter.foundedYear <= year - CHAPTER_DISSOLVE_YEARS;
        return !dissolve;
      });

    for (const [stateId, burgIds] of context.burgsByState) {
      const cap = maxChaptersForDomainInState(burgIds.length);
      for (const domain of CRAFT_KNOWLEDGE_DOMAINS) {
        if (chapterCountInStateDomain(chapters, stateId, domain) >= cap) continue;
        if (!rng.P(CHAPTER_ANNUAL_FOUND_CHANCE)) continue;
        addBestChapter(chapters, stateId, domain, year, context);
      }
    }

    setGuildChapters(chapters);
    return true;
  }
}

export const GuildChapters = new GuildChaptersModule();
