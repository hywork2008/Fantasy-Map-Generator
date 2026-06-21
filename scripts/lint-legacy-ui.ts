import fs from "fs";
import path from "path";

const controllersDir = path.join(__dirname, "../src/controllers");

function scanDir(dir: string) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      scanDir(fullPath);
    } else if (fullPath.endsWith(".ts")) {
      const content = fs.readFileSync(fullPath, "utf8");
      const lines = content.split("\n");
      lines.forEach((line, i) => {
        if (line.includes("ensureEl") || line.includes(".innerHTML")) {
          // ignore comments
          if (!line.trim().startsWith("//") && !line.trim().startsWith("/*")) {
            console.warn(`\x1b[33mWarning\x1b[0m: Legacy DOM API used at ${fullPath}:${i + 1}`);
            console.warn(`  ${line.trim()}`);
          }
        }
      });
    }
  }
}

console.log("Checking for legacy DOM APIs in src/controllers...");
scanDir(controllersDir);
console.log("Done.");
