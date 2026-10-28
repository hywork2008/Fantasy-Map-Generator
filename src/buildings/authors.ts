/** AI models credited for BV models. These names are the only accepted author spellings. */
export const AUTHORS = ["Codex GPT-6.1 Sol", "Claude Opus 5.5", "Grok"] as const;
export type Author = (typeof AUTHORS)[number];

/** Credited for every BV model that records no author: all of them were made with Codex. */
export const DEFAULT_AUTHOR: Author = "Codex GPT-6.1 Sol";

/** Stable, lower-case form used inside variant ids. */
export function authorSlug(author: Author): string {
  return author.toLowerCase().replaceAll(" ", "-");
}
