import type { RNGService } from "../../../context/appServices";
import {
  ANNUAL_GATE,
  getGuildChapters,
  getGuildKnowledgeStocks,
  getSimulationYear,
  getWorldContext,
  setAnnualGateYear,
  setGuildChapters,
  settleAnnualOnce
} from "../economyContext";
import { getEconomyCalibrationState } from "../store/economyCalibrationState";
import { guildSaturationPoints } from "./craftScale";
import { buildGuildChapterSuitabilityContext, scoreGuildChapterSuitability } from "./guildChapterSuitability";
import type { GuildChapter } from "./guildChapterTypes";
import { collectGuildPractitioners, GUILD_ADOPTION_RATE, GUILD_SATURATION_WORKERS } from "./guildKnowledge";
import { CRAFT_KNOWLEDGE_DOMAINS, type CraftKnowledgeDomain, type GuildKnowledgeStock } from "./guildKnowledgeTypes";
import { isTextileGuildWorkViable } from "./textileDemand";

export const MAX_CHAPTERS_PER_BURG = 4;
export const CHAPTER_FOUND_THRESHOLD = 0.35;
export const CHAPTER_ANNUAL_FOUND_CHANCE = 0.15;
export const CHAPTER_DISSOLVE_STOCK_EPS = 0.02;
export const CHAPTER_DISSOLVE_YEARS = 3;
/**
 * Fraction of a full workforce's technique stock after `CHAPTER_DISSOLVE_YEARS`.
 * A guild promotes when its stock has reached this fraction of its current coverage,
 * so a small workshop qualifies on the same calendar as a full one.
 */
export const CHAPTER_INFORMAL_PROMOTE_STOCK = 1 - (1 - GUILD_ADOPTION_RATE) ** CHAPTER_DISSOLVE_YEARS;

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

function stockOf(
  stocks: ReadonlyMap<string, GuildKnowledgeStock>,
  burgId: number,
  domain: CraftKnowledgeDomain
): number {
  return stocks.get(keyOf(burgId, domain))?.stock ?? 0;
}

/** A hall is vacant when no technique stock above the dissolve epsilon is recorded there. */
export function guildHallVacancyRate(
  chapters: readonly GuildChapter[],
  stocks: readonly Pick<GuildKnowledgeStock, "burgId" | "domain" | "stock">[]
): number {
  if (chapters.length === 0) return 0;
  const occupied = new Set(
    stocks.filter(stock => stock.stock > CHAPTER_DISSOLVE_STOCK_EPS).map(stock => keyOf(stock.burgId, stock.domain))
  );
  const empty = chapters.filter(chapter => !occupied.has(keyOf(chapter.burgId, chapter.domain))).length;
  return empty / chapters.length;
}

function isVacantHall(chapter: GuildChapter, stocks: ReadonlyMap<string, GuildKnowledgeStock>): boolean {
  return stockOf(stocks, chapter.burgId, chapter.domain) <= CHAPTER_DISSOLVE_STOCK_EPS;
}

/** Same saturation GuildKnowledge uses, so three years means three years of this workforce. */
function hasTenuredPractice(stock: number, workers: number): boolean {
  if (workers <= 0) return false;
  const populationRate = Math.max(0, getWorldContext().populationRate ?? 0) || 1;
  const saturation = getEconomyCalibrationState().applyCalibration
    ? guildSaturationPoints(populationRate)
    : GUILD_SATURATION_WORKERS;
  const coverage = Math.min(1, workers / saturation);
  return stock >= coverage * CHAPTER_INFORMAL_PROMOTE_STOCK;
}

function dropChapter(chapters: GuildChapter[], target: GuildChapter): void {
  const index = chapters.findIndex(chapter => chapter.burgId === target.burgId && chapter.domain === target.domain);
  if (index >= 0) chapters.splice(index, 1);
}

/** Lowest-suitability vacant hall matching the predicate, if one exists. */
function weakestVacantHall(
  chapters: readonly GuildChapter[],
  stocks: ReadonlyMap<string, GuildKnowledgeStock>,
  predicate: (chapter: GuildChapter) => boolean
): GuildChapter | undefined {
  return chapters
    .filter(chapter => predicate(chapter) && isVacantHall(chapter, stocks))
    .toSorted(
      (a, b) =>
        a.suitability - b.suitability ||
        a.foundedYear - b.foundedYear ||
        a.burgId - b.burgId ||
        a.domain.localeCompare(b.domain)
    )[0];
}

/**
 * Promotes informal practice that has already lasted several years. A full workforce reaches
 * `CHAPTER_INFORMAL_PROMOTE_STOCK` in `CHAPTER_DISSOLVE_YEARS`. The burg must still have
 * practitioners. When the burg or the state-domain cap is full, the promotion takes the slot of
 * the weakest vacant hall. It does not take a slot from a hall that still has a technique stock.
 */
function promoteTenuredInformal(
  chapters: GuildChapter[],
  year: number,
  context: ReturnType<typeof buildGuildChapterSuitabilityContext>
): void {
  const stocks = new Map(getGuildKnowledgeStocks().map(stock => [keyOf(stock.burgId, stock.domain), stock]));
  const practitioners = collectGuildPractitioners();
  const burgs = getWorldContext().pack.burgs;
  const eligible = [...stocks.values()]
    .filter(stock =>
      hasTenuredPractice(stock.stock, practitioners.get(keyOf(stock.burgId, stock.domain))?.workers ?? 0)
    )
    .filter(stock => isLiveBurgId(stock.burgId))
    .filter(stock => !chapters.some(chapter => chapter.burgId === stock.burgId && chapter.domain === stock.domain))
    .filter(stock => stock.domain !== "textiles" || isTextileGuildWorkViable(stock.burgId))
    .toSorted((a, b) => b.stock - a.stock || a.burgId - b.burgId || a.domain.localeCompare(b.domain));

  for (const stock of eligible) {
    const stateId = burgs[stock.burgId]?.state;
    if (!stateId) continue;
    const cap = maxChaptersForDomainInState(context.burgsByState.get(stateId)?.length ?? 0);
    if (chapterCountAtBurg(chapters, stock.burgId) >= MAX_CHAPTERS_PER_BURG) {
      const victim = weakestVacantHall(chapters, stocks, chapter => chapter.burgId === stock.burgId);
      if (!victim) continue;
      dropChapter(chapters, victim);
    }
    if (chapterCountInStateDomain(chapters, stateId, stock.domain) >= cap) {
      const victim = weakestVacantHall(
        chapters,
        stocks,
        chapter => burgs[chapter.burgId]?.state === stateId && chapter.domain === stock.domain
      );
      if (!victim) continue;
      dropChapter(chapters, victim);
    }
    if (chapterCountAtBurg(chapters, stock.burgId) >= MAX_CHAPTERS_PER_BURG) continue;
    if (chapterCountInStateDomain(chapters, stateId, stock.domain) >= cap) continue;
    chapters.push({
      burgId: stock.burgId,
      domain: stock.domain,
      foundedYear: year,
      status: "chapter",
      suitability: scoreGuildChapterSuitability(stock.burgId, stock.domain, context)
    });
  }
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

    promoteTenuredInformal(chapters, year, context);
    setGuildChapters(chapters);
    setAnnualGateYear(ANNUAL_GATE.guildChapters, year);
  }

  /** Refreshes location quality and makes at most one probabilistic founding per state/domain/year. */
  settleAnnual(rng: Pick<RNGService, "P">): boolean {
    const year = getSimulationYear();
    if (!settleAnnualOnce(ANNUAL_GATE.guildChapters)) return false;

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
        // Terrain score used to keep a hall with no practitioners. Those halls filled the
        // state cap and left the working guilds informal, so age and an empty stock are enough.
        const dissolve = stock < CHAPTER_DISSOLVE_STOCK_EPS && chapter.foundedYear <= year - CHAPTER_DISSOLVE_YEARS;
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

    promoteTenuredInformal(chapters, year, context);
    setGuildChapters(chapters);
    return true;
  }
}

export const GuildChapters = new GuildChaptersModule();
