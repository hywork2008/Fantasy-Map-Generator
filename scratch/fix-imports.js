const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const modulesMap = {
  Lakes: "modules/lakes",
  Rivers: "modules/river-generator",
  Burgs: "modules/burgs-generator",
  Cultures: "modules/cultures-generator",
  States: "modules/states-generator",
  Zones: "modules/zones-generator",
  Religions: "modules/religions-generator",
  Provinces: "modules/provinces-generator",
  Ice: "modules/ice",
  Military: "modules/military-generator",
  Markers: "modules/markers-generator",
  Biomes: "modules/biomes",
  Features: "modules/features",
  Routes: "modules/routes-generator",
  COA: "modules/emblem/generator",
  COArenderer: "modules/emblem/renderer"
};

function getRelativeImportPath(fromFile, targetDir) {
  const fromDir = path.dirname(fromFile); // e.g. "src/controllers"
  const targetPath = `src/${targetDir}`; // e.g. "src/utils" or "src/modules/lakes"
  
  if (fromDir === targetPath) {
    return "./index";
  }
  
  let rel = path.relative(fromDir, targetPath);
  if (!rel.startsWith('.')) {
    rel = `./${rel}`;
  }
  return rel;
}

function run() {
  console.log("Running tsc...");
  let stdout = "";
  try {
    stdout = execSync("npx tsc --noEmit", { encoding: 'utf8', cwd: path.resolve(__dirname, '..') });
  } catch (err) {
    stdout = err.stdout;
  }

  const lines = stdout.split('\n');
  const missingByFile = {};

  for (const line of lines) {
    const match = line.match(/(src\/[^(]+)\((\d+),\d+\): error TS(2304|2552|2551|2339): (.+)/);
    if (!match) continue;
    const filePath = match[1];
    const errorText = match[4];

    const nameMatch = errorText.match(/Cannot find name '([^']+)'/) || 
                      errorText.match(/Property '([^']+)' does not exist on type 'Window & typeof globalThis'/);
    if (!nameMatch) continue;
    const missing = nameMatch[1];

    if (!missingByFile[filePath]) {
      missingByFile[filePath] = new Set();
    }
    missingByFile[filePath].add(missing);
  }

  console.log("Found missing imports by file:", missingByFile);

  for (const [relPath, missingSet] of Object.entries(missingByFile)) {
    const absPath = path.resolve(__dirname, '..', relPath);
    let content = fs.readFileSync(absPath, 'utf8');

    // Special fix: in burgs-generator.ts, replace window.findCell with findCell
    if (relPath === "src/modules/burgs-generator.ts") {
      content = content.replace(/window\.findCell/g, "findCell");
    }

    const grouped = {};

    for (const m of missingSet) {
      let target = "";
      if (m === "OceanLayers") {
        target = "modules/ocean-layers";
      } else if (modulesMap[m]) {
        target = modulesMap[m];
      } else {
        const isRenderer = (m.startsWith("draw") && m !== "drawHeights") || 
                           ["fitScaleBar", "redrawIceberg", "redrawGlacier", "getFeaturePath", "getPin", "moveRegiment", "renderGroupCOAs", "drawBurgIcon", "drawBurgLabel", "removeBurgIcon", "removeBurgLabel", "drawRegiment", "drawRegiments", "drawMarker"].includes(m);
        target = isRenderer ? "renderers" : "utils";
      }

      if (!grouped[target]) {
        grouped[target] = new Set();
      }
      grouped[target].add(m);
    }

    for (const [targetDir, nameSet] of Object.entries(grouped)) {
      if (nameSet.size === 0) continue;

      const targetPath = getRelativeImportPath(relPath, targetDir);

      // Try to find an existing import from target
      const importRegex = new RegExp(`import\\s*\\{\\s*([^}]+)\\s*\\}\\s*from\\s*['"]${targetPath.replace(/\./g, '\\.')}['"]`, 'g');
      const match = importRegex.exec(content);

      if (match) {
        const existingImport = match[0];
        const importedNamesStr = match[1];
        const importedNames = importedNamesStr.split(',').map(n => n.trim()).filter(Boolean);
        
        for (const m of nameSet) {
          if (!importedNames.includes(m)) {
            importedNames.push(m);
          }
        }
        importedNames.sort();
        const newImport = `import { ${importedNames.join(', ')} } from "${targetPath}"`;
        content = content.replace(existingImport, newImport);
        console.log(`Updated existing import in ${relPath} (${targetDir}): ${newImport}`);
      } else {
        // Add new import
        const newImport = `import { ${Array.from(nameSet).sort().join(', ')} } from "${targetPath}";\n`;
        // Insert at the top (after comment block / first import)
        const lines = content.split('\n');
        let insertIndex = 0;
        for (let i = 0; i < Math.min(lines.length, 50); i++) {
          if (lines[i].startsWith("import ")) {
            insertIndex = i + 1;
          }
        }
        lines.splice(insertIndex, 0, newImport);
        content = lines.join('\n');
        console.log(`Added new import in ${relPath} (${targetDir}): ${newImport.trim()}`);
      }
    }

    fs.writeFileSync(absPath, content, 'utf8');
  }
}

run();
