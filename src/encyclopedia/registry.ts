import type {
  EncyclopediaEntry,
  EncyclopediaEntryStub,
  EncyclopediaNamespace,
  EncyclopediaProvider
} from "./encyclopediaTypes";
import { collectEntryLinks, parseMarkdown } from "./markdown";
import { featureProvider } from "./providers/featureProvider";
import { ruleProvider } from "./providers/ruleProvider";

/**
 * Namespace → provider. Built-in providers are registered here; extensions (characters, nobility…)
 * will call registerEncyclopediaProvider() themselves so core never imports extension code.
 */
const providers = new Map<EncyclopediaNamespace, EncyclopediaProvider>([
  [featureProvider.namespace, featureProvider],
  [ruleProvider.namespace, ruleProvider]
]);

/** Display order of namespaces in the sidebar. */
export const ENCYCLOPEDIA_NAMESPACE_ORDER: readonly EncyclopediaNamespace[] = [
  "feature",
  "rule",
  "history",
  "tech",
  "war",
  "battle",
  "state",
  "burg",
  "character"
];

export const DEFAULT_ENCYCLOPEDIA_ENTRY_ID = "feature:encyclopedia";

export function registerEncyclopediaProvider(provider: EncyclopediaProvider): () => void {
  providers.set(provider.namespace, provider);
  return () => {
    if (providers.get(provider.namespace) === provider) providers.delete(provider.namespace);
  };
}

export function listEncyclopediaEntries(): EncyclopediaEntryStub[] {
  return ENCYCLOPEDIA_NAMESPACE_ORDER.flatMap(ns => [...(providers.get(ns)?.list() ?? [])]);
}

export function getEncyclopediaEntry(id: string): EncyclopediaEntry | null {
  const separator = id.indexOf(":");
  if (separator < 0) return null;
  const provider = providers.get(id.slice(0, separator) as EncyclopediaNamespace);
  return provider?.get(id.slice(separator + 1)) ?? null;
}

/** Outgoing entry ids of an entry: explicit `links` plus every [[id]] / mapped link in its Markdown (both languages). */
export function getOutgoingLinks(entry: EncyclopediaEntry): string[] {
  const ids = new Set(entry.links ?? []);
  for (const block of entry.body) {
    if (block.kind !== "markdown" || "i18nKey" in block.text) continue;
    for (const source of [block.text.en, block.text.ja]) {
      if (source) for (const id of collectEntryLinks(parseMarkdown(source, block.linkMap))) ids.add(id);
    }
  }
  ids.delete(entry.id);
  return [...ids];
}

/** Entries that link to `id`. Static content is small, so a full scan on demand is fine. */
export function getBacklinks(id: string): EncyclopediaEntryStub[] {
  return listEncyclopediaEntries().filter(stub => {
    if (stub.id === id) return false;
    const entry = getEncyclopediaEntry(stub.id);
    return entry ? getOutgoingLinks(entry).includes(id) : false;
  });
}
