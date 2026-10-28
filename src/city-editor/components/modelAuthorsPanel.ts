import { MODEL_VARIANTS } from "../../buildings/variants";
import { editorText } from "../../i18n/editorMessages";

interface Options {
  host: HTMLElement;
  scope: { listen(target: EventTarget, type: string, handler: (event: Event) => void): void };
  getModelVariants(): string[] | null;
}

/** Authors of the adopted BV models in the open 3D view, grouped by author. */
export function mountModelAuthorsPanel(options: Options) {
  const panel = document.createElement("details");
  panel.className = "ce-model-authors";
  const summary = document.createElement("summary");
  summary.textContent = editorText("cityEditor.messages.modelAuthorsPanel");
  const output = document.createElement("div");
  panel.append(summary, output);
  options.host.append(panel);
  let timer: ReturnType<typeof setInterval> | undefined;
  let shown = "";
  const update = () => {
    const ids = options.getModelVariants();
    const key = ids?.join("|") ?? "closed";
    if (key === shown) return;
    shown = key;
    output.replaceChildren();
    if (!ids?.length) {
      const empty = document.createElement("p");
      empty.textContent = editorText(
        ids ? "cityEditor.messages.modelAuthorsNone" : "cityEditor.messages.modelAuthorsEmpty"
      );
      output.append(empty);
      return;
    }
    const byAuthor = new Map<string, string[]>();
    for (const id of ids) {
      const variant = MODEL_VARIANTS.find(entry => entry.id === id);
      if (!variant) continue;
      const models = byAuthor.get(variant.author) ?? [];
      models.push(variant.level === "default" ? variant.family : `${variant.family} · ${variant.level}`);
      byAuthor.set(variant.author, models);
    }
    for (const [author, models] of [...byAuthor].sort(([a], [b]) => a.localeCompare(b))) {
      const heading = document.createElement("h3");
      heading.textContent = `${author} (${models.length})`;
      const list = document.createElement("ul");
      for (const model of models) {
        const item = document.createElement("li");
        item.textContent = model;
        list.append(item);
      }
      output.append(heading, list);
    }
  };
  const stop = () => {
    clearInterval(timer);
    timer = undefined;
  };
  options.scope.listen(panel, "toggle", () => {
    stop();
    if (!panel.open) return;
    shown = "";
    update();
    timer = setInterval(update, 1000);
  });
  return {
    dispose() {
      stop();
      panel.remove();
    }
  };
}
