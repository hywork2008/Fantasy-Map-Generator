#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const TARGET_ROOT = join(ROOT, "packages", "@fmg");
const IGNORE_SEGMENTS = new Set(["node_modules", "dist", "playwright-report", "test-results"]);
const SOURCE_EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);

const checks = [
  {
    name: "root-window-instance-assignment",
    regex: /window\.[A-Z][A-Za-z0-9_]*\s*=\s*new\s+[A-Za-z0-9_]+/g,
    description: "window.<Name> = new <Class>()"
  },
  {
    name: "root-window-iife-assignment",
    regex: /window\.[A-Z][A-Za-z0-9_]*\s*=\s*\(function\s*\(/g,
    description: "window.<Name> = (function () { ... })()"
  },
  {
    name: "fmg-instance-assignment",
    regex: /fmg\.[A-Za-z0-9_]+\s*=\s*new\s+[A-Za-z0-9_]+/g,
    description: "fmg.<name> = new <Class>()"
  },
  {
    name: "fmg-class-assignment",
    regex: /fmg\.[A-Za-z0-9_]+\s*=\s*[A-Z][A-Za-z0-9_]+\s*;/g,
    description: "fmg.<name> = <Class>;"
  }
];

function listFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_SEGMENTS.has(entry.name)) continue;
      files.push(...listFiles(abs));
      continue;
    }

    const ext = entry.name.slice(entry.name.lastIndexOf("."));
    if (!SOURCE_EXT.has(ext)) continue;
    files.push(abs);
  }

  return files;
}

function scanFile(filePath) {
  const content = readFileSync(filePath, "utf8");
  const findings = [];
  const relPath = relative(ROOT, filePath).replaceAll("\\", "/");

  for (const check of checks) {
    const regex = new RegExp(check.regex.source, check.regex.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      const upToMatch = content.slice(0, match.index);
      const line = upToMatch.split("\n").length;
      findings.push({
        check: check.name,
        description: check.description,
        path: relPath,
        line,
        snippet: match[0]
      });
    }
  }

  return findings;
}

function main() {
  if (!statSync(TARGET_ROOT).isDirectory()) {
    console.error("Target directory not found:", TARGET_ROOT);
    process.exit(2);
  }

  const files = listFiles(TARGET_ROOT);
  const findings = files.flatMap(scanFile);

  if (!findings.length) {
    console.log("[audit-global-exposure] OK: no prohibited global assignments found");
    process.exit(0);
  }

  console.log("[audit-global-exposure] FAIL: found prohibited global assignments");
  for (const finding of findings) {
    console.log(`- ${finding.path}:${finding.line} [${finding.check}] ${finding.snippet}`);
  }

  process.exit(1);
}

main();
