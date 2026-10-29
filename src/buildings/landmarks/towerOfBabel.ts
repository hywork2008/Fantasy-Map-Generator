import { ArchitectureKit, type LandmarkModel } from "./architectureKit";

/**
 * Bottom to top, [diameter, height] in study metres. Hand-estimated silhouette
 * ratios from Valckenborch's 1594 painting, normalized to a 100 m base.
 * These are exterior terrace bands, not surveyed internal storeys. Flat bands
 * replace the painting's ascending circuit; attached base turrets are excluded.
 */
export const BABEL_TIERS = [
  [100, 10],
  [94, 10],
  [88, 10],
  [81, 10],
  [75, 9],
  [69, 8],
  [63, 8],
  [57, 7],
  [52, 7],
  [47, 6],
  [42, 6],
  [37, 6],
  [31, 5],
  [24, 4]
] as const;

export const model: LandmarkModel = {
  id: "tower-of-babel",
  task: "I01",
  name: "Tower of Babel (Valckenborch, 1594)",
  style: "Imaginary",
  state: "Coarse tier-width study; flat terraces and no attached base turrets",
  size: [100, 100, 106],
  dimensions:
    "Illustrative scale: base diameter 100 m, total height 106 m. Tier diameters from base to summit: " +
    BABEL_TIERS.map(([diameter]) => diameter).join(", ") +
    " m. Ratios are estimated from the painting, not measured architectural dimensions.",
  note:
    "Original low-resolution silhouette study after Lucas van Valckenborch's 1594 Tower of Babel. " +
    "Fourteen concentric, 32-sided cylinders preserve independently specified tier widths and expose flat terraces. " +
    "The ascending outer circuit is simplified to level bands. Attached base turrets, bridges, buttresses, " +
    "arcades, interiors, cranes and irregular unfinished summit masonry are omitted.",
  sources: [
    {
      title: "Reference painting: Lucas van Valckenborch, The Tower of Babel (1594)",
      url: "https://commons.wikimedia.org/wiki/File:La_Tour_de_Babel,_Van_Valckenborch,_1594.jpg"
    }
  ],
  create() {
    const k = new ArchitectureKit(this.id, "stone");
    let base = 0;
    for (const [index, [diameter, height]] of BABEL_TIERS.entries()) {
      k.cylinder(`tier-${index + 1}`, [0, base + height / 2, 0], diameter / 2, height, "stone", diameter / 2, 32);
      base += height;
    }
    return k.finish();
  }
};
