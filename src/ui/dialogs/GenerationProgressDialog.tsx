import type React from "react";
import {
  GENERATION_STAGES,
  generationProgressStore,
  useGenerationProgressState
} from "../../store/generationProgressState";
import { Dialog } from "./Dialog";
import "./generationProgressDialog.css";

export const GenerationProgressDialog: React.FC = () => {
  const isOpen = useGenerationProgressState(state => state.isOpen);
  const isGenerating = useGenerationProgressState(state => state.isGenerating);
  const currentStage = useGenerationProgressState(state => state.currentStage);
  const autoRun = useGenerationProgressState(state => state.autoRun);
  const stage = GENERATION_STAGES[currentStage] ?? GENERATION_STAGES[0];
  const completed = currentStage;
  const progress = ((completed + (isGenerating ? 0 : 1)) / GENERATION_STAGES.length) * 100;

  return (
    <Dialog isOpen={isOpen} title="Build map" className="generation-progress-dialog">
      <section className="generation-progress-dialog__content" aria-live="polite">
        <div className="generation-progress-dialog__heading">
          <span className="generation-progress-dialog__eyebrow">
            WORLD FORGE · {currentStage + 1} / {GENERATION_STAGES.length}
          </span>
          <h2>{stage.title}</h2>
          <p>{isGenerating ? "Generating this stage…" : stage.description}</p>
        </div>

        <div
          className="generation-progress-dialog__bar"
          role="progressbar"
          aria-label="Map generation progress"
          aria-valuemin={0}
          aria-valuemax={GENERATION_STAGES.length}
          aria-valuenow={completed + (isGenerating ? 0 : 1)}
        >
          <span style={{ width: `${progress}%` }} />
        </div>

        <ol className="generation-progress-dialog__stages">
          {GENERATION_STAGES.map((item, index) => {
            const state = index < currentStage ? "complete" : index === currentStage ? "current" : "upcoming";
            return (
              <li
                key={item.id}
                className={`generation-progress-dialog__stage generation-progress-dialog__stage--${state}`}
              >
                <span aria-hidden="true">{state === "complete" ? "✓" : index + 1}</span>
                <div>
                  <strong>{item.title}</strong>
                  {index === currentStage && <small>{isGenerating ? "Generating" : "Ready to review"}</small>}
                </div>
              </li>
            );
          })}
        </ol>

        {!isGenerating && !autoRun && (
          <div className="generation-progress-dialog__actions">
            {currentStage === 0 ? (
              <button
                type="button"
                className="generation-progress-dialog__secondary"
                onClick={() => generationProgressStore.getState().retryLandscape()}
              >
                Generate another landscape
              </button>
            ) : (
              <button
                type="button"
                className="generation-progress-dialog__secondary"
                onClick={() => generationProgressStore.getState().previous()}
              >
                Return to previous stage
              </button>
            )}
            <button
              type="button"
              className="generation-progress-dialog__secondary"
              onClick={() => generationProgressStore.getState().runAll()}
            >
              Generate entire map
            </button>
            <button
              type="button"
              className="generation-progress-dialog__primary"
              onClick={() => generationProgressStore.getState().next()}
            >
              {currentStage === GENERATION_STAGES.length - 1 ? "Finish map" : "Continue"}
            </button>
          </div>
        )}
      </section>
    </Dialog>
  );
};
