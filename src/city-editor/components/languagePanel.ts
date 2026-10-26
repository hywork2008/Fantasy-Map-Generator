import { editorText } from "../../i18n/editorMessages";
import i18n, { isSupportedLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from "../../i18n/index";
import type { EditorLifetime } from "../services/editorLifetime";

export function mountLanguagePanel(options: {
  host: HTMLElement;
  scope: EditorLifetime;
  changeLanguage(language: SupportedLanguage): Promise<void>;
  showError(message: string): void;
}) {
  const panel = document.createElement("details");
  panel.className = "ce-language";
  const summary = document.createElement("summary");
  summary.textContent = `🌐 ${editorText("cityEditor.messages.nativeLanguageName")}`;
  summary.setAttribute("aria-label", editorText("cityEditor.messages.interfaceLanguage"));
  summary.title = editorText("cityEditor.messages.interfaceLanguage");
  const label = document.createElement("label");
  label.textContent = editorText("cityEditor.messages.interfaceLanguage");
  const select = document.createElement("select");
  select.setAttribute("aria-label", label.textContent);
  for (const value of SUPPORTED_LANGUAGES) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = i18n.getFixedT(value)("cityEditor.messages.nativeLanguageName");
    option.lang = value;
    select.append(option);
  }
  select.value = i18n.language;
  label.append(select);
  panel.append(summary, label);
  options.host.append(panel);
  options.scope.listen(select, "change", async () => {
    const language = select.value;
    if (!isSupportedLanguage(language) || language === i18n.language) return;
    select.disabled = true;
    try {
      await options.changeLanguage(language);
    } catch (error) {
      if (options.scope.active) {
        select.value = i18n.language;
        select.disabled = false;
        options.showError(error instanceof Error ? error.message : String(error));
      }
    }
  });
}

/** Keep the original mount's dispose handle valid across language-only UI rebuilds. */
export class EditorLanguageLifetime {
  private current: (() => void) | undefined;
  attach(scope: EditorLifetime) {
    this.current = scope.dispose.bind(scope);
  }
  dispose() {
    this.current?.();
    this.current = undefined;
  }
}

function pathOf(root: HTMLElement, element: Element): number[] {
  const path: number[] = [];
  for (let node = element; node !== root && node.parentElement; node = node.parentElement)
    path.unshift(Array.prototype.indexOf.call(node.parentElement.children, node));
  return path;
}
function atPath(root: HTMLElement, path: number[]): HTMLElement | undefined {
  let node: Element | undefined = root;
  for (const index of path) node = node?.children[index];
  return node instanceof HTMLElement ? node : undefined;
}

/** Only UI state is copied here; the editor retains its document and history objects separately. */
export function captureLanguageUi(root: HTMLElement) {
  return {
    controls: [
      ...root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea")
    ]
      .filter(control => !(control instanceof HTMLInputElement && control.type === "file"))
      .map(control => ({
        path: pathOf(root, control),
        value: control.value,
        checked: control instanceof HTMLInputElement ? control.checked : undefined
      })),
    panels: [...root.querySelectorAll<HTMLElement>(".ce-panel")].map(panel => ({
      path: pathOf(root, panel),
      style: panel.style.cssText,
      hidden: panel.hidden,
      collapsed: panel.classList.contains("ce-panel--collapsed")
    })),
    details: [...root.querySelectorAll<HTMLDetailsElement>("details")].map(panel => ({
      path: pathOf(root, panel),
      open: panel.open
    })),
    scroll: [...root.querySelectorAll<HTMLElement>(".ce-panel-content, .ce-generation-tabpanel")].map(panel => ({
      path: pathOf(root, panel),
      top: panel.scrollTop
    })),
    generationTab: root.querySelector<HTMLElement>('[data-generation-tab][aria-selected="true"]')?.dataset.generationTab
  };
}

export function restoreLanguageControls(root: HTMLElement, saved: ReturnType<typeof captureLanguageUi>) {
  for (const control of saved.controls) {
    const target = atPath(root, control.path);
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement
    ) {
      // Locale options reflect the new language, rather than the previous selection.
      if (target.closest(".ce-language")) continue;
      target.value = control.value;
      if (target instanceof HTMLInputElement && control.checked !== undefined) target.checked = control.checked;
    }
  }
}

export function restoreLanguageUi(root: HTMLElement, saved: ReturnType<typeof captureLanguageUi>) {
  restoreLanguageControls(root, saved);
  for (const panel of saved.panels) {
    const target = atPath(root, panel.path);
    if (!target?.classList.contains("ce-panel")) continue;
    target.style.cssText = panel.style;
    target.hidden = panel.hidden;
    if (target.classList.contains("ce-panel--collapsed") !== panel.collapsed)
      target.querySelector<HTMLButtonElement>(".ce-panel-collapse")?.click();
  }
  for (const detail of saved.details) {
    const target = atPath(root, detail.path);
    if (target instanceof HTMLDetailsElement) target.open = detail.open;
  }
  if (saved.generationTab)
    root.querySelector<HTMLButtonElement>(`[data-generation-tab="${saved.generationTab}"]`)?.click();
  for (const scroll of saved.scroll) {
    const target = atPath(root, scroll.path);
    if (target) target.scrollTop = scroll.top;
  }
}
