import path from "node:path";
import ts from "typescript";

/** Type-only public contracts are allowed; runtime catalog imports must respect ownership. */
export function raceBoundaryViolations(filename: string, source: string): string[] {
  const file = filename.replaceAll("\\", "/");
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(file)) return [];
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const violations: string[] = [];
  const hostRaceModule = /^src\/(?:data\/(?:race[^/]*|hybridRaceTraits)|services\/raceService)(?:\.[jt]s(?:on)?)?$/;
  const ownedData = /^src\/extensions\/(characters|economy)\/data\/(?:race[^/]*)(?:\.[jt]s(?:on)?)?$/;
  const owner = file.match(/^src\/extensions\/([^/]+)\//)?.[1];
  function check(specifier: string, node: ts.Node) {
    if (!specifier.startsWith(".")) return;
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
    const targetOwner = target.match(ownedData)?.[1];
    const runtime = file.startsWith("src/");
    const extension = file.startsWith("src/extensions/");
    if ((extension && hostRaceModule.test(target)) ||
        (runtime && target.startsWith("scripts/")) ||
        (runtime && targetOwner && owner !== targetOwner) ||
        (file.startsWith("src/data/") && target.startsWith("src/extensions/"))) {
      const line = tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
      violations.push(`${file}:${line}: race data ownership violation: ${specifier}`);
    }
  }
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      const typesOnly = clause?.isTypeOnly || (!clause?.name && bindings && ts.isNamedImports(bindings) &&
        bindings.elements.length > 0 && bindings.elements.every(e => e.isTypeOnly));
      if (!typesOnly) check(node.moduleSpecifier.text, node);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const typesOnly = node.isTypeOnly || (node.exportClause && ts.isNamedExports(node.exportClause) &&
        node.exportClause.elements.length > 0 && node.exportClause.elements.every(e => e.isTypeOnly));
      if (!typesOnly) check(node.moduleSpecifier.text, node);
    } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
      if (node.arguments[0] && ts.isStringLiteral(node.arguments[0])) check(node.arguments[0].text, node);
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return violations;
}
