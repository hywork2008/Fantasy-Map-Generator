import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";
import { REALM_RELATION_LABELS } from "../city-editor/core/gen/approachBeyond";
import { GENERATION_STAGES } from "../city-editor/core/generate";
import { mountCityEditor } from "../city-editor/ui/CityEditorPage";
import { createEmptyRegionDocument } from "../region-editor/core/document";
import { DEFAULT_REGION_SETTINGS } from "../region-editor/core/types";
import { mountRegionEditor } from "../region-editor/ui/RegionEditorPage";
import { type EditorMessageKey, editorHtml, editorOptionText, editorText } from "./editorMessages";
import i18n from "./index";
import en from "./locales/editors.en.json";
import ja from "./locales/editors.ja.json";

// jsdom does not implement scrolling; the CE history panel scrolls to its current entry.
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

function flatten(value: object, prefix = ""): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) => {
      const name = `${prefix}${key}`;
      return typeof child === "string" ? [[name, child]] : Object.entries(flatten(child, `${name}.`));
    })
  );
}

afterEach(async () => {
  await i18n.changeLanguage("en");
  document.body.replaceChildren();
});

describe("editor translation keys", () => {
  it("has complete matching English and Japanese catalogs with matching interpolation parameters", () => {
    const english = flatten(en);
    const japanese = flatten(ja);
    expect(Object.keys(english).sort()).toEqual(Object.keys(japanese).sort());
    for (const [key, value] of Object.entries(english)) {
      expect(value.trim(), key).not.toBe("");
      expect(japanese[key].trim(), key).not.toBe("");
      const parameters = (text: string) => [...text.matchAll(/{{([^}]+)}}/g)].map(match => match[1]).sort();
      expect(parameters(japanese[key]), key).toEqual(parameters(value));
      expect(key, key).not.toMatch(/undefined|Variant\d|[ぁ-んァ-ン一-龯]/);
      expect(value, key).not.toMatch(/[ぁ-んァ-ン一-龯]/);
    }
  });

  it("identifies all seventeen generation stages by meaningful keys across both languages", async () => {
    expect(GENERATION_STAGES.map(stage => stage.step)).toEqual(Array.from({ length: 17 }, (_, i) => i + 1));
    for (const language of ["en", "ja"] as const) {
      await i18n.changeLanguage(language);
      for (const stage of GENERATION_STAGES) {
        expect(stage.labelKey).toBe(`cityEditor.generationStages.${stage.id}.label`);
        expect(stage.hintKey).toBe(`cityEditor.generationStages.${stage.id}.hint`);
        expect(stage.label).toBe(editorText(stage.labelKey));
        expect(stage.hint).toBe(editorText(stage.hintKey));
      }
      expect(GENERATION_STAGES[14].label).toBe(language === "en" ? "Blocks and lanes" : "街区・小道");
    }
  });

  it("resolves domain labels after locale selection without changing option IDs", async () => {
    await i18n.changeLanguage("ja");
    expect(REALM_RELATION_LABELS.domestic).toBe("自国");
    expect(editorOptionText("river")).toBe("河川");
    expect(editorOptionText("temperateDeciduousForest", "regionEditor")).toBe("温帯落葉樹林");
    expect(editorOptionText("custom-object-id")).toBe("custom-object-id");
    await i18n.changeLanguage("en");
    expect(REALM_RELATION_LABELS.domestic).toBe("Home realm");
    expect(editorOptionText("river")).toBe("River");
  });

  it("escapes translated HTML and interpolated user data exactly once", async () => {
    await i18n.changeLanguage("en");
    expect(editorHtml("regionEditor.messages.loadError", { value0: '<img src=x onerror="alert(1)"> & town' })).toBe(
      "Load error: &lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; town"
    );
    expect(editorHtml("regionEditor.messages.dAmpDSwordCoastMikeSchley")).toBe("D&amp;D Sword Coast (Mike Schley)");
  });

  it.each(["en", "ja"] as const)(
    "mounts Region Editor with translated controls and unchanged values (%s)",
    async language => {
      await i18n.changeLanguage(language);
      const root = document.createElement("div");
      document.body.append(root);
      const doc = createEmptyRegionDocument({ ...DEFAULT_REGION_SETTINGS, title: 'Town <&> "name"' });
      const editor = mountRegionEditor(root, doc);
      expect(root.querySelector("#btn-undo")?.textContent).toBe(language === "en" ? "↩ Undo" : "↩ 元に戻す");
      expect(root.querySelector<HTMLInputElement>("#input-title")?.value).toBe(doc.title);
      const option = root.querySelector<HTMLOptionElement>(
        '[data-vs-cell="0"] option[value="temperateDeciduousForest"]'
      );
      expect(option?.textContent).toBe(language === "en" ? "Temperate deciduous forest" : "温帯落葉樹林");
      expect(editor.getDocument().title).toBe(doc.title);
      expect(root.innerHTML).not.toContain("${editorHtml");
      editor.dispose();
    }
  );

  it.each(["en", "ja"] as const)("mounts City Editor with keyed generation controls (%s)", async language => {
    await i18n.changeLanguage(language);
    const root = document.createElement("div");
    document.body.append(root);
    mountCityEditor(root);
    expect(root.querySelector('[data-i18n-key="cityEditor.fmgParameters.title"]')?.textContent).toBe(
      language === "en" ? "Parameters received from FMG" : "FMGから受け取ったパラメーター"
    );
    const buttons = [...root.querySelectorAll("button")];
    expect(buttons.some(button => button.textContent === editorText("cityEditor.messages.generateCompleteCity"))).toBe(
      true
    );
    expect(root.querySelector(`button[title="${editorText("cityEditor.messages.selectAndMove")}"]`)).not.toBeNull();
    expect(
      root.querySelector(`input[aria-label="${editorText("cityEditor.messages.debugShowGenerationFailurePreview")}"]`)
    ).not.toBeNull();
    expect(root.querySelector(".ce-generate")?.textContent).toContain(editorText("cityEditor.generationStages.title"));
    const coastOptions = [...root.querySelectorAll<HTMLOptionElement>('option[value="bay"]')];
    expect(coastOptions.some(option => option.textContent === editorOptionText("bay"))).toBe(true);
  });

  it("keeps Japanese UI strings out of editor source code", () => {
    for (const relative of [
      "../city-editor/ui/CityEditorPage.ts",
      "../city-editor/ui/generationLogPanel.ts",
      "../region-editor/ui/RegionEditorPage.ts"
    ]) {
      const file = fileURLToPath(new URL(relative, import.meta.url));
      const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node) => {
        if (
          ts.isStringLiteral(node) ||
          ts.isNoSubstitutionTemplateLiteral(node) ||
          ts.isTemplateHead(node) ||
          ts.isTemplateMiddle(node) ||
          ts.isTemplateTail(node)
        ) {
          expect(node.text.replace(/<!--[\s\S]*?-->/g, ""), `${relative}: ${node.getStart(source)}`).not.toMatch(
            /[ぁ-んァ-ン一-龯]/
          );
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  });

  it("registers each keyed message in the shared i18next resources", async () => {
    for (const language of ["en", "ja"] as const) {
      await i18n.changeLanguage(language);
      for (const [key, value] of Object.entries(flatten(language === "en" ? en : ja))) {
        expect(i18n.exists(key), key).toBe(true);
        if (!value.includes("{{")) expect(editorText(key as EditorMessageKey), key).toBe(value);
      }
    }
  });
});
