import { formatGenerationFailureLog, type GenerationSample } from "../core/generationDiagnostics";

/** The latest generation's diagnostics, with transient hover highlighting of referenced mesh IDs. */
export function generationLogPanel(content: HTMLElement, hover: (ids: string[], seed: string) => void) {
  const list = document.createElement("div");
  list.className = "ce-generation-log-list";
  list.setAttribute("aria-label", "都市生成の失敗ログ");
  const empty = document.createElement("span");
  empty.textContent = "生成失敗のログはありません";
  const clear = document.createElement("button");
  clear.type = "button";
  clear.textContent = "ログを消去";
  clear.className = "ce-generation-log-clear";
  const reset = () => {
    hover([], "");
    list.replaceChildren(empty);
    clear.disabled = true;
  };
  clear.addEventListener("click", reset);
  content.append(list, clear);
  reset();
  const append = (sample: GenerationSample, seed: string) => {
    if (!sample.failure) return;
    empty.remove();
    clear.disabled = false;
    const section = document.createElement("section");
    section.className = "ce-generation-log-entry";
    const lines = formatGenerationFailureLog([sample], { seed })
      .split("\n")
      .filter(line => line.trim());
    for (const line of lines) {
      const ids = [...new Set(line.match(/\b[vef]\d+\b/g) ?? [])];
      const row = document.createElement("div");
      row.className = "ce-generation-log-row";
      row.textContent = line.trim();
      if (ids.length) {
        row.tabIndex = 0;
        row.dataset.objectIds = ids.join(" ");
        row.title = `${ids.join(", ")} を強調表示`;
        const enter = () => {
          row.classList.add("is-current");
          hover(ids, seed);
        };
        const leave = () => {
          row.classList.remove("is-current");
          hover([], seed);
        };
        row.addEventListener("mouseenter", enter);
        row.addEventListener("mouseleave", leave);
        row.addEventListener("focus", enter);
        row.addEventListener("blur", leave);
      }
      section.append(row);
    }
    list.append(section);
    section.scrollIntoView?.({ block: "nearest" });
  };
  return { reset, append };
}
