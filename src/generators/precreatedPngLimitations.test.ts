import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HeightThreshold } from "../data/constants";
import { heightFromImageLightness } from "./heightmap-generator";

const require = createRequire(import.meta.url);
const { PNG } = require("pngjs") as {
  PNG: { sync: { read: (buf: Buffer) => { width: number; height: number; data: Uint8Array } } };
};

/**
 * Characterizes the legacy PNG precreated path. These are known failures the
 * Earth-region sampler is meant to fix — do not "fix" this test by changing
 * the PNG loader.
 */
describe("precreated PNG east-asia limitations", () => {
  it("treats near-sea-level lightness as water", () => {
    // Heightmapper min=-500 max=2000 maps 0 m to ~0.2, the water cutoff.
    expect(heightFromImageLightness(0.19)).toBeLessThan(HeightThreshold.WATER_MAX_HEIGHT);
    expect(heightFromImageLightness(0.2)).toBeGreaterThanOrEqual(HeightThreshold.WATER_MAX_HEIGHT);
  });

  it("loses the Kanto plain after downsample + threshold on the stock PNG", () => {
    const pngPath = path.resolve(process.cwd(), "public/heightmaps/east-asia.png");
    if (!fs.existsSync(pngPath)) return;
    const png = PNG.sync.read(fs.readFileSync(pngPath));
    // Approximate Kanto in the 400×256 screenshot: east-central Honshu.
    // After a 60×38 downsample (typical ~10k-cell grid), those pixels sit
    // on the water side of IMAGE_WATER_THRESHOLD.
    const cellsX = 60;
    const cellsY = 38;
    const x = Math.round((327 / 400) * cellsX);
    const y = Math.round((108 / 256) * cellsY);
    const sx = Math.min(png.width - 1, Math.floor((x + 0.5) * (png.width / cellsX)));
    const sy = Math.min(png.height - 1, Math.floor((y + 0.5) * (png.height / cellsY)));
    const lightness = png.data[(sy * png.width + sx) * 4] / 255;
    expect(heightFromImageLightness(lightness)).toBeLessThan(HeightThreshold.WATER_MAX_HEIGHT);
  });
});
