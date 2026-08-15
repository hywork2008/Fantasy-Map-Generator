import type React from "react";
import { useTranslation } from "react-i18next";
import {
  GENERATION_STAGES,
  generationProgressStore,
  getGenerationReviewProfile,
  useGenerationProgressState
} from "../../store/generationProgressState";
import { useOptionsState } from "../../store/optionsState";
import type { BiomeRegionProfile } from "../../types/biomeRegion";
import { lock } from "../../utils/domUtils";
import { IconButton } from "../components/IconButton";
import { Dialog } from "./Dialog";
import "./generationProgressDialog.css";

export const GenerationProgressDialog: React.FC = () => {
  const { t } = useTranslation();
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
  const stageRegenerationLabel =
    currentStage === 2
      ? t("generationProgress.applyCultureChanges")
      : currentStage === 3
        ? t("generationProgress.applyRealmChanges")
        : null;

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

  const regenerateClimate = () => {
    generationProgressStore.getState().retryStage();
  };

  const handleHeightExponentChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    if (!Number.isFinite(value)) return;

    useOptionsState.getState().setOption("heightExponent", Math.min(2.2, Math.max(1.5, value)));
    document.dispatchEvent(new CustomEvent("fmg:world-recalculate", { detail: { temps: true, biomes: true } }));
    document.dispatchEvent(new CustomEvent("fmg:render-generation-review"));
  };

  return (
    <Dialog
      isOpen={isOpen}
      title={t("generationProgress.title")}
      showCloseAllDialogsButton={false}
      className="generation-progress-dialog"
    >
      <section className="generation-progress-dialog__content" aria-live="polite">
        <div className="generation-progress-dialog__heading">
          <span className="generation-progress-dialog__eyebrow">
            {t("generationProgress.eyebrow", { current: currentStage + 1, total: GENERATION_STAGES.length })}
          </span>
          <h2>{t(`generationProgress.stages.${stage.id}.title`)}</h2>
          <p>
            {isGenerating
              ? t("generationProgress.generatingStage")
              : t(`generationProgress.stages.${stage.id}.description`)}
          </p>
        </div>

        <div
          className="generation-progress-dialog__bar"
          role="progressbar"
          aria-label={t("generationProgress.progressAria")}
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
                  <strong>{t(`generationProgress.stages.${item.id}.title`)}</strong>
                  {index === currentStage && (
                    <small>
                      {isGenerating ? t("generationProgress.generating") : t("generationProgress.readyToReview")}
                    </small>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        {!isGenerating && !autoRun && (
          <section className="generation-progress-dialog__review" aria-label={t("generationProgress.reviewLayers")}>
            <span>{t("generationProgress.reviewLayers")}</span>
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
                    {t(`generationProgress.reviewLayerNames.${layer.id}`, { defaultValue: layer.label })}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {currentStage === 1 && !isGenerating && !autoRun && (
          <section
            className="generation-progress-dialog__climate-settings"
            aria-label={t("generationProgress.climateSettings")}
          >
            <span>{t("generationProgress.climateInputs")}</span>
            <div className="generation-progress-dialog__climate-inputs">
              <div className="generation-progress-dialog__profile-field">
                <label htmlFor="generationBiomeRegionProfile">{t("generation.biomeRegion")}</label>
                <span className="generation-progress-dialog__profile-control">
                  <select
                    id="generationBiomeRegionProfile"
                    name="biomeRegionProfile"
                    value={biomeRegionProfile}
                    onChange={handleBiomeRegionChange}
                  >
                    <option value="global">{t("generation.biomeRegions.global")}</option>
                    <option value="medievalEurope">{t("generation.biomeRegions.medievalEurope")}</option>
                    <option value="mediterranean">{t("generation.biomeRegions.mediterranean")}</option>
                    <option value="tropicalRiverBasin">{t("generation.biomeRegions.tropicalRiverBasin")}</option>
                    <option value="mountainRealm">{t("generation.biomeRegions.mountainRealm")}</option>
                  </select>
                  <IconButton
                    className="generation-progress-dialog__profile-refresh"
                    icon="icon-cw"
                    tooltip={t("generationProgress.regenerateClimate")}
                    onClick={regenerateClimate}
                  />
                </span>
              </div>
              <label htmlFor="generationHeightExponent" data-tip={t("generationProgress.altitudeExponentTip")}>
                {t("generationProgress.altitudeExponent")}
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
            <button
              type="button"
              className="generation-progress-dialog__world-configurator"
              onClick={openWorldConfigurator}
            >
              {t("generationProgress.openWorldConfigurator")}
            </button>
          </section>
        )}

        {!isGenerating && !autoRun && (
          <div className="generation-progress-dialog__actions">
            <nav
              className="generation-progress-dialog__step-actions"
              aria-label={t("generationProgress.stageNavigation")}
            >
              <div className="generation-progress-dialog__step-action--back">
                {currentStage > 0 && (
                  <button
                    type="button"
                    className="generation-progress-dialog__secondary"
                    onClick={() => generationProgressStore.getState().previous()}
                  >
                    {t("generationProgress.returnToPrevious")}
                  </button>
                )}
              </div>
              <div className="generation-progress-dialog__step-action--regenerate">
                {currentStage === 0 && (
                  <button
                    type="button"
                    className="generation-progress-dialog__secondary"
                    onClick={() => generationProgressStore.getState().retryLandscape()}
                  >
                    {t("generationProgress.generateAnotherLandscape")}
                  </button>
                )}
                {stageRegenerationLabel && (
                  <button
                    type="button"
                    className="generation-progress-dialog__secondary"
                    onClick={() => generationProgressStore.getState().retryStage()}
                  >
                    {stageRegenerationLabel}
                  </button>
                )}
              </div>
              <div className="generation-progress-dialog__step-action--continue">
                <button
                  type="button"
                  className="generation-progress-dialog__primary"
                  onClick={() => generationProgressStore.getState().next()}
                >
                  {currentStage === GENERATION_STAGES.length - 1
                    ? t("generationProgress.finishMap")
                    : t("generationProgress.continue")}
                </button>
              </div>
            </nav>
            <div className="generation-progress-dialog__all-action">
              <button
                type="button"
                className="generation-progress-dialog__secondary"
                onClick={() => generationProgressStore.getState().runAll()}
              >
                {t("generationProgress.generateEntireMap")}
              </button>
            </div>
          </div>
        )}
      </section>
    </Dialog>
  );
};
