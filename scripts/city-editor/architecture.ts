import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const CE = "src/city-editor/";
const layers = ["components", "controllers", "services", "renderers", "generators", "state", "types", "data", "utils"];
const lower = ["types", "data", "utils"];
const allowed: Record<string, readonly string[]> = {
  components: layers,
  controllers: layers,
  services: ["services", "renderers", "generators", "state", ...lower],
  renderers: ["renderers", "generators", "state", ...lower],
  generators: ["generators", "state", ...lower],
  state: ["state", ...lower],
  types: lower,
  data: lower,
  utils: lower
};
const legacy = /(?:^|\/)city-editor\/(?:core|ui|render|io)\//;
const dataAsset = `${CE}assets/catalog.ts`;
const documentCompatibility = `${CE}core/document.ts`;
const testFile = /\.test\.tsx?$/;
const browserGlobals = new Set([
  "window", "localStorage", "sessionStorage", "navigator", "Worker", "MutationObserver", "ResizeObserver",
  "requestAnimationFrame", "cancelAnimationFrame"
]);
const domMethods = new Set(["createElement", "createElementNS", "querySelector", "querySelectorAll", "getElementById", "body"]);

interface Edge { target: string; typeOnly: boolean; line: number; }

/** Check literal static/dynamic imports, reexports, import types and Worker URLs.
 * Type-only edges obey layer rules. Only executable edges participate in cycle
 * detection: recursive document/recipe interfaces are legal TypeScript data contracts.
 */
export function cityEditorArchitectureViolations(sources: ReadonlyMap<string, string>): string[] {
  const violations: string[] = [];
  const graph = new Map<string, Edge[]>();
  const resolve = (from: string, specifier: string) => {
    const base = specifier.startsWith(".") ? path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier)) : specifier;
    return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find(file => sources.has(file)) ?? base;
  };
  for (const [file, source] of sources) {
    const inCe = file.startsWith(CE);
    const runtime = inCe && !testFile.test(file);
    const layer = file === dataAsset ? "data" : inCe ? file.slice(CE.length).split("/")[0] : "";
    if (runtime && !allowed[layer] && ![`${CE}main.ts`, documentCompatibility].includes(file)) {
      violations.push(`${file}: module must be placed in a CE role directory`);
    }
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    if (file === documentCompatibility && ast.statements.some(node =>
      !ts.isExportDeclaration(node) || !node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier) ||
      !["../generators/document", "../services/io/documentCodec"].includes(node.moduleSpecifier.text)
    )) violations.push(`${file}: compatibility facade may only reexport document creation and the native codec`);
    const edges: Edge[] = [];
    const at = (node: ts.Node) => ast.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    const edge = (node: ts.Node, specifier: string, typeOnly: boolean) => {
      const target = resolve(file, specifier);
      if (legacy.test(target) || legacy.test(specifier)) violations.push(`${file}:${at(node)}: retired CE path ${specifier}`);
      if (inCe && /(?:^|\/)city-generator(?:\/|$)/.test(target)) violations.push(`${file}:${at(node)}: CE must not import the retired City Generator`);
      if (!runtime || !target.startsWith(CE)) return;
      const targetLayer = target === dataAsset || (target.startsWith(`${CE}assets/`) && /\.(json|svg)$/.test(target)) ? "data" : target.slice(CE.length).split("/")[0];
      if (allowed[layer] && !allowed[layer].includes(targetLayer)) {
        violations.push(`${file}:${at(node)}: ${layer} must not depend on ${targetLayer}${typeOnly ? " (type)" : ""}`);
      }
      if (specifier.startsWith(".") && /(?:\.tsx?$|\/[\w-]+$)/.test(target) && !sources.has(target)) {
        violations.push(`${file}:${at(node)}: unresolved CE module ${specifier}`);
      }
      edges.push({ target, typeOnly, line: at(node) });
    };
    const visit = (node: ts.Node) => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const clause = ts.isImportDeclaration(node) ? node.importClause : undefined;
        const named = clause?.namedBindings;
        const namedTypes = named && ts.isNamedImports(named) && named.elements.length > 0 && named.elements.every(e => e.isTypeOnly);
        const exportedTypes = ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause) && node.exportClause.elements.length > 0 && node.exportClause.elements.every(e => e.isTypeOnly);
        edge(node, node.moduleSpecifier.text, Boolean(clause?.isTypeOnly || namedTypes || exportedTypes || (ts.isExportDeclaration(node) && node.isTypeOnly)));
      } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
        edge(node, node.argument.literal.text, true);
      } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        edge(node, node.arguments[0].text, false);
      } else if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "URL" && node.arguments?.[0] && ts.isStringLiteral(node.arguments[0]) && node.arguments[1]?.getText(ast) === "import.meta.url") {
        edge(node, node.arguments[0].text, false);
      }
      if (runtime && ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        (!node.arguments[0] || !ts.isStringLiteral(node.arguments[0]))) {
        violations.push(`${file}:${at(node)}: CE imports must use statically inspectable module paths`);
      }
      if (runtime && ["generators", "state", ...lower].includes(layer)) {
        if (ts.isTypeReferenceNode(node) && /^(?:(?:HTML|SVG)\w*Element|Document|Window|Node|EventTarget|MouseEvent|PointerEvent|KeyboardEvent)$/.test(node.typeName.getText(ast))) {
          violations.push(`${file}:${at(node)}: ${layer} must not depend on DOM type ${node.typeName.getText(ast)}`);
        }
        if (ts.isIdentifier(node) && browserGlobals.has(node.text) && !ts.isPropertyAccessExpression(node.parent) && !ts.isPropertyAssignment(node.parent)) {
          violations.push(`${file}:${at(node)}: ${layer} must not use browser global ${node.text}`);
        }
        if (ts.isPropertyAccessExpression(node)) {
          const object = node.expression.getText(ast);
          if (browserGlobals.has(object) || (object === "document" && domMethods.has(node.name.text)) || (object === "globalThis" && (browserGlobals.has(node.name.text) || node.name.text === "document"))) {
            violations.push(`${file}:${at(node)}: ${layer} must not access browser/DOM ${node.getText(ast)}`);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
    if (runtime) graph.set(file, edges.filter(e => !e.typeOnly && !testFile.test(e.target)));
  }
  // Tarjan components: report every executable cycle once, including self-imports.
  let next = 0;
  const indices = new Map<string, number>(), lows = new Map<string, number>();
  const stack: string[] = [], active = new Set<string>();
  const visit = (file: string) => {
    indices.set(file, next); lows.set(file, next++); stack.push(file); active.add(file);
    for (const { target } of graph.get(file) ?? []) {
      if (!graph.has(target)) continue;
      if (!indices.has(target)) { visit(target); lows.set(file, Math.min(lows.get(file)!, lows.get(target)!)); }
      else if (active.has(target)) lows.set(file, Math.min(lows.get(file)!, indices.get(target)!));
    }
    if (lows.get(file) !== indices.get(file)) return;
    const component: string[] = [];
    let member: string;
    do { member = stack.pop()!; active.delete(member); component.push(member); } while (member !== file);
    if (component.length > 1 || graph.get(file)?.some(e => e.target === file)) violations.push(`CE runtime import cycle: ${component.sort().join(" → ")}`);
  };
  for (const file of graph.keys()) if (!indices.has(file)) visit(file);
  return [...new Set(violations)];
}

export function checkCityEditorArchitecture(root: string): string[] {
  const sources = new Map<string, string>();
  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      // The retired generator is outside this migration's scope.
      if (entry.isDirectory() && entry.name !== "city-generator") walk(file);
      else if (/\.(?:tsx?|mjs|js)$/.test(entry.name)) sources.set(path.relative(root, file).split(path.sep).join("/"), fs.readFileSync(file, "utf8"));
    }
  };
  walk(path.join(root, "src"));
  walk(path.join(root, "scripts"));
  return cityEditorArchitectureViolations(sources);
}
