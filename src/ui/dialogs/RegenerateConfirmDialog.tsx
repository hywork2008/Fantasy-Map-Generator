import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDialogState } from "../../store/dialogState";
import type { InternationalRoutePolicy, LandRouteGenerationMode, SeaRouteGenerationMode } from "../../types/models";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

/** Modes / coefficients chosen in the regenerate-routes confirm dialog. */
export interface RouteRegenerationModes {
  seaRouteGenerationMode?: SeaRouteGenerationMode;
  landRouteGenerationMode?: LandRouteGenerationMode;
  /** Strength of elevation/slope aversion for elevationAware land routes (0–3). */
  landRouteElevationAversion?: number;
  internationalRoutePolicy?: InternationalRoutePolicy;
}

/**
 * RNG seed policy for Tools → regenerate Characters.
 * - mapSeed: deterministic from the map seed (same roster every time)
 * - mixTime: map seed mixed with wall-clock time (new variation, still map-linked)
 * - random: independent entropy each click
 */
export type CharacterRegenerationEntropy = "mapSeed" | "mixTime" | "random";

/** Options bag returned by the confirm dialog's Proceed handler. */
export interface RegenerateConfirmProceedOptions extends RouteRegenerationModes {
  characterEntropy?: CharacterRegenerationEntropy;
}

export interface RegenerateConfirmConfig {
  [key: string]: unknown;
  featureName: string;
  showDontAskAgain?: boolean;
  seaRouteGenerationMode?: SeaRouteGenerationMode;
  landRouteGenerationMode?: LandRouteGenerationMode;
  landRouteElevationAversion?: number;
  internationalRoutePolicy?: InternationalRoutePolicy;
  /**
   * When set (even to the default `"mapSeed"`), the Characters seed-policy selector is shown.
   * Presence of the field gates the UI — same pattern as the routes mode fields.
   */
  characterEntropy?: CharacterRegenerationEntropy;
  onProceed: (dontAskAgain: boolean, options?: RegenerateConfirmProceedOptions) => void;
}

const DIALOG_ID = "regenerateConfirm";

function isCharacterRegenerationEntropy(value: string): value is CharacterRegenerationEntropy {
  return value === "mapSeed" || value === "mixTime" || value === "random";
}

export const RegenerateConfirmDialog: React.FC = () => {
  const { t } = useTranslation();
  const config = useDialogState(s => s.dialogConfigs[DIALOG_ID]) as unknown as RegenerateConfirmConfig | undefined;
  const checkboxRef = useRef<HTMLInputElement>(null);
  const [seaRouteGenerationMode, setSeaRouteGenerationMode] = useState<SeaRouteGenerationMode>("augmented");
  const [landRouteGenerationMode, setLandRouteGenerationMode] = useState<LandRouteGenerationMode>("elevationAware");
  const [landRouteElevationAversion, setLandRouteElevationAversion] = useState(1);
  const [internationalRoutePolicy, setInternationalRoutePolicy] =
    useState<InternationalRoutePolicy>("settlementDefault");
  const [characterEntropy, setCharacterEntropy] = useState<CharacterRegenerationEntropy>("mapSeed");

  useEffect(() => {
    setSeaRouteGenerationMode(config?.seaRouteGenerationMode ?? "augmented");
    setLandRouteGenerationMode(config?.landRouteGenerationMode ?? "elevationAware");
    setLandRouteElevationAversion(config?.landRouteElevationAversion ?? 1);
    setInternationalRoutePolicy(config?.internationalRoutePolicy ?? "settlementDefault");
    setCharacterEntropy(config?.characterEntropy ?? "mapSeed");
  }, [
    config?.seaRouteGenerationMode,
    config?.landRouteGenerationMode,
    config?.landRouteElevationAversion,
    config?.characterEntropy,
    config?.internationalRoutePolicy
  ]);

  const handleProceed = useCallback(() => {
    const dontAsk = checkboxRef.current?.checked ?? false;
    closeDialog(DIALOG_ID);
    const showRouteModes =
      config?.seaRouteGenerationMode !== undefined ||
      config?.landRouteGenerationMode !== undefined ||
      config?.landRouteElevationAversion !== undefined ||
      config?.internationalRoutePolicy !== undefined;
    const showCharacterEntropy = config?.characterEntropy !== undefined;
    config?.onProceed(
      dontAsk,
      showRouteModes || showCharacterEntropy
        ? {
            seaRouteGenerationMode: config?.seaRouteGenerationMode !== undefined ? seaRouteGenerationMode : undefined,
            landRouteGenerationMode:
              config?.landRouteGenerationMode !== undefined ? landRouteGenerationMode : undefined,
            landRouteElevationAversion:
              config?.landRouteElevationAversion !== undefined ? landRouteElevationAversion : undefined,
            internationalRoutePolicy:
              config?.internationalRoutePolicy !== undefined ? internationalRoutePolicy : undefined,
            characterEntropy: showCharacterEntropy ? characterEntropy : undefined
          }
        : undefined
    );
  }, [
    config,
    seaRouteGenerationMode,
    landRouteGenerationMode,
    landRouteElevationAversion,
    internationalRoutePolicy,
    characterEntropy
  ]);

  const handleCancel = useCallback(() => closeDialog(DIALOG_ID), []);

  if (!config) return null;

  const feature = t(`dialogs.features.${config.featureName}`, { defaultValue: config.featureName });
  const showRouteModes =
    config.seaRouteGenerationMode !== undefined ||
    config.landRouteGenerationMode !== undefined ||
    config.landRouteElevationAversion !== undefined ||
    config.internationalRoutePolicy !== undefined;
  const showCharacterEntropy = config.characterEntropy !== undefined;

  return (
    <Dialog
      isOpen={true}
      title={t("dialogs.regenerate.title", { feature })}
      onClose={handleCancel}
      buttons={[
        { label: t("common.proceed"), onClick: handleProceed },
        { label: t("common.cancel"), onClick: handleCancel }
      ]}
    >
      <div>
        <p>
          {t("dialogs.regenerate.body", { feature })}
          <br />
          <br />
          {t("dialogs.regenerate.confirm")}
        </p>
        {showRouteModes && (
          <div>
            {config.seaRouteGenerationMode !== undefined && (
              <div>
                <label htmlFor="seaRouteGenerationMode">{t("dialogs.regenerate.seaRoutes")} </label>
                <select
                  id="seaRouteGenerationMode"
                  value={seaRouteGenerationMode}
                  onChange={event =>
                    setSeaRouteGenerationMode(event.target.value === "augmented" ? "augmented" : "legacy")
                  }
                >
                  <option value="augmented">{t("dialogs.regenerate.seaAugmented")}</option>
                  <option value="legacy">{t("dialogs.regenerate.seaLegacy")}</option>
                </select>
                <p>{t("dialogs.regenerate.seaNote")}</p>
              </div>
            )}
            {config.landRouteGenerationMode !== undefined && (
              <div>
                <label htmlFor="landRouteGenerationMode">{t("dialogs.regenerate.landRoutes")} </label>
                <select
                  id="landRouteGenerationMode"
                  value={landRouteGenerationMode}
                  onChange={event =>
                    setLandRouteGenerationMode(event.target.value === "legacy" ? "legacy" : "elevationAware")
                  }
                >
                  <option value="elevationAware">{t("dialogs.regenerate.landElevation")}</option>
                  <option value="legacy">{t("dialogs.regenerate.landLegacy")}</option>
                </select>
                <p>{t("dialogs.regenerate.landNote")}</p>
              </div>
            )}
            {config.landRouteElevationAversion !== undefined && (
              <div>
                <label htmlFor="landRouteElevationAversion">
                  {t("dialogs.regenerate.elevationAversion")}{" "}
                  <output htmlFor="landRouteElevationAversion">
                    {landRouteGenerationMode === "legacy" ? "n/a" : landRouteElevationAversion.toFixed(1)}
                  </output>
                </label>
                <input
                  id="landRouteElevationAversion"
                  type="range"
                  min="0"
                  max="3"
                  step="0.1"
                  value={landRouteElevationAversion}
                  disabled={landRouteGenerationMode === "legacy"}
                  onChange={event => setLandRouteElevationAversion(Number(event.target.value))}
                />
                <p>{t("dialogs.regenerate.elevationAversionNote")}</p>
              </div>
            )}
            {config.internationalRoutePolicy !== undefined && (
              <div>
                <label htmlFor="internationalRoutePolicy">{t("dialogs.regenerate.internationalRoutes")} </label>
                <select
                  id="internationalRoutePolicy"
                  value={internationalRoutePolicy}
                  onChange={event => {
                    const value = event.target.value;
                    if (value === "none" || value === "peacefulNeighbors" || value === "settlementDefault") {
                      setInternationalRoutePolicy(value);
                    }
                  }}
                >
                  <option value="settlementDefault">{t("dialogs.regenerate.internationalDefault")}</option>
                  <option value="peacefulNeighbors">{t("dialogs.regenerate.internationalPeaceful")}</option>
                  <option value="none">{t("dialogs.regenerate.internationalNone")}</option>
                </select>
                <p>{t("dialogs.regenerate.internationalNote")}</p>
              </div>
            )}
          </div>
        )}
        {showCharacterEntropy && (
          <div>
            <label htmlFor="characterRegenerationEntropy">{t("dialogs.regenerate.randomSeed")} </label>
            <select
              id="characterRegenerationEntropy"
              value={characterEntropy}
              onChange={event => {
                const value = event.target.value;
                if (isCharacterRegenerationEntropy(value)) setCharacterEntropy(value);
              }}
            >
              <option value="mapSeed">{t("dialogs.regenerate.seedMap")}</option>
              <option value="mixTime">{t("dialogs.regenerate.seedMix")}</option>
              <option value="random">{t("dialogs.regenerate.seedRandom")}</option>
            </select>
            <p>{t("dialogs.regenerate.seedNote")}</p>
          </div>
        )}
        {config.showDontAskAgain !== false && (
          <div>
            <input ref={checkboxRef} id="dontAskAgain" className="checkbox" type="checkbox" />
            <label htmlFor="dontAskAgain" className="checkbox-label dontAsk">
              <i>{t("dialogs.regenerate.dontAsk")}</i>
            </label>
          </div>
        )}
      </div>
    </Dialog>
  );
};
