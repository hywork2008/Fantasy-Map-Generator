import { color } from "d3";

/**
 * Draws a raster heightmap preview based on given heights and rendering options
 * @param {Object} options - The options for drawing the heightmap
 * @param {Array} options.heights - The array of height values
 * @param {number} options.width - The width of the heightmap
 * @param {number} options.height - The height of the heightmap
 * @param {Function} options.scheme - The color scheme function for rendering heights
 * @param {boolean} options.renderOcean - Whether to render ocean heights
 * @returns {string} - A data URL representing the drawn heightmap image
 */
export const drawHeights = ({
  heights,
  width,
  height,
  scheme,
  renderOcean
}: {
  heights: ArrayLike<number>;
  width: number;
  height: number;
  scheme: (value: number) => string;
  renderOcean: boolean;
}) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.createImageData(width, height);

  const getHeight = (height: number) => (height < 20 ? (renderOcean ? height : 0) : height);

  for (let i = 0; i < heights.length; i++) {
    const colorScheme = scheme(1 - getHeight(heights[i]) / 100);
    const { r, g, b } = color(colorScheme)?.rgb() ?? { r: 0, g: 0, b: 0 };

    const n = i * 4;
    imageData.data[n] = r;
    imageData.data[n + 1] = g;
    imageData.data[n + 2] = b;
    imageData.data[n + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
};
