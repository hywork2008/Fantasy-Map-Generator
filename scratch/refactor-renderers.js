const fs = require('fs');
const path = require('path');

const renderersDir = '/Users/h-yamaguchi/Projects/Fantasy-Map-Generator/src/renderers';

const files = fs.readdirSync(renderersDir);
for (const file of files) {
  if (file.startsWith('draw-') && file.endsWith('.ts')) {
    const filePath = path.join(renderersDir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // 1. Remove declare global block (which starts with declare global and ends with a matching close brace)
    // Since declare global blocks in these files are simple, we can use a regex:
    content = content.replace(/declare global\s*\{[\s\S]*?\n\}/g, '');

    // 2. Identify the assignments to window at the bottom of the file
    // We will find all lines starting with "window." and parse them
    const lines = content.split('\n');
    const newLines = [];
    const exports = {};

    for (let line of lines) {
      if (line.trim().startsWith('window.')) {
        // e.g. window.drawIce = iceRenderer;
        // e.g. window.getFeaturePath = (feature: PackedGraphFeature) => ...
        const match = line.match(/window\.([a-zA-Z0-9_]+)\s*=\s*(.*);/);
        if (match) {
          const globalName = match[1];
          const expression = match[2].trim();
          
          if (/^[a-zA-Z0-9_]+$/.test(expression)) {
            // It's a simple variable reference like "iceRenderer" or "getPinForShape"
            exports[expression] = globalName;
          } else {
            // It's an inline function/expression like in draw-features.ts
            // We'll write it as an exported function
            newLines.push(`export const ${globalName} = ${expression};`);
          }
        }
      } else {
        newLines.push(line);
      }
    }

    content = newLines.join('\n');

    // 3. For any local variables in `exports`, replace their declaration with "export const globalName = ..."
    // E.g. replace "const iceRenderer = (" with "export const drawIce = ("
    // E.g. replace "const getPinForShape = (" with "export const getPin = ("
    // E.g. replace "function markerRenderer(" with "export function drawMarker("
    // We also support cases like "const drawRegimentRenderer = (" -> "export const drawRegiment = ("
    for (const [localName, globalName] of Object.entries(exports)) {
      // Look for const localName =
      const constRegex = new RegExp(`(const|let)\\s+${localName}\\s*=`, 'g');
      if (constRegex.test(content)) {
        content = content.replace(constRegex, `export const ${globalName} =`);
      } else {
        // Look for function localName(
        const funcRegex = new RegExp(`function\\s+${localName}\\b`, 'g');
        if (funcRegex.test(content)) {
          content = content.replace(funcRegex, `export function ${globalName}`);
        } else {
          // If we couldn't find a direct declaration, just append an export statement
          content += `\nexport const ${globalName} = ${localName};`;
        }
      }
    }

    // Clean up double empty lines or trailing spaces
    content = content.replace(/\n{3,}/g, '\n\n');

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Refactored ${file}`);
  }
}
