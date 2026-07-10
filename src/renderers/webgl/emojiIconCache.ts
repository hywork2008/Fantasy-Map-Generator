/**
 * Emoji rasterization cache for deck.gl IconLayer.
 *
 * deck.gl's TextLayer renders text through a WebGL font atlas, which is a monochrome bitmap —
 * emoji get flattened to black silhouettes when colored with getColor. To display full-color
 * emoji we pre-render each unique character to a Canvas 2D data URL and use IconLayer instead.
 */

const EMOJI_ICON_SIZE = 64;

const emojiCache = new Map<string, string>();
const pendingEmojis = new Set<string>();
let cacheVersion = 0;

/**
 * Returns a cached data URL for the given emoji character, or null if not yet ready.
 * On a cache miss the emoji is rendered asynchronously; once ready,
 * `fmg:webgl-emoji-icon-ready` is dispatched so callers can trigger a redraw.
 * Returns null for both cache-miss AND while the render is still in progress so
 * callers always receive either a valid URL or null — never an empty string.
 */
export function getCachedEmojiIconUrl(emoji: string): string | null {
  const cached = emojiCache.get(emoji);
  if (cached !== undefined) return cached; // valid URL ready

  if (!pendingEmojis.has(emoji)) {
    pendingEmojis.add(emoji);
    renderEmojiToDataUrl(emoji)
      .then(url => {
        pendingEmojis.delete(emoji);
        emojiCache.set(emoji, url);
        cacheVersion++;
        document.dispatchEvent(new CustomEvent("fmg:webgl-emoji-icon-ready", { detail: { emoji } }));
      })
      .catch(() => {
        pendingEmojis.delete(emoji);
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

async function renderEmojiToDataUrl(emoji: string): Promise<string> {
  const size = EMOJI_ICON_SIZE;
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

export const EMOJI_ICON_SIZE_PX = EMOJI_ICON_SIZE;
