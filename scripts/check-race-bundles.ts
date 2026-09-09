import path from "node:path";
import { build } from "vite";

async function main() {
// These runtime entries must bundle without the host application, another extension or CSV tooling.
for (const [owner, entry] of [
  ["characters", "src/extensions/characters/data/raceCatalog.ts"],
  ["economy", "src/extensions/economy/data/raceCatalog.ts"],
  ["bridge", "src/extensions/hostRaces.ts"]
] as const) {
  await build({
    configFile: false,
    logLevel: "error",
    build: { write: false, lib: { entry, formats: ["es"] }, minify: false },
    plugins: [{
      name: "verify-race-bundle-ownership",
      generateBundle() {
        for (const id of this.getModuleIds()) {
          if (id.startsWith("\0")) continue;
          const relative = path.relative(process.cwd(), id).replaceAll("\\", "/");
          const allowed = owner === "bridge" ? relative === entry : relative.startsWith(`src/extensions/${owner}/data/`);
          if (!allowed) throw new Error(`${entry} pulls in ${relative}`);
        }
      }
    }]
  });
  console.log(`${owner} race runtime: standalone bundle passed`);
}

}
main().catch(error => { console.error(error); process.exitCode = 1; });
