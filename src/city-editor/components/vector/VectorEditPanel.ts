import { type EditorMessageKey, editorText } from "../../../i18n/editorMessages";
import type { VectorEditResult } from "../../generators/vector/editing/dependencies";
import { assertVectorDocument } from "../../generators/vector/validation/document";
import { renderVectorDocument } from "../../renderers/vector/documentSvg";
import type { EditorLifetime } from "../../services/editorLifetime";
import { startVectorEdit } from "../../services/vectorEditWorkerClient";
import type { VectorCityDocument } from "../../types/vector/document";

const text = (key: string) => editorText(`cityEditor.vector.dependencies.${key}` as EditorMessageKey);
export function createVectorEditPanel(
  scope: EditorLifetime,
  parent: HTMLElement,
  map: HTMLElement,
  read: () => VectorCityDocument,
  key: () => object,
  commit: (doc: VectorCityDocument, label: string) => void,
  restore: () => void,
  start = startVectorEdit,
  onRender?: (doc: VectorCityDocument) => void
) {
  const box = document.createElement("fieldset"),
    legend = document.createElement("legend"),
    status = document.createElement("output"),
    list = document.createElement("ul"),
    adopt = document.createElement("button"),
    cancel = document.createElement("button");
  legend.textContent = text("title");
  adopt.textContent = text("adopt");
  cancel.textContent = text("cancel");
  adopt.type = cancel.type = "button";
  adopt.dataset.dependencyAction = "adopt";
  cancel.dataset.dependencyAction = "cancel";
  status.className = "ce-vector-dependency-status";
  status.setAttribute("aria-live", "polite");
  box.append(legend, status, list, adopt, cancel);
  parent.append(box);
  box.hidden = true;
  box.style.cssText = "overflow-wrap:anywhere";
  const failure = (message: string) => {
    const code = message.match(/dependency-[a-z-]+|bridge-[a-z-]+/)?.[0] ?? "invalid",
      localized = text(`errors.${code}`),
      reason = localized.startsWith("cityEditor.") ? text("errors.invalid") : localized;
    return `${text("failed")} ${reason}${message.startsWith(`${code}:`) ? ` (${message.slice(code.length + 1)})` : ""}`;
  };
  let epoch = 0,
    job: ReturnType<typeof start> | undefined,
    pending: VectorEditResult | undefined,
    sourceKey: object | undefined,
    label = "";
  const invalidate = () => {
    epoch++;
    job?.cancel();
    job = undefined;
    pending = undefined;
    adopt.disabled = true;
  };
  scope.own(invalidate);
  for (const event of ["click", "input"] as const)
    scope.listen(
      parent,
      event,
      e => {
        if (box.contains(e.target as Node)) return;
        const had = !!job || !!pending;
        invalidate();
        box.hidden = true;
        if (had) {
          const svg = renderVectorDocument(read());
          svg.style.cssText = "width:100%;height:100%;min-height:300px";
          map.replaceChildren(svg);
        }
      },
      { capture: true }
    );
  scope.listen(
    map,
    "pointerdown",
    () => {
      if (job || pending) {
        invalidate();
        box.hidden = true;
        restore();
      }
    },
    { capture: true }
  );
  scope.listen(cancel, "click", () => {
    invalidate();
    box.hidden = true;
    restore();
  });
  scope.listen(adopt, "click", () => {
    if (!pending || sourceKey !== key()) return;
    const doc = pending.document;
    assertVectorDocument(doc);
    invalidate();
    box.hidden = true;
    commit(doc, label);
  });
  return {
    submit(candidate: VectorCityDocument, nextLabel: string) {
      invalidate();
      scope.invalidate("import");
      scope.invalidate("vector-generation-input");
      const source = read();
      if (!source.urban) {
        commit(candidate, nextLabel);
        return;
      }
      const token = epoch;
      sourceKey = key();
      const originalKey = sourceKey;
      label = nextLabel;
      box.hidden = false;
      status.textContent = text("running");
      list.replaceChildren();
      try {
        job = start(source, candidate);
        void job.result
          .then(result => {
            if (!result || token !== epoch || !scope.active || originalKey !== key()) return;
            assertVectorDocument(result.document);
            pending = result;
            job = undefined;
            adopt.disabled = false;
            const impact = result.impact;
            status.textContent = `${text("retained")}: ${impact.retainedPlacements.length}; ${text("relocated")}: ${impact.relocatedPlacements.length}; ${text("blocks")}: ${impact.affectedBlocks.length}; ${text("unplaced")}: ${result.document.urban!.report.unplacedPopulation}`;
            list.replaceChildren(
              ...[...impact.relocatedPlacements, ...impact.removedLanes].map(id => {
                const li = document.createElement("li");
                li.textContent = id;
                return li;
              })
            );
            const svg = renderVectorDocument(result.document);
            svg.style.cssText = "width:100%;height:100%;min-height:300px";
            svg.dataset.dependencyPreview = "true";
            map.replaceChildren(svg);
            onRender?.(result.document);
          })
          .catch(error => {
            if (token !== epoch || !scope.active || originalKey !== key()) return;
            job = undefined;
            const message = error instanceof Error ? error.message : String(error);
            status.textContent = failure(message);
            restore();
          });
      } catch (error) {
        status.textContent = failure(error instanceof Error ? error.message : String(error));
        restore();
      }
    },
    refresh() {
      invalidate();
      box.hidden = true;
    }
  };
}
