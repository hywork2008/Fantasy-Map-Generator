// Run from repository root: node scripts/city-editor/phase0/inventory.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';
const root = 'src/city-editor';
const walk = dir => fs.readdirSync(dir, {withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]);
const files = walk(root).filter(f => /\.tsx?$/.test(f));
const resolve = (from, spec) => {
  if (!spec.startsWith('.')) return null;
  const base = path.normalize(path.join(path.dirname(from), spec));
  return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find(f => fs.existsSync(f) && fs.statSync(f).isFile()) ?? null;
};
const modules = files.map(file => {
  const source = fs.readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const imports = [], exports = [], functions = [];
  const visit = node => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text;
      const clause=node.importClause;
      const allNamedTypes=clause && !clause.name && clause.namedBindings && ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.length>0 && clause.namedBindings.elements.every(e=>e.isTypeOnly);
      imports.push({specifier:spec, target:resolve(file,spec), typeOnly:Boolean(node.isTypeOnly || clause?.isTypeOnly || allNamedTypes), line:ast.getLineAndCharacterOfPosition(node.getStart()).line+1});
    }
    if(ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {const spec=node.argument.literal.text;imports.push({specifier:spec,target:resolve(file,spec),typeOnly:true,line:ast.getLineAndCharacterOfPosition(node.getStart()).line+1});}
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(node.arguments[0])) {
      const spec = node.arguments[0].text;
      imports.push({specifier:spec,target:resolve(file,spec),dynamic:true,line:ast.getLineAndCharacterOfPosition(node.getStart()).line+1});
    }
    if (node.parent === ast && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) exports.push(node.name?.text ?? node.getText(ast).split('\n')[0]);
    if (ts.isFunctionDeclaration(node) && node.name) functions.push({name:node.name.text,line:ast.getLineAndCharacterOfPosition(node.getStart()).line+1,lines:node.getText(ast).split('\n').length});
    ts.forEachChild(node,visit);
  };
  visit(ast);
  return {file, lines:source.split('\n').length-1, sha256:crypto.createHash('sha256').update(source).digest('hex'), test:file.endsWith('.test.ts'), exports, functions, imports};
});
const runtime = modules.filter(m => !m.test && !m.file.endsWith('generateTestScenarios.ts'));
const graph = new Map(runtime.map(m=>[m.file,m.imports.filter(i=>!i.typeOnly).map(i=>i.target).filter(t=>runtime.some(r=>r.file===t))]));
let index=0; const indices=new Map(), low=new Map(), stack=[], active=new Set(), cycles=[];
function visit(v) {
  indices.set(v,index);low.set(v,index++);stack.push(v);active.add(v);
  for(const w of graph.get(v)??[]) { if(!indices.has(w)){visit(w);low.set(v,Math.min(low.get(v),low.get(w)));} else if(active.has(w)) low.set(v,Math.min(low.get(v),indices.get(w))); }
  if(low.get(v)===indices.get(v)){const component=[];let w;do{w=stack.pop();active.delete(w);component.push(w);}while(w!==v);if(component.length>1)cycles.push(component.sort());}
}
for(const v of graph.keys())if(!indices.has(v))visit(v);
const reverseEdges = runtime.flatMap(m=>m.imports.filter(i=>i.target?.startsWith(root) && m.file.startsWith(`${root}/core/`) && /\/(ui|render|io)\//.test(i.target)).map(i=>({from:m.file,...i})));
const output={scope:'CE TypeScript static/dynamic literal imports, reexports and import types; runtime cycles exclude type-only edges and tests. External paths not traversed; computed imports and Worker URLs are not edges.',modules,cycles,reverseEdges};
const dir=`${process.env.CE_PHASE0_OUTPUT??'artifacts/city-editor/phase0-current'}/inventory`;
fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(`${dir}/inventory.json`,JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({modules:modules.length,runtime:runtime.length,cycles,reverseEdges},null,2));
