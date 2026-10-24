import { afterEach, describe, expect, it } from "vitest";
import { editorText } from "../../i18n/editorMessages";
import i18n from "../../i18n/index";
import { defaultGenerationSettings } from "../generators/generation/settings";
import { EditorLifetime } from "../services/editorLifetime";
import { mountOperationHelp, OPERATION_HELP_ENTRIES } from "./operationHelp";

afterEach(() => document.body.replaceChildren());

describe("City Editor operation help", () => {
  it.each(["en", "ja"])("shows the selected topic and preserves all migrated explanations in %s", async language => {
    await i18n.changeLanguage(language);
    const root = document.createElement("div");
    document.body.append(root);
    const scope = new EditorLifetime(root);
    mountOperationHelp(root, scope, defaultGenerationSettings);
    const panel = root.querySelector<HTMLElement>(".ce-help")!;
    const launcher = root.querySelector<HTMLButtonElement>(".ce-help-launcher")!;
    expect(panel.hidden).toBe(true);
    launcher.click();
    expect(panel.hidden).toBe(false);
    for (const entry of OPERATION_HELP_ENTRIES) {
      const button = root.querySelector<HTMLButtonElement>(`[data-help-topic="${entry.id}"]`)!;
      button.click();
      expect(root.querySelector(".ce-help-article h2")?.textContent).toBe(editorText(entry.title));
      for (const key of entry.content) {
        expect(root.querySelector(".ce-help-article")?.textContent).toContain(editorText(key));
        expect(editorText(key)).not.toBe(key);
      }
      expect(root.querySelectorAll('[aria-current="true"]')).toHaveLength(1);
    }
    panel.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(panel.hidden).toBe(true);
    expect(document.activeElement).toBe(launcher);
    scope.dispose();
  });
});
