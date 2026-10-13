import { describe, it } from "vitest";
import { runHousingBatch } from "./housingBatch";

const options = process.env.HOUSING_BATCH;
describe.skipIf(!options)("housing batch cli", () => {
  it("exports or compares the selected cities", async () => {
    await runHousingBatch(JSON.parse(options!));
  }, 86_400_000);
});
