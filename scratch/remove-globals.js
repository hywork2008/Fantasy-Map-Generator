const fs = require('fs');
const path = require('path');

const files = [
  'src/modules/lakes.ts',
  'src/modules/river-generator.ts',
  'src/modules/burgs-generator.ts',
  'src/modules/cultures-generator.ts',
  'src/modules/states-generator.ts',
  'src/modules/zones-generator.ts',
  'src/modules/religions-generator.ts',
  'src/modules/provinces-generator.ts',
  'src/modules/ice.ts',
  'src/modules/military-generator.ts',
  'src/modules/markers-generator.ts',
  'src/modules/biomes.ts',
  'src/modules/features.ts',
  'src/modules/routes-generator.ts'
];

for (const relPath of files) {
  const absPath = path.resolve(__dirname, '..', relPath);
  if (!fs.existsSync(absPath)) {
    console.log(`Skipping non-existent file: ${relPath}`);
    continue;
  }
  let content = fs.readFileSync(absPath, 'utf8');

  // Match:
  // declare global {
  //   var Lakes: LakesModule;
  // }
  // or variations of it
  const regex = /declare\s+global\s*\{\s*var\s+\w+:\s*[^;\}]+;\s*\}/g;
  if (regex.test(content)) {
    content = content.replace(regex, '');
    fs.writeFileSync(absPath, content, 'utf8');
    console.log(`Removed declare global from: ${relPath}`);
  } else {
    console.log(`No declare global block found in: ${relPath}`);
  }
}
