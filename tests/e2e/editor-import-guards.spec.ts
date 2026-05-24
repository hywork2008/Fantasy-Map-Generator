import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const uiDir = path.resolve(__dirname, "../../packages/@fmg/legacy-ui/src/modules/ui");

function getUiModuleFiles() {
  return fs
    .readdirSync(uiDir)
    .filter(name => name.endsWith(".ts"))
    .map(name => path.join(uiDir, name));
}

function hasNamedImport(source: string, symbol: string, fromPath: string) {
  const pattern = new RegExp(
    `import\\s*\\{[^}]*\\b${symbol}\\b[^}]*\\}\\s*from\\s*[\"']${fromPath}[\"']`,
    "m"
  );
  return pattern.test(source);
}

test.describe("Editor import guards", () => {
  test("bare unselect() calls in UI modules must import unselect from ./editors", async () => {
    const offenders: string[] = [];

    for (const filePath of getUiModuleFiles()) {
      const base = path.basename(filePath);
      if (base === "editors.ts") continue;

      const source = fs.readFileSync(filePath, "utf8");
      const hasBareUnselectCall = /(^|[^.\w])unselect\(/m.test(source);
      if (!hasBareUnselectCall) continue;

      const hasImport = hasNamedImport(source, "unselect", "./editors");
      if (!hasImport) offenders.push(path.relative(process.cwd(), filePath));
    }

    expect(
      offenders,
      `Missing unselect import from ./editors in: ${offenders.join(", ")}`
    ).toEqual([]);
  });
});
