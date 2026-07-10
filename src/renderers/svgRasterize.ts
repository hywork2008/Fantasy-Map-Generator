// Rasterizes an SVG markup string into a PNG data URI via an offscreen <img>/<canvas> pair.
// Shared by emblem-renderer.ts (coa artwork) and burgIconRasterCache.ts (data-icon symbols):
// deck.gl's IconLayer auto-packing loads icon urls through loaders.gl, whose SVG image path calls
// createImageBitmap() on an <img> with no resize options — which Chromium can reject with
// "...SVG image without natural dimensions..." for data-URI SVGs under IconLayer's packing. A
// raster PNG data URI sidesteps that path entirely (see docs/webgl-renderer-migration-candidates.md
// Phase 6.1 開始ログ for the full story).
export function rasterizeSvgToPngDataUrl(svg: string, size: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("2d canvas context unavailable"));
        return;
      }
      ctx.drawImage(image, 0, 0, size, size);
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = () => reject(new Error("Failed to rasterize svg"));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}
