// Create a read-only-use source snapshot without checking out or inspecting CG.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
const commit = process.argv[2] ?? "cf32584ecfe5e2e510e8f01e536184db00791b3d";
const out = path.resolve(process.argv[3] ?? "artifacts/city-editor/phase7-20261014/pre-refactor");
if (fs.existsSync(out)) throw Error(`Snapshot exists: ${out}; choose a new output directory`);
const entries = execFileSync("git", ["ls-tree", "--name-only", `${commit}:src`], { encoding: "utf8" })
  .trim()
  .split("\n");
const selected = entries.filter(name => !["city-generator", "city"].includes(name)).map(name => `src/${name}`);
fs.mkdirSync(out, { recursive: true });
const archive = execFileSync("git", ["archive", commit, ...selected, "package.json", "tsconfig.json"], {
  maxBuffer: 256 * 1024 * 1024
});
execFileSync("tar", ["-x", "-C", out], { input: archive });
fs.symlinkSync(path.resolve("node_modules"), path.join(out, "node_modules"), "dir");
fs.writeFileSync(
  path.join(out, "audit-snapshot.json"),
  JSON.stringify(
    { commit, excluded: ["src/city-generator", "src/city"], dependencies: "workspace node_modules" },
    null,
    2
  ) + "\n"
);
console.log(JSON.stringify({ commit, out, excluded: ["city-generator", "city"] }));
