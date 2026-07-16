/**
 * Emoji rasterization cache for deck.gl IconLayer.
 *
 * deck.gl's TextLayer renders text through a WebGL font atlas, which is a monochrome bitmap —
 * emoji get flattened to black silhouettes when colored with getColor. To display full-color
 * emoji we pre-render each unique character to a Canvas 2D data URL and use IconLayer instead.
 *
 * A single fixed raster size looks blurry once the map is zoomed in far enough that the icon's
 * on-screen footprint exceeds that raster (deck.gl stretches the same texture to fill the
 * requested world-space size). Instead each emoji is cached per discrete resolution tier, and
 * callers pick the smallest tier that covers the icon's current on-screen pixel size.
 */

export const EMOJI_ICON_RESOLUTIONS = [64, 128, 256, 512] as const;
export type EmojiIconResolution = (typeof EMOJI_ICON_RESOLUTIONS)[number];

const emojiCache = new Map<string, string>(); // key: `${emoji}@${resolution}`
const pendingEmojis = new Set<string>();
let cacheVersion = 0;

/** Smallest resolution tier whose raster is at least `targetSizePx`, capped at the largest tier. */
export function pickEmojiIconResolution(targetSizePx: number): EmojiIconResolution {
  for (const resolution of EMOJI_ICON_RESOLUTIONS) {
    if (resolution >= targetSizePx) return resolution;
  }
  return EMOJI_ICON_RESOLUTIONS[EMOJI_ICON_RESOLUTIONS.length - 1];
}

/**
 * Returns a cached data URL for the given emoji character at the given resolution tier, or null
 * if not yet ready. On a cache miss the emoji is rendered asynchronously; once ready,
 * `fmg:webgl-emoji-icon-ready` is dispatched so callers can trigger a redraw.
 * Returns null for both cache-miss AND while the render is still in progress so
 * callers always receive either a valid URL or null — never an empty string.
 */
export function getCachedEmojiIconUrl(emoji: string, resolution: EmojiIconResolution): string | null {
  const key = `${emoji}@${resolution}`;
  const cached = emojiCache.get(key);
  if (cached !== undefined) return cached; // valid URL ready

  if (!pendingEmojis.has(key)) {
    pendingEmojis.add(key);
    renderEmojiToDataUrl(emoji, resolution)
      .then(url => {
        pendingEmojis.delete(key);
        emojiCache.set(key, url);
        cacheVersion++;
        document.dispatchEvent(new CustomEvent("fmg:webgl-emoji-icon-ready", { detail: { emoji, resolution } }));
      })
      .catch(() => {
        pendingEmojis.delete(key);
      });
  }

  return null; // not ready yet (first call or still rendering)
}

/** Included in layer signatures so a newly resolved emoji triggers a cache rebuild. */
export function getEmojiIconCacheVersion(): number {
  return cacheVersion;
}

export function clearEmojiIconCache(): void {
  emojiCache.clear();
  pendingEmojis.clear();
}

async function renderEmojiToDataUrl(emoji: string, size: EmojiIconResolution): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  // Use a font size slightly smaller than the canvas so the glyph fits with padding.
  ctx.font = `${Math.round(size * 0.8)}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Canvas 2D has Y=0 at top; WebGL textures have Y=0 at bottom.
  // Without correction the emoji appears upside-down when used as an IconLayer texture.
  // Flip the context vertically so the rasterized pixels are stored bottom-to-top,
  // which WebGL then uploads right-side-up.
  ctx.translate(size / 2, size / 2);
  ctx.scale(1, -1);
  ctx.fillText(emoji, 0, 0);
  return canvas.toDataURL("image/png");
}
