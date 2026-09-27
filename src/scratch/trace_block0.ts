import { frontageBuildings } from "../../src/city-editor/core/gen/frontageBuildings";
import { makeRng } from "../../src/city-editor/core/gen/prng";
import type { Point } from "../../src/city-editor/core/types";

const block0: Point[] = [
  [216.23370698413348, 223.67050969937077],
  [198.71157176193978, 162.11200987876595],
  [199.82864312646157, 153.9480569879362],
  [226.82584118847643, 157.4659171047646]
];

const rng = makeRng("test:houses:f45:block0");
const buildings = frontageBuildings(
  block0,
  block0.map((_, i) => i),
  {
    lotArea: 110,
    coverage: 0.9,
    occupancy: 1,
    outskirts: false,
    perimeter: true,
    attached: false,
    primaryEdges: []
  },
  rng
);

console.log(`Total buildings in block0: ${buildings.length}`);
for (let i = 0; i < buildings.length; i++) {
  const b = buildings[i];
  console.log(`Building ${i} (${b.length} pts):`, JSON.stringify(b));
}
