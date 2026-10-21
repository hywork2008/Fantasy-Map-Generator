import { ModelKit } from "../medieval/modelKit";

export const TREE_SPECIES = [
  "garden_parkland",
  "sacred_yew",
  "mediterranean_cypress",
  "oriental_evergreen",
  "sacred_bodhi_and_fig",
  "peaceful_willow"
] as const;
export type TreeSpecies = (typeof TREE_SPECIES)[number];

/** Stylized meter-scale silhouettes shared by BV and CE. Radius is set by the saved canopy. */
export function createLandscapeTree(species: TreeSpecies) {
  const k = new ModelKit(species);
  k.cylinder("trunk", [0, 1.6, 0], 0.22, 3.2, "oak", 0.14);
  if (species === "mediterranean_cypress") {
    k.cylinder("narrow-crown", [0, 5, 0], 0.95, 7, "green", 0.06, 12);
    k.sphere("lower-crown", [0, 3.2, 0], [0.85, 1.5, 0.85], "green");
  } else if (species === "oriental_evergreen") {
    for (const [y, r] of [
      [3, 2],
      [4.3, 1.6],
      [5.5, 1.1]
    ])
      k.cylinder("evergreen-tier", [0, y, 0], r, 2.8, "green", 0, 12);
  } else {
    const broad = species === "sacred_bodhi_and_fig";
    const willow = species === "peaceful_willow";
    const radius = broad ? 4 : willow ? 3 : 2.5;
    for (let i = 0; i < 5; i++) {
      const angle = (i * Math.PI * 2) / 5;
      const x = Math.cos(angle) * radius * 0.5,
        z = Math.sin(angle) * radius * 0.5;
      k.beam("branch", [0, 2.1, 0], [x, 3.7, z], 0.18, "oak", true);
      k.sphere("leaf-crown", [x, willow ? 3 : 4, z], [radius * 0.65, willow ? 2.5 : 1.6, radius * 0.65], "green");
      if (broad) k.cylinder("aerial-root", [x, 1.6, z], 0.07, 3.2, "oak");
    }
  }
  return k.finish();
}
