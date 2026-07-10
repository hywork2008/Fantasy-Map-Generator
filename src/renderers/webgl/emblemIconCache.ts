import type { AppServices } from "../../context/appServices";
import type { Emblem } from "../../types/emblem";

// Bridges emblem-renderer.ts's async coa rasterization (network fetch of charge SVGs) into the
// otherwise-synchronous deck.gl data adapter pipeline. buildEmblemIcons() reads from this cache
// synchronously; when an icon is not yet ready it returns null and the caller falls back to the
// flat-color placeholder shield until the icon resolves.
const iconUrlCache = new Map<string, string>();
const pendingIds = new Set<string>();
let cacheVersion = 0;

// Keying by id alone would serve a stale icon after a new map generation reuses the same
// state/province/burg index with different heraldry, so the coa content itself is folded into
// the cache key (cheap: coa objects are small, and this is the same content-addressed approach
// Phase 5 already uses for the "emblems" deck layer signature).
function cacheKey(id: string, coa: Emblem): string {
  return `${id}:${JSON.stringify(coa)}`;
}

/**
 * Returns a cached data-URI icon for the given emblem id/coa, or null if not yet rendered.
 * On a cache miss, kicks off async rendering in the background and dispatches
 * `fmg:webgl-emblem-icon-ready` once it resolves so callers can trigger a redraw.
 */
export function getCachedEmblemIconUrl(
  id: string,
  coa: Emblem | null | undefined,
  appServices: Readonly<AppServices>
): string | null {
  if (!coa || coa.custom || !appServices.COArenderer) return null;

  const key = cacheKey(id, coa);
  const cached = iconUrlCache.get(key);
  if (cached) return cached;

  if (!pendingIds.has(key)) {
    pendingIds.add(key);
    appServices.COArenderer.renderIconDataUrl(id, coa)
      .then(url => {
        pendingIds.delete(key);
        if (!url) return;
        iconUrlCache.set(key, url);
        cacheVersion++;
        document.dispatchEvent(new CustomEvent("fmg:webgl-emblem-icon-ready", { detail: { id } }));
      })
      .catch(() => {
        pendingIds.delete(key);
      });
  }

  return null;
}

/** Folded into the "emblems" deck layer signature so a resolved icon forces a rebuild. */
export function getEmblemIconCacheVersion(): number {
  return cacheVersion;
}

export function clearEmblemIconCache(): void {
  iconUrlCache.clear();
  pendingIds.clear();
}
