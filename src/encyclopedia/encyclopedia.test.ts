import { afterEach, describe, expect, it } from "vitest";
import { encyclopediaStore } from "../store/encyclopediaState";
import type { EncyclopediaProvider } from "./encyclopediaTypes";
import { resolveText } from "./localizedText";
import { collectEntryLinks, parseInline, parseMarkdown } from "./markdown";
import { splitTitle } from "./providers/ruleProvider";
import {
  DEFAULT_ENCYCLOPEDIA_ENTRY_ID,
  getBacklinks,
  getEncyclopediaEntry,
  getOutgoingLinks,
  listEncyclopediaEntries,
  registerEncyclopediaProvider
} from "./registry";
import { buildSearchIndex, normalizeSearchText, searchEncyclopedia } from "./search";

describe("parseMarkdown", () => {
  it("parses headings, paragraphs with hard breaks, lists, tables, and rules", () => {
    const blocks = parseMarkdown(
      [
        "## Title",
        "",
        "line one  ",
        "line two",
        "next",
        "",
        "- a",
        "- b",
        "  continued",
        "",
        "1. x",
        "",
        "| A | B |",
        "| :--- | :--- |",
        "| 1 | 2 |",
        "",
        "---"
      ].join("\n")
    );
    expect(blocks.map(b => b.kind)).toEqual(["heading", "paragraph", "list", "list", "table", "rule"]);
    expect(blocks[0]).toMatchObject({ level: 2, children: [{ kind: "text", text: "Title" }] });
    expect(blocks[1]).toMatchObject({
      children: [{ kind: "text", text: "line one" }, { kind: "lineBreak" }, { kind: "text", text: "line two next" }]
    });
    expect(blocks[2]).toMatchObject({ ordered: false, items: [[{ text: "a" }], [{ text: "b continued" }]] });
    expect(blocks[3]).toMatchObject({ ordered: true });
    expect(blocks[4]).toMatchObject({
      header: [[{ text: "A" }], [{ text: "B" }]],
      rows: [[[{ text: "1" }], [{ text: "2" }]]]
    });
  });

  it("parses inline emphasis, code, entry links, and links", () => {
    const nodes = parseInline(
      "**bold** *em* `a_b` [[feature:x]] [[feature:y|Why]] [site](https://example.com) [doc](./doc.md) [repo](src/a.ts)",
      { "./doc.md": "rule:doc" }
    );
    expect(nodes.filter(n => n.kind !== "text")).toEqual([
      { kind: "strong", children: [{ kind: "text", text: "bold" }] },
      { kind: "em", children: [{ kind: "text", text: "em" }] },
      { kind: "code", text: "a_b" },
      { kind: "entryLink", entryId: "feature:x", children: [{ kind: "text", text: "feature:x" }] },
      { kind: "entryLink", entryId: "feature:y", children: [{ kind: "text", text: "Why" }] },
      { kind: "externalLink", href: "https://example.com", children: [{ kind: "text", text: "site" }] },
      { kind: "entryLink", entryId: "rule:doc", children: [{ kind: "text", text: "doc" }] }
    ]);
    // Unmapped relative links fall back to their text.
    expect(nodes[nodes.length - 1]).toEqual({ kind: "text", text: " repo" });
  });

  it("does not treat snake_case underscores as emphasis", () => {
    expect(parseInline("raw_material_cost and _em_")).toEqual([
      { kind: "text", text: "raw_material_cost and " },
      { kind: "em", children: [{ kind: "text", text: "em" }] }
    ]);
  });

  it("collects entry links from nested inline content", () => {
    const blocks = parseMarkdown("| A |\n| --- |\n| **see [[rule:a]]** |\n\n- [[feature:b]]");
    expect(collectEntryLinks(blocks).sort()).toEqual(["feature:b", "rule:a"]);
  });
});

describe("search", () => {
  it("normalizes width, case, and katakana", () => {
    expect(normalizeSearchText("ｺｽﾄ ＡＢ")).toBe("こすと ab");
  });

  it("finds Cost of Living in either language and ranks title matches first", () => {
    const index = buildSearchIndex(listEncyclopediaEntries());
    expect(searchEncyclopedia(index, "cost")[0].id).toBe("feature:cost-of-living");
    expect(searchEncyclopedia(index, "生活費")[0].id).toBe("feature:cost-of-living");
    expect(searchEncyclopedia(index, "silver").map(s => s.id)).toContain("feature:cost-of-living");
    expect(searchEncyclopedia(index, "cost zzzz")).toEqual([]);
    expect(searchEncyclopedia(index, "  ").length).toBe(listEncyclopediaEntries().length);
  });
});

describe("registry", () => {
  let unregister: (() => void) | undefined;
  afterEach(() => unregister?.());

  it("serves the built-in feature and rule entries", () => {
    const ids = listEncyclopediaEntries().map(s => s.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        DEFAULT_ENCYCLOPEDIA_ENTRY_ID,
        "feature:cost-of-living",
        "rule:multi-race-geopolitics",
        "rule:races-beauty-and-pairing"
      ])
    );
    expect(ids.indexOf("feature:cost-of-living")).toBeLessThan(ids.indexOf("rule:multi-race-geopolitics"));
    expect(getEncyclopediaEntry("feature:missing")).toBeNull();
    expect(getEncyclopediaEntry("no-namespace")).toBeNull();
  });

  it("shares Cost of Living text with the About tab's i18n strings", () => {
    const entry = getEncyclopediaEntry("feature:cost-of-living");
    expect(entry && resolveText(entry.title, "en")).toBe("Cost of Living");
    expect(entry && resolveText(entry.title, "ja")).toBe("生活費の目安");
  });

  it("strips the help-doc H1 into the title and keeps cross-doc links clickable", () => {
    const geopolitics = getEncyclopediaEntry("rule:multi-race-geopolitics");
    expect(geopolitics && resolveText(geopolitics.title, "en")).toMatch(/^Multi-race geopolitics/);
    expect(geopolitics && getOutgoingLinks(geopolitics)).toContain("rule:races-beauty-and-pairing");
    expect(getBacklinks("rule:races-beauty-and-pairing").map(s => s.id)).toContain("rule:multi-race-geopolitics");
    expect(splitTitle("# World help: foo\nbody")).toEqual({ title: "foo", body: "body" });
  });

  it("derives back-links from [[id]] links in the intro page", () => {
    expect(getBacklinks("feature:cost-of-living").map(s => s.id)).toContain(DEFAULT_ENCYCLOPEDIA_ENTRY_ID);
  });

  it("accepts providers registered at runtime", () => {
    const provider: EncyclopediaProvider = {
      namespace: "history",
      list: () => [{ id: "history:test", namespace: "history", title: { en: "Test battle" } }],
      get: key =>
        key === "test" ? { id: "history:test", namespace: "history", title: { en: "Test battle" }, body: [] } : null
    };
    unregister = registerEncyclopediaProvider(provider);
    expect(getEncyclopediaEntry("history:test")?.title).toEqual({ en: "Test battle" });
    unregister();
    unregister = undefined;
    expect(getEncyclopediaEntry("history:test")).toBeNull();
  });
});

describe("encyclopediaStore", () => {
  it("navigates with a back stack and ignores re-selecting the current entry", () => {
    const store = encyclopediaStore.getState();
    const start = store.selectedId;
    store.select("feature:cost-of-living");
    store.select("feature:cost-of-living");
    store.select("rule:multi-race-geopolitics");
    expect(encyclopediaStore.getState().history.slice(-2)).toEqual([start, "feature:cost-of-living"]);
    encyclopediaStore.getState().back();
    expect(encyclopediaStore.getState().selectedId).toBe("feature:cost-of-living");
    encyclopediaStore.getState().back();
    expect(encyclopediaStore.getState().selectedId).toBe(start);
  });
});
