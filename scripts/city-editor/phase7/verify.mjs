// Compare unnormalised hashes and stage order; report every actual difference.
import fs from "node:fs";
const directory = process.argv[2] ?? "artifacts/city-editor/phase7-20261014";
const before = JSON.parse(fs.readFileSync(`${directory}/stages-before.json`));
const after = JSON.parse(fs.readFileSync(`${directory}/stages-after.json`));
const baseline = JSON.parse(fs.readFileSync("docs/city-editor/reviews/1013-ce-phase0-baseline.json"));
const cases = after.cases.map((current, index) => {
  const previous = before.cases[index],
    original = baseline.cases.find(c => c.name === current.name);
  const keys = [
    "name",
    "documentSha256",
    "svgSha256",
    "savedSha256",
    "loadedSha256",
    "loadedSvgSha256",
    "inputUnchanged",
    "renderReadOnly"
  ];
  return {
    name: current.name,
    differences: keys.filter(key => current[key] !== previous[key]),
    baselineDifferences: ["documentSha256", "svgSha256"].filter(key => current[key] !== original[key]),
    stages: current.stages.length,
    stageDifferences: current.stages.flatMap((stage, index) =>
      JSON.stringify(stage) === JSON.stringify(previous.stages[index])
        ? []
        : [{ index, before: previous.stages[index], after: stage }]
    ),
    stageCountMatches: current.stages.length === previous.stages.length,
    inputUnchanged: current.inputUnchanged,
    renderReadOnly: current.renderReadOnly
  };
});
const result = {
  cases,
  stageCount: cases.reduce((n, c) => n + c.stages, 0),
  allIdentical:
    before.cases.length === after.cases.length &&
    cases.every(
      c =>
        !c.differences.length &&
        !c.baselineDifferences.length &&
        !c.stageDifferences.length &&
        c.stageCountMatches &&
        c.inputUnchanged &&
        c.renderReadOnly
    )
};
fs.writeFileSync(`${directory}/stage-comparison.json`, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
if (!result.allIdentical) process.exitCode = 1;
