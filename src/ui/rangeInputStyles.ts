const RANGE_SELECTOR = 'input[type="range"]';

function syncRangeProgress(input: HTMLInputElement): void {
  const min = Number(input.min || "0");
  const max = Number(input.max || "100");
  const value = input.valueAsNumber;
  const span = max - min;
  const progress = Number.isFinite(value) && Number.isFinite(span) && span > 0 ? ((value - min) / span) * 100 : 0;
  input.style.setProperty("--range-progress", `${Math.min(Math.max(progress, 0), 100)}%`);
}

/** Synchronize the visual track progress for all range inputs within a mounted UI subtree. */
export function syncRangeProgressInElement(root: ParentNode): void {
  if (root instanceof HTMLInputElement && root.type === "range") {
    syncRangeProgress(root);
    return;
  }

  root.querySelectorAll<HTMLInputElement>(RANGE_SELECTOR).forEach(syncRangeProgress);
}

function syncRangeProgressInNode(node: Node): void {
  if (node instanceof HTMLInputElement && node.type === "range") {
    syncRangeProgress(node);
    return;
  }

  if (!(node instanceof Element)) return;
  syncRangeProgressInElement(node);
}

/** Apply the custom range-track progress variable to current and later-mounted UI controls. */
export function initRangeInputStyles(): void {
  document.querySelectorAll<HTMLInputElement>(RANGE_SELECTOR).forEach(syncRangeProgress);

  document.addEventListener("input", event => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.type === "range") syncRangeProgress(target);
  });

  const observer = new MutationObserver(records => {
    for (const record of records) {
      record.addedNodes.forEach(syncRangeProgressInNode);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
