const fs = require('fs');
const path = require('path');

const files = [
  'packages/@fmg/burgs/src/editor.ts',
  'packages/@fmg/burgs/src/generator.ts',
  'packages/@fmg/burgs/src/group-editor.ts',
  'packages/@fmg/burgs/src/overview.ts',
  'packages/@fmg/core/src/modules/initialize-fmg.ts',
  'packages/@fmg/core/src/modules/routes-generator.ts',
  'packages/@fmg/legacy-ui/src/modules/ui/generation-deps.ts',
  'packages/@fmg/types/src/PackedGraph.ts',
  'src/controllers/elevation-profile.ts',
  'src/renderers/draw-burg-icons.ts',
  'src/renderers/draw-burg-labels.ts',
  'src/renderers/draw-emblems.ts',
  'src/types/PackedGraph.ts',
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');

  // Fix core paths in others
  content = content.replace(/@fmg\/core\/modules\/burgs-generator/g, '@fmg/burgs');
  content = content.replace(/#modules\/burgs-generator/g, '@fmg/burgs');
  content = content.replace(/\.\/burgs-generator/g, '@fmg/burgs');
  
  if (file.includes('burgs/src')) {
    // Fix broken relative imports in burgs that came from legacy-ui/src/modules/ui
    content = content.replace(/from "\.\/editors"/g, 'from "@legacy-ui-runtime/modules/ui/editors"');
    content = content.replace(/from "\.\/general"/g, 'from "@legacy-ui-runtime/modules/ui/general"');
    content = content.replace(/from "\.\/layers"/g, 'from "@legacy-ui-runtime/modules/ui/layers"');
    content = content.replace(/from "\.\/notes-editor"/g, 'from "@legacy-ui-runtime/modules/ui/notes-editor"');
    content = content.replace(/from "\.\/style"/g, 'from "@legacy-ui-runtime/modules/ui/style"');
    content = content.replace(/from "\.\/burg-group-editor"/g, 'from "./group-editor"');
    content = content.replace(/from "\.\.\/runtime\/fmg-api"/g, 'from "@legacy-ui-runtime/modules/runtime/fmg-api"');
    
    // Fix broken relative imports in burgs that came from core/src/modules
    content = content.replace(/from "\.\/emblem\/generator"/g, 'from "@fmg/core/modules/emblem/generator"');
    content = content.replace(/from "\.\/emblem\/renderer"/g, 'from "@fmg/core/modules/emblem/renderer"');
    content = content.replace(/from "\.\/names-generator"/g, 'from "@fmg/core/modules/names-generator"');
    content = content.replace(/from "\.\/routes-generator"/g, 'from "@fmg/core/modules/routes-generator"');
  }

  fs.writeFileSync(file, content);
}
