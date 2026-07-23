import type { DataTopic, WorldReadView } from "../../runtime/worldRuntime";

/**
 * The revision projection consumed by WebGL cache keys. It is intentionally a
 * read-only subset of WorldReadView so preview adapters can omit it and retain
 * the legacy content-hash fallback while untracked writers still exist.
 */
export type WebglRevisionProjection = Pick<WorldReadView, "revision" | "topicRevisions">;

/**
 * Makes a cache key from the owner topics of a projection. The fallback stays
 * local to the caller because only that adapter knows how to hash legacy data.
 */
export function getWebglTopicRevisionSignature(
  projection: WebglRevisionProjection | undefined,
  stableKey: string,
  topics: readonly DataTopic[],
  legacyFallback: () => string
): string {
  if (!projection) return legacyFallback();
  const revisions = topics.map(topic => `${topic}:${projection.topicRevisions[topic] ?? 0}`).join("|");
  // Do not include the global revision here. It advances for every commit,
  // including commits to unrelated topics, and would turn topic-scoped cache
  // invalidation back into a full projection rebuild. A full replacement
  // increments every topic revision, so the declared dependencies are enough.
  return `${stableKey}|${revisions}`;
}
