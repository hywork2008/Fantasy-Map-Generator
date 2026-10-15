import type { EncyclopediaEntry, EncyclopediaNamespace, EncyclopediaProvider } from "../encyclopediaTypes";

/** Provider over a fixed list of entries bundled with the app. */
export function createStaticProvider(
  namespace: EncyclopediaNamespace,
  entries: readonly EncyclopediaEntry[]
): EncyclopediaProvider {
  const byKey = new Map(entries.map(entry => [entry.id.slice(namespace.length + 1), entry]));
  return {
    namespace,
    list: () =>
      entries.map(({ id, namespace: ns, title, summary, tags }) => ({ id, namespace: ns, title, summary, tags })),
    get: key => byKey.get(key) ?? null
  };
}
