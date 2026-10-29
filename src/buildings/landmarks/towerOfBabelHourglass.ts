import { ArchitectureKit, type LandmarkModel } from "./architectureKit";
import { addBabelEntrances } from "./details/babelEntrances";
import { BABEL_TIERS } from "./towerOfBabel";

const SCALE = 2.4;
const HALF_HEIGHT = BABEL_TIERS.reduce((sum, [, height]) => sum + height * SCALE, 0);
const ROAD_WIDTH = 6;
const ROAD_THICKNESS = 1.2;
const SEGMENTS = 32;

export const model: LandmarkModel = {
  id: "tower-of-babel-hourglass",
  task: "I02",
  name: "Tower of Babel (hourglass road terraces)",
  style: "Imaginary",
  state: "240 m base; upright lower tower and stepped upper tower with projecting road decks and arched entrances",
  size: [240, 240, HALF_HEIGHT * 2],
  dimensions:
    "Base and summit diameter 240 m; waist diameter 57.6 m; total height 508.8 m. " +
    "Each half is 254.4 m tall. Lower tier proportions follow I01 at 2.4 times its illustrative scale. " +
    "Upper tier diameters reverse the lower sequence. Upper road decks are 1.2 m thick, " +
    "with the next tier's foot inset 6 m from the deck edge.",
  note:
    "Imaginary hourglass composition inspired by an upright Babel tower topped by its inverted counterpart. " +
    "The lower half has fourteen level cylindrical tiers. The upper half has fourteen vertical cylindrical walls " +
    "and horizontal circular road decks, all in the same stone color as the lower half. Every next wall starts inside the " +
    "previous deck's edge, preserving an exposed road terrace instead of an inaccessible underside ledge. " +
    "The 240 m base is an authored scale assumption, not a measured dimension of the painting. " +
    "Dark round-headed entrances are painted around every tier; they do not cut through the wall. " +
    "Inter-tier stairs or ramps, attached base turrets, interiors, railings and structural engineering are omitted.",
  sources: [
    {
      title: "Lower tower silhouette reference: Valckenborch, The Tower of Babel (1594)",
      url: "https://commons.wikimedia.org/wiki/File:La_Tour_de_Babel,_Van_Valckenborch,_1594.jpg"
    }
  ],
  create() {
    const k = new ArchitectureKit(this.id, "stone");
    let base = 0;
    for (const [index, [diameter, tierHeight]] of BABEL_TIERS.entries()) {
      const radius = (diameter * SCALE) / 2;
      const height = tierHeight * SCALE;
      k.cylinder(`lower-tier-${index + 1}`, [0, base + height / 2, 0], radius, height, "stone", radius, SEGMENTS);
      addBabelEntrances(k, `lower-entrances-${index + 1}`, radius, base, height);
      base += height;
    }
    let previousRadius = (BABEL_TIERS.at(-1)![0] * SCALE) / 2;
    for (const [index, [diameter, tierHeight]] of [...BABEL_TIERS].reverse().entries()) {
      const radius = (diameter * SCALE) / 2;
      const height = tierHeight * SCALE;
      const bodyHeight = height - ROAD_THICKNESS;
      const bodyRadius = previousRadius - ROAD_WIDTH;
      k.cylinder(
        `upper-tier-${index + 1}`,
        [0, base + bodyHeight / 2, 0],
        bodyRadius,
        bodyHeight,
        "stone",
        bodyRadius,
        SEGMENTS
      );
      addBabelEntrances(k, `upper-entrances-${index + 1}`, bodyRadius, base, bodyHeight);
      k.cylinder(
        `upper-road-${index + 1}`,
        [0, base + height - ROAD_THICKNESS / 2, 0],
        radius,
        ROAD_THICKNESS,
        "stone",
        radius,
        SEGMENTS
      );
      previousRadius = radius;
      base += height;
    }
    return k.finish();
  }
};
