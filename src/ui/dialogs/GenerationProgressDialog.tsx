import type React from "react";
import {
  GENERATION_STAGES,
  generationProgressStore,
  getGenerationReviewProfile,
  useGenerationProgressState
} from "../../store/generationProgressState";
import { useOptionsState } from "../../store/optionsState";
import type { BiomeRegionProfile } from "../../types/biomeRegion";
import { lock } from "../../utils/domUtils";
import { Dialog } from "./Dialog";
import "./generationProgressDialog.css";

export const GenerationProgressDialog: React.FC = () => {
  const isOpen = useGenerationProgressState(state => state.isOpen);
  const isGenerating = useGenerationProgressState(state => state.isGenerating);
  const currentStage = useGenerationProgressState(state => state.currentStage);
  const autoRun = useGenerationProgressState(state => state.autoRun);
  const reviewLayers = useGenerationProgressState(state => state.reviewLayers);
  const biomeRegionProfile = useOptionsState(state => state.biomeRegionProfile);
  const heightExponent = useOptionsState(state => state.heightExponent);
  const stage = GENERATION_STAGES[currentStage] ?? GENERATION_STAGES[0];
  const reviewProfile = getGenerationReviewProfile(currentStage);
  const completed = currentStage;
  const progress = ((completed + (isGenerating ? 0 : 1)) / GENERATION_STAGES.length) * 100;

  const handleReviewLayerToggle = (layerId: (typeof reviewProfile.layers)[number]["id"]) => {
    const store = generationProgressStore.getState();
    store.toggleReviewLayer(layerId);
    document.dispatchEvent(new CustomEvent("fmg:render-generation-review"));
  };

  const handleBiomeRegionChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    useOptionsState.getState().setOption("biomeRegionProfile", event.target.value as BiomeRegionProfile);
    lock("biomeRegionProfile");
  };

  const openWorldConfigurator = () => {
    document.dispatchEvent(new CustomEvent("react-open-world-configurator"));
  };

  const handleHeightExponentChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    if (!Number.isFinite(value)) return;

    useOptionsState.getState().setOption("heightExponent", Math.min(2.2, Math.max(1.5, value)));
    document.dispatchEvent(new CustomEvent("fmg:world-recalculate", { detail: { temps: true, biomes: true } }));
    document.dispatchEvent(new CustomEvent("fmg:render-generation-review"));
  };

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
          <section className="generation-progress-dialog__review" aria-label="Review layers">
            <span>Review layers</span>
            <div className="generation-progress-dialog__review-controls">
              {reviewProfile.layers.map(layer => {
                const isActive = reviewLayers.includes(layer.id);
                return (
                  <button
                    key={layer.id}
                    type="button"
                    aria-pressed={isActive}
                    className={isActive ? "generation-progress-dialog__review-layer--active" : undefined}
                    onClick={() => handleReviewLayerToggle(layer.id)}
                  >
                    {layer.label}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {currentStage === 1 && !isGenerating && !autoRun && (
          <section className="generation-progress-dialog__climate-settings" aria-label="Climate settings">
            <span>Climate inputs</span>
            <div className="generation-progress-dialog__climate-inputs">
              <label htmlFor="generationBiomeRegionProfile">
                Biome region
                <select
                  id="generationBiomeRegionProfile"
                  name="biomeRegionProfile"
                  value={biomeRegionProfile}
                  onChange={handleBiomeRegionChange}
                >
                  <option value="global">Global (default mix)</option>
                  <option value="medievalEurope">Medieval Europe</option>
                  <option value="mediterranean">Mediterranean</option>
                  <option value="tropicalRiverBasin">Tropical river basin</option>
                  <option value="mountainRealm">Mountain realm</option>
                </select>
              </label>
              <label
                htmlFor="generationHeightExponent"
                data-tip="Higher values make altitude cool faster, changing temperature and biomes."
              >
                Altitude exponent
                <span className="generation-progress-dialog__range-control">
                  <input
                    id="generationHeightExponent"
                    name="heightExponent"
                    type="range"
                    min="1.5"
                    max="2.2"
                    step="0.01"
                    value={heightExponent}
                    onChange={handleHeightExponentChange}
                  />
                  <output htmlFor="generationHeightExponent">{heightExponent.toFixed(2)}</output>
                </span>
              </label>
            </div>
            <button type="button" onClick={openWorldConfigurator}>
              Open World Configurator
            </button>
          </section>
        )}

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
            {currentStage === 1 && (
              <button
                type="button"
                className="generation-progress-dialog__secondary"
                onClick={() => generationProgressStore.getState().retryStage()}
              >
                Regenerate climate and waterways
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
