import { polygonArea } from "../../src/city-editor/core/gen/geom";
import type { Point } from "../../src/city-editor/core/types";

// 三角形建物の座標
const t12: Point[] = [
  [285.0541287633107, 122.7258312281998],
  [281.7319697715314, 127.87292963888288],
  [278.419930838343, 122.08951561493718]
];

console.log("Triangle 12 vertices:");
console.log("  A:", t12[0]);
console.log("  B:", t12[1]);
console.log("  C:", t12[2]);

const edgeAB = Math.hypot(t12[1][0] - t12[0][0], t12[1][1] - t12[0][1]);
const edgeBC = Math.hypot(t12[2][0] - t12[1][0], t12[2][1] - t12[1][1]);
const edgeCA = Math.hypot(t12[0][0] - t12[2][0], t12[0][1] - t12[2][1]);

console.log(`Edges: AB=${edgeAB.toFixed(2)}m, BC=${edgeBC.toFixed(2)}m, CA=${edgeCA.toFixed(2)}m`);
const area = (p: Point[]) => Math.abs(polygonArea(p));
console.log(`Area: ${area(t12).toFixed(2)} m^2`);

const t13: Point[] = [
  [282.4940405628981, 128.3648036194237],
  [279.7054008612446, 132.68530815032253],
  [275.08467247912006, 126.64268469655279]
];
console.log("\nTriangle 13 vertices:");
const eAB13 = Math.hypot(t13[1][0] - t13[0][0], t13[1][1] - t13[0][1]);
const eBC13 = Math.hypot(t13[2][0] - t13[1][0], t13[2][1] - t13[1][1]);
const eCA13 = Math.hypot(t13[0][0] - t13[2][0], t13[0][1] - t13[2][1]);
console.log(`Edges: AB=${eAB13.toFixed(2)}m, BC=${eBC13.toFixed(2)}m, CA=${eCA13.toFixed(2)}m`);
console.log(`Area: ${area(t13).toFixed(2)} m^2`);
