import multiRaceGeopolitics from "../../../docs/world/help/multi-race-geopolitics.md?raw";
import racesBeautyAndPairing from "../../../docs/world/help/races-beauty-and-pairing.md?raw";
import type { EncyclopediaEntry } from "../encyclopediaTypes";
import { createStaticProvider } from "./staticProvider";

/**
 * World-rule articles from docs/world/help/ (English-only setting notes).
 * The docs stay the single source; the leading "# World help: …" heading becomes the entry title.
 */
const SOURCES: readonly { key: string; markdown: string; tags: readonly string[] }[] = [
  {
    key: "multi-race-geopolitics",
    markdown: multiRaceGeopolitics,
    tags: ["race", "races", "state", "diplomacy", "civic stance", "種族", "外交"]
  },
  {
    key: "races-beauty-and-pairing",
    markdown: racesBeautyAndPairing,
    tags: ["race", "races", "appearance", "beauty", "marriage", "種族", "容姿", "婚姻"]
  }
];

/** Cross-links between the help docs, so their relative Markdown links stay clickable in the app. */
const LINK_MAP: Readonly<Record<string, string>> = Object.fromEntries(
  SOURCES.map(({ key }) => [`./${key}.md`, `rule:${key}`])
);

export function splitTitle(markdown: string): { title: string; body: string } {
  const match = /^#\s+(.+)\n/.exec(markdown);
  if (!match) return { title: "", body: markdown };
  return { title: match[1].replace(/^World help:\s*/i, "").trim(), body: markdown.slice(match[0].length) };
}

export const RULE_ENTRIES: readonly EncyclopediaEntry[] = SOURCES.map(({ key, markdown, tags }) => {
  const { title, body } = splitTitle(markdown);
  const titleText = title ? title.charAt(0).toUpperCase() + title.slice(1) : key;
  return {
    id: `rule:${key}`,
    namespace: "rule",
    title: { en: titleText },
    tags,
    body: [{ kind: "markdown", text: { en: body }, linkMap: LINK_MAP }]
  };
});

export const ruleProvider = createStaticProvider("rule", RULE_ENTRIES);
