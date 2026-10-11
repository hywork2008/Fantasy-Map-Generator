import type { TOptions } from "i18next";
import i18n from "./index";
import messages from "./locales/editors.en.json";

type LeafKeys<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${LeafKeys<T[K]>}`;
}[keyof T & string];

/** Stable, semantic keys: never use a stage number or the displayed translation as an identifier. */
type PluralKey<K extends string> = K extends `${infer Base}_one` | `${infer Base}_other` ? Base : K;
export type EditorMessageKey = LeafKeys<typeof messages> | PluralKey<LeafKeys<typeof messages>>;

export function editorText(key: EditorMessageKey, values?: TOptions): string {
  return i18n.t(key, values ?? {});
}

/** Escape translated HTML text and attributes, including interpolated user data. */
export function editorHtml(key: EditorMessageKey, values?: TOptions): string {
  return editorText(key, values).replace(/[&<>"']/g, character => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!;
  });
}

/** Option IDs remain unchanged in documents and select values. */
export function editorOptionText(value: string, editor: "cityEditor" | "regionEditor" = "cityEditor"): string {
  const key = value === "include loops & shared" ? "includeLoopsAndShared" : value || "none";
  if (Object.hasOwn(messages[editor].options, key)) {
    return editorText(`${editor}.options.${key}` as EditorMessageKey);
  }
  return value;
}

/** Initial editor page metadata uses the same locale as its controls. */
export function setEditorPageMetadata(editor: "cityEditor" | "regionEditor"): void {
  document.title = editorText(`${editor}.pageTitle`);
  document.querySelector('meta[name="description"]')?.setAttribute("content", editorText(`${editor}.pageDescription`));
}
