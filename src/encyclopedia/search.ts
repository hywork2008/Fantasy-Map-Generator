import type { EncyclopediaEntryStub, LocalizedText } from "./encyclopediaTypes";
import { resolveText } from "./localizedText";

/** NFKC + lower case + katakana→hiragana, so "ｺｽﾄ", "コスト" and "こすと" match each other. */
export function normalizeSearchText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .trim();
}

interface IndexedStub {
  stub: EncyclopediaEntryStub;
  title: string;
  rest: string;
}

function bothLanguages(text: LocalizedText | undefined): string {
  if (!text) return "";
  return `${resolveText(text, "en")} ${resolveText(text, "ja")}`;
}

export function buildSearchIndex(stubs: readonly EncyclopediaEntryStub[]): IndexedStub[] {
  return stubs.map(stub => ({
    stub,
    title: normalizeSearchText(bothLanguages(stub.title)),
    rest: normalizeSearchText(`${bothLanguages(stub.summary)} ${(stub.tags ?? []).join(" ")} ${stub.id}`)
  }));
}

/**
 * Every whitespace-separated token must match somewhere. Ranking: title prefix > title substring > other fields.
 * Searches both languages regardless of the UI language, so a Japanese user can type an English term and vice versa.
 */
export function searchEncyclopedia(index: readonly IndexedStub[], query: string): EncyclopediaEntryStub[] {
  const tokens = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return index.map(row => row.stub);

  const scored: { stub: EncyclopediaEntryStub; score: number }[] = [];
  for (const row of index) {
    let score = 0;
    let allMatched = true;
    for (const token of tokens) {
      if (row.title.startsWith(token) || row.title.includes(` ${token}`)) score += 3;
      else if (row.title.includes(token)) score += 2;
      else if (row.rest.includes(token)) score += 1;
      else {
        allMatched = false;
        break;
      }
    }
    if (allMatched) scored.push({ stub: row.stub, score });
  }
  return scored.sort((a, b) => b.score - a.score).map(row => row.stub);
}
