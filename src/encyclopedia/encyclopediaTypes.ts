/**
 * Encyclopedia data model (docs/plan/world-codex.md §3).
 * Every page — feature help, real-world history, or a live in-world entity — is one EncyclopediaEntry.
 */

/**
 * Entry id prefix. C0 ships `feature` and `rule`; the others are reserved for later phases
 * (history = real-world wars/inventions, the rest = live in-world entities).
 */
export type EncyclopediaNamespace =
  | "feature"
  | "rule"
  | "history"
  | "tech"
  | "state"
  | "burg"
  | "character"
  | "war"
  | "battle";

/** Inline bilingual text, or a reference into the app's i18n bundle (so About and the Encyclopedia share one string). */
export type LocalizedText = { en: string; ja?: string } | { i18nKey: string };

export type EncyclopediaBlock =
  | {
      kind: "markdown";
      text: LocalizedText;
      /** Relative link targets in the Markdown source (e.g. "./other.md") mapped to entry ids. */
      linkMap?: Readonly<Record<string, string>>;
    }
  | { kind: "list"; items: readonly LocalizedText[] };

export interface EncyclopediaEntry {
  /** `<namespace>:<key>`, e.g. "feature:cost-of-living". */
  id: string;
  namespace: EncyclopediaNamespace;
  title: LocalizedText;
  summary?: LocalizedText;
  body: readonly EncyclopediaBlock[];
  tags?: readonly string[];
  /** Explicit outgoing links (entry ids). Back-links are derived at display time. */
  links?: readonly string[];
  sources?: readonly { title: string; url: string }[];
}

/** Lightweight listing row used by the sidebar and the search index. */
export type EncyclopediaEntryStub = Pick<EncyclopediaEntry, "id" | "namespace" | "title" | "summary" | "tags">;

export interface EncyclopediaProvider {
  namespace: EncyclopediaNamespace;
  list(): readonly EncyclopediaEntryStub[];
  /** `key` is the id without the namespace prefix. */
  get(key: string): EncyclopediaEntry | null;
}

export type EncyclopediaLanguage = "en" | "ja";
