import fs from "node:fs";
const directory = process.argv[2] ?? "artifacts/city-editor/phase7-20261014";
const before = JSON.parse(fs.readFileSync(`${directory}/performance-before.json`));
const after = JSON.parse(fs.readFileSync(`${directory}/performance-after.json`));
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const fields = ["generationMs", "renderMs", "heapBefore", "heapRetained", "heapReleased", "rssRetained"];
const summarize = result => Object.fromEntries(fields.map(key => [key, median(result.runs.map(run => run[key]))]));
const first = before.runs[0];
const dimensions = ["documentSha256", "svgSha256", "faces", "nodes", "buildings"];
const identityMatch = [...before.runs, ...after.runs].every(run => dimensions.every(key => run[key] === first[key]));
const environmentMatch = ["node", "cpu", "platform", "arch"].every(key => before[key] === after[key]);
const a = summarize(before),
  b = summarize(after);
const collected = before.runs.concat(after.runs).every(run => run.collected.every(Boolean));
const result = {
  environment: { node: before.node, cpu: before.cpu, platform: before.platform, arch: before.arch },
  warmup: 1,
  repeats: 3,
  environmentMatch,
  identityMatch,
  collected,
  dimensions: Object.fromEntries(dimensions.map(key => [key, first[key]])),
  before: a,
  after: b,
  changePercent: Object.fromEntries(fields.map(key => [key, (b[key] / a[key] - 1) * 100]))
};
fs.writeFileSync(`${directory}/performance-comparison.json`, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
if (!identityMatch || !environmentMatch || !collected) process.exitCode = 1;
