import { editorText } from "../../i18n/editorMessages";
import type { createEditorControls, FloatingWindow } from "../components/editorControls";
import { div, text } from "../components/editorControls";
import type { DocumentsState } from "../state/editorSession";
import type { CityDocument } from "../types/document";
import { formatClock } from "../utils/editorUnits";

export interface HistoryContext {
  controls: ReturnType<typeof createEditorControls>;
  historyListEl: HTMLDivElement | null;
  historyRows: HTMLButtonElement[];
  scope: import("../services/editorLifetime").EditorLifetime;
  historyPanel: FloatingWindow;
  historyClearButton: HTMLButtonElement | null;
  rememberGenerationState: (seed?: string, stage?: number) => void;
  showNotice: (value: string, redraw?: boolean) => void;
  refreshUiOnly: () => void;
  historySummaryEl: HTMLElement | null;
  restore: (next: CityDocument | null) => void;
  documents: Pick<DocumentsState, "history" | "documentState">;
}

/** Live getters prevent snapshots of the current document or UI state. */
export function createHistoryController(ctx: HistoryContext) {
  const { makeButton } = ctx.controls;
  function renderHistory(): void {
    const entries = ctx.documents.history.entries;
    const current = ctx.documents.history.index;
    // A brush stroke commits one entry per edit, so painting a Large mesh one
    // cell at a time can push this into the hundreds within a session.
    // Rebuilding every row's DOM on every single commit made this panel cost
    // O(entries) per edit — O(entries²) over a session — even though only the
    // newest row (or the current one, via amendTop) actually changed. Reuse
    // existing row nodes and only patch what changed; fall back to a full
    // rebuild only when the list actually shrinks (undo-then-branch, or a
    // fresh document/history).
    if (!ctx.historyListEl || ctx.historyRows.length > entries.length) {
      ctx.scope.replaceChildren(ctx.historyPanel.content);
      ctx.historyListEl = div("ce-history-list");
      const actions = div("ce-history-actions");
      ctx.historyClearButton = makeButton(editorText("cityEditor.messages.clearAllHistory"), () => {
        if (!ctx.documents.history.canUndo && !ctx.documents.history.canRedo) return;
        ctx.documents.history.reset(ctx.documents.documentState, editorText("cityEditor.messages.historyCleared"));
        ctx.rememberGenerationState();
        ctx.showNotice(editorText("cityEditor.messages.historyCleared"));
        ctx.refreshUiOnly();
      });
      ctx.historyClearButton.className = "ce-history-clear";
      actions.appendChild(ctx.historyClearButton);
      ctx.historySummaryEl = text("");
      ctx.historyPanel.content.append(ctx.historyListEl, actions, ctx.historySummaryEl);
      ctx.historyRows = [];
    }
    const list = ctx.historyListEl;
    entries.forEach((entry, index) => {
      let row = ctx.historyRows[index];
      if (!row) {
        row = makeButton("", () => jumpToHistory(index));
        row.className = "ce-history-row";
        const step = text(String(index));
        step.className = "ce-history-index";
        row.append(step, text(""), text(""));
        (row.children[1] as HTMLElement).className = "ce-history-label";
        (row.children[2] as HTMLElement).className = "ce-history-time";
        list.appendChild(row);
        ctx.historyRows[index] = row;
      }
      const label = row.children[1] as HTMLElement;
      const time = row.children[2] as HTMLElement;
      if (label.textContent !== entry.label) label.textContent = entry.label;
      const clock = formatClock(entry.time);
      if (time.textContent !== clock) time.textContent = clock;
      row.title = editorText("cityEditor.messages.restoreState", { value0: index, value1: entry.label });
      row.classList.toggle("is-current", index === current);
      row.classList.toggle("is-future", index > current);
    });
    ctx.historyClearButton!.disabled = entries.length <= 1;
    ctx.historySummaryEl!.textContent = editorText("cityEditor.messages.stepOfClickAStepToRestoreIt", {
      value0: current,
      value1: entries.length - 1
    });
    // Keep the active step visible as the timeline grows past the panel height.
    ctx.historyRows[current]?.scrollIntoView({ block: "nearest" });
  }

  function jumpToHistory(index: number): void {
    ctx.restore(ctx.documents.history.jumpTo(index));
  }

  return { renderHistory, jumpToHistory };
}
