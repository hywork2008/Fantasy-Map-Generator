// Tracks external marker image URLs (user-provided http/data:image marker icons) that deck.gl's
// IconLayer failed to load, so buildMarkerSymbols() can fall back to no icon instead of leaving a
// broken/blank image on the map indefinitely. Populated via IconLayer's `onIconError` callback in
// buildDeckLayers.ts, not by this module itself — it has no loading logic of its own.
const failedUrls = new Set<string>();
let cacheVersion = 0;

export function markExternalIconFailed(url: string): void {
  if (!url || failedUrls.has(url)) return;
  failedUrls.add(url);
  cacheVersion++;
  document.dispatchEvent(new CustomEvent("fmg:webgl-external-icon-failed", { detail: { url } }));
}

export function hasExternalIconFailed(url: string): boolean {
  return failedUrls.has(url);
}

/** Folded into the "markers" deck layer signature so a newly detected failure forces a rebuild. */
export function getExternalIconFailureCacheVersion(): number {
  return cacheVersion;
}

export function clearExternalIconFailureCache(): void {
  failedUrls.clear();
}
