/**
 * Minimal Markdown subset for Encyclopedia pages (docs/plan/world-codex.md §7.4).
 * Supports headings, paragraphs, bullet/numbered lists, pipe tables, horizontal rules, and inline
 * **bold**, *italic*, `code`, [text](url) and [[entry-id]] / [[entry-id|label]].
 * Produces a plain AST so rendering never goes through innerHTML.
 */

export type MarkdownInline =
  | { kind: "text"; text: string }
  | { kind: "strong"; children: MarkdownInline[] }
  | { kind: "em"; children: MarkdownInline[] }
  | { kind: "code"; text: string }
  | { kind: "lineBreak" }
  | { kind: "externalLink"; href: string; children: MarkdownInline[] }
  | { kind: "entryLink"; entryId: string; children: MarkdownInline[] };

export type MarkdownBlock =
  | { kind: "heading"; level: number; children: MarkdownInline[] }
  | { kind: "paragraph"; children: MarkdownInline[] }
  | { kind: "list"; ordered: boolean; items: MarkdownInline[][] }
  | { kind: "table"; header: MarkdownInline[][]; rows: MarkdownInline[][][] }
  | { kind: "rule" };

const LIST_ITEM = /^\s*(?:[-*+]|(\d+)[.)])\s+(.*)$/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map(cell => cell.trim());
}

export function parseMarkdown(source: string, linkMap: Readonly<Record<string, string>> = {}): MarkdownBlock[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  const inline = (text: string) => parseInline(text, linkMap);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, children: inline(heading[2]) });
      i++;
      continue;
    }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ kind: "rule" });
      i++;
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1])) {
      const header = splitTableRow(line).map(inline);
      const rows: MarkdownInline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(splitTableRow(lines[i]).map(inline));
        i++;
      }
      blocks.push({ kind: "table", header, rows });
      continue;
    }

    const listItem = LIST_ITEM.exec(line);
    if (listItem) {
      const ordered = listItem[1] !== undefined;
      const items: string[] = [];
      while (i < lines.length) {
        const item = LIST_ITEM.exec(lines[i]);
        if (item) {
          items.push(item[2]);
        } else if (lines[i].trim() && /^\s+/.test(lines[i]) && items.length) {
          // Indented continuation line of the previous item.
          items[items.length - 1] += ` ${lines[i].trim()}`;
        } else {
          break;
        }
        i++;
      }
      blocks.push({ kind: "list", ordered, items: items.map(inline) });
      continue;
    }

    // Paragraph: consume until a blank line or the start of another block.
    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !HEADING.test(lines[i]) &&
      !LIST_ITEM.test(lines[i]) &&
      !(lines[i].includes("|") && i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1]))
    ) {
      paragraph.push(lines[i]);
      i++;
    }
    const children: MarkdownInline[] = [];
    paragraph.forEach((text, index) => {
      // Two trailing spaces = hard line break (CommonMark); otherwise lines join with a space.
      const hardBreak = / {2,}$/.test(text);
      children.push(...inline(text.trim()));
      if (index < paragraph.length - 1) children.push(hardBreak ? { kind: "lineBreak" } : { kind: "text", text: " " });
    });
    blocks.push({ kind: "paragraph", children: mergeText(children) });
  }

  return blocks;
}

// Underscore emphasis is never intraword (CommonMark), so snake_case identifiers stay plain text.
const INLINE_TOKEN =
  /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`|\*\*(.+?)\*\*|(?<![\p{L}\p{N}])__(.+?)__(?![\p{L}\p{N}])|\*([^*\s][^*]*?)\*|(?<![\p{L}\p{N}])_([^_\s][^_]*?)_(?![\p{L}\p{N}])/gu;

export function parseInline(text: string, linkMap: Readonly<Record<string, string>> = {}): MarkdownInline[] {
  const result: MarkdownInline[] = [];
  let last = 0;
  // A fresh RegExp per call: parseInline recurses, and a shared /g regex would share lastIndex.
  const tokens = new RegExp(INLINE_TOKEN);
  for (let match = tokens.exec(text); match; match = tokens.exec(text)) {
    if (match.index > last) result.push({ kind: "text", text: text.slice(last, match.index) });
    const [, entryId, entryLabel, linkText, href, code, strongA, strongB, emA, emB] = match;
    if (entryId !== undefined) {
      result.push({
        kind: "entryLink",
        entryId: entryId.trim(),
        children: [{ kind: "text", text: entryLabel ?? entryId }]
      });
    } else if (linkText !== undefined) {
      const children = parseInline(linkText, linkMap);
      const mapped = linkMap[href];
      if (mapped) result.push({ kind: "entryLink", entryId: mapped, children });
      else if (/^https?:\/\//.test(href)) result.push({ kind: "externalLink", href, children });
      else result.push(...children); // Repository-relative links have nowhere to go inside the app.
    } else if (code !== undefined) {
      result.push({ kind: "code", text: code });
    } else if (strongA !== undefined || strongB !== undefined) {
      result.push({ kind: "strong", children: parseInline(strongA ?? strongB, linkMap) });
    } else {
      result.push({ kind: "em", children: parseInline(emA ?? emB, linkMap) });
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) result.push({ kind: "text", text: text.slice(last) });
  return mergeText(result);
}

function mergeText(nodes: MarkdownInline[]): MarkdownInline[] {
  const merged: MarkdownInline[] = [];
  for (const node of nodes) {
    const previous = merged[merged.length - 1];
    if (node.kind === "text" && previous?.kind === "text") previous.text += node.text;
    else merged.push(node.kind === "text" ? { ...node } : node);
  }
  return merged;
}

/** Entry ids referenced by a Markdown source, for back-link discovery. */
export function collectEntryLinks(blocks: readonly MarkdownBlock[]): string[] {
  const ids = new Set<string>();
  const walk = (nodes: readonly MarkdownInline[]) => {
    for (const node of nodes) {
      if (node.kind === "entryLink") ids.add(node.entryId);
      if ("children" in node) walk(node.children);
    }
  };
  for (const block of blocks) {
    if (block.kind === "heading" || block.kind === "paragraph") walk(block.children);
    else if (block.kind === "list") block.items.forEach(walk);
    else if (block.kind === "table") [...block.header, ...block.rows.flat()].forEach(walk);
  }
  return [...ids];
}
