import { rasterizeSvgToPngDataUrl } from "../svgRasterize";

// Bridges the static SVG <symbol> definitions referenced by burg group `data-icon` attributes
// (src/index.html, e.g. "#icon-circle", "#icon-watabou-capital") into deck.gl IconLayer icons.
// Unlike coa artwork (emblemIconCache.ts), the set of distinct symbols is small and fixed for the
// whole app session, so this only ever caches a handful of entries — one per distinct data-icon
// value actually in use, not one per burg.
export const BURG_ICON_RASTER_SIZE = 64;

interface BurgIconRaster {
  url: string;
  /** True for plain single-color glyphs (circle/square/star/...), tinted via getColor like the old
   * hardcoded placeholders. False for multi-color pictorial icons (#icon-watabou-*), whose own
   * colors are rasterized as-is and shown unmodified. */
  mask: boolean;
}

const rasterCache = new Map<string, BurgIconRaster>();
const pendingHrefs = new Set<string>();
let cacheVersion = 0;

/**
 * Returns a cached icon raster for the given `data-icon` href (e.g. "#icon-circle"), or null if
 * not yet rendered. On a cache miss, kicks off async rasterization in the background and
 * dispatches `fmg:webgl-burg-icon-ready` once it resolves so callers can trigger a redraw.
 */
export function getCachedBurgIconRaster(symbolHref: string): BurgIconRaster | null {
  const cached = rasterCache.get(symbolHref);
  if (cached) return cached;

  if (!pendingHrefs.has(symbolHref)) {
    pendingHrefs.add(symbolHref);
    rasterizeIconSymbol(symbolHref)
      .then(raster => {
        pendingHrefs.delete(symbolHref);
        if (!raster) return;
        rasterCache.set(symbolHref, raster);
        cacheVersion++;
        document.dispatchEvent(new CustomEvent("fmg:webgl-burg-icon-ready", { detail: { symbolHref } }));
      })
      .catch(() => {
        pendingHrefs.delete(symbolHref);
      });
  }

  return null;
}

/** Folded into the "burgIcons" deck layer signature so a resolved icon forces a rebuild. */
export function getBurgIconRasterCacheVersion(): number {
  return cacheVersion;
}

export function clearBurgIconRasterCache(): void {
  rasterCache.clear();
  pendingHrefs.clear();
}

async function rasterizeIconSymbol(symbolHref: string): Promise<BurgIconRaster | null> {
  const symbolId = symbolHref.replace(/^#/, "");
  const symbol = document.getElementById(symbolId);
  if (!symbol) return null;

  // The app's own `viewBox`/`overflow: visible` convention on these <symbol>s only works for the
  // live inline <use> rendering pipeline: content routinely extends outside the declared viewBox
  // (e.g. a circle of radius 5 inside a "0 0 10 10" box), and some icons (#icon-watabou-*) apply
  // large translate/scale transforms that place content far outside it entirely. None of that
  // "visible overflow" carries over once rasterized to a standalone image, which always clips to
  // its own bounds — so the actual rendered geometry has to be measured instead of guessed.
  const bbox = measureSymbolBBox(symbolHref);
  if (!bbox) return null;

  const inner = symbol.innerHTML;
  // A symbol with no explicit fill anywhere in its subtree is a plain glyph shape that inherits
  // color from its containing group in the live SVG (e.g. #icon-circle) — rasterize it forced to
  // white so it works as an IconLayer color mask. A symbol with its own fill attributes (e.g.
  // #icon-watabou-capital) is a multi-color picture — rasterize it as-is and show it unmodified.
  const hasOwnColor = symbol.querySelector("[fill]") !== null;
  const padding = Math.max(bbox.width, bbox.height) * 0.08;
  const viewBox = `${bbox.x - padding} ${bbox.y - padding} ${bbox.width + padding * 2} ${bbox.height + padding * 2}`;
  const svg = hasOwnColor
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${BURG_ICON_RASTER_SIZE}" height="${BURG_ICON_RASTER_SIZE}">${inner}</svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${BURG_ICON_RASTER_SIZE}" height="${BURG_ICON_RASTER_SIZE}" fill="#ffffff" stroke="#ffffff">${inner}</svg>`;

  const url = await rasterizeSvgToPngDataUrl(svg, BURG_ICON_RASTER_SIZE);
  return { url, mask: !hasOwnColor };
}

/** Measures a <symbol>'s actual rendered geometry via a temporary detached <use>, since the
 * declared viewBox is not a reliable bounding box (see rasterizeIconSymbol). */
function measureSymbolBBox(symbolHref: string): { x: number; y: number; width: number; height: number } | null {
  const svgNs = "http://www.w3.org/2000/svg";
  const probe = document.createElementNS(svgNs, "svg") as SVGSVGElement;
  probe.setAttribute("width", "1");
  probe.setAttribute("height", "1");
  probe.style.position = "absolute";
  probe.style.top = "-9999px";
  probe.style.left = "-9999px";
  probe.style.overflow = "visible";
  const use = document.createElementNS(svgNs, "use") as SVGUseElement;
  use.setAttribute("href", symbolHref);
  probe.appendChild(use);
  document.body.appendChild(probe);

  try {
    const box = use.getBBox();
    if (!Number.isFinite(box.width) || !Number.isFinite(box.height) || box.width <= 0 || box.height <= 0) return null;
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  } catch {
    return null;
  } finally {
    probe.remove();
  }
}
