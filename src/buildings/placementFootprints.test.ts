import { writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import table from "./placementFootprints.json";
import heightTable from "./placementHeights.json";
import { measureAllPlacementFootprints, measureAllPlacementHeights } from "./placementModels";

// Regenerate after changing a model's size: UPDATE_PLACEMENT_FOOTPRINTS=1 npx vitest run src/buildings/placementFootprints.test.ts
it("keeps the footprints measured ahead equal to the models", () => {
  const measured = measureAllPlacementFootprints();
  if (process.env.UPDATE_PLACEMENT_FOOTPRINTS)
    writeFileSync("src/buildings/placementFootprints.json", `${JSON.stringify(measured, null, 1)}\n`);
  else expect(table).toEqual(measured);
}, 600000);

it("keeps the heights measured ahead equal to the models", () => {
  const measured = measureAllPlacementHeights();
  if (process.env.UPDATE_PLACEMENT_FOOTPRINTS)
    writeFileSync("src/buildings/placementHeights.json", `${JSON.stringify(measured, null, 1)}\n`);
  else expect(heightTable).toEqual(measured);
}, 600000);
