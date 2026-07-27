import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDialogState } from "../../store/dialogState";
import type { LandRouteGenerationMode, SeaRouteGenerationMode } from "../../types/models";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

/** Modes / coefficients chosen in the regenerate-routes confirm dialog. */
export interface RouteRegenerationModes {
  seaRouteGenerationMode?: SeaRouteGenerationMode;
  landRouteGenerationMode?: LandRouteGenerationMode;
  /** Strength of elevation/slope aversion for elevationAware land routes (0–3). */
  landRouteElevationAversion?: number;
}

export interface RegenerateConfirmConfig {
  [key: string]: unknown;
  featureName: string;
  showDontAskAgain?: boolean;
  seaRouteGenerationMode?: SeaRouteGenerationMode;
  landRouteGenerationMode?: LandRouteGenerationMode;
  landRouteElevationAversion?: number;
  onProceed: (dontAskAgain: boolean, routeModes?: RouteRegenerationModes) => void;
}

const DIALOG_ID = "regenerateConfirm";

export const RegenerateConfirmDialog: React.FC = () => {
  const config = useDialogState(s => s.dialogConfigs[DIALOG_ID]) as unknown as RegenerateConfirmConfig | undefined;
  const checkboxRef = useRef<HTMLInputElement>(null);
  const [seaRouteGenerationMode, setSeaRouteGenerationMode] = useState<SeaRouteGenerationMode>("augmented");
  const [landRouteGenerationMode, setLandRouteGenerationMode] = useState<LandRouteGenerationMode>("elevationAware");
  const [landRouteElevationAversion, setLandRouteElevationAversion] = useState(1);

  useEffect(() => {
    setSeaRouteGenerationMode(config?.seaRouteGenerationMode ?? "augmented");
    setLandRouteGenerationMode(config?.landRouteGenerationMode ?? "elevationAware");
    setLandRouteElevationAversion(config?.landRouteElevationAversion ?? 1);
  }, [config?.seaRouteGenerationMode, config?.landRouteGenerationMode, config?.landRouteElevationAversion]);

  const handleProceed = useCallback(() => {
    const dontAsk = checkboxRef.current?.checked ?? false;
    closeDialog(DIALOG_ID);
    const showRouteModes =
      config?.seaRouteGenerationMode !== undefined ||
      config?.landRouteGenerationMode !== undefined ||
      config?.landRouteElevationAversion !== undefined;
    config?.onProceed(
      dontAsk,
      showRouteModes
        ? {
            seaRouteGenerationMode: config?.seaRouteGenerationMode !== undefined ? seaRouteGenerationMode : undefined,
            landRouteGenerationMode:
              config?.landRouteGenerationMode !== undefined ? landRouteGenerationMode : undefined,
            landRouteElevationAversion:
              config?.landRouteElevationAversion !== undefined ? landRouteElevationAversion : undefined
          }
        : undefined
    );
  }, [config, seaRouteGenerationMode, landRouteGenerationMode, landRouteElevationAversion]);

  const handleCancel = useCallback(() => closeDialog(DIALOG_ID), []);

  if (!config) return null;

  const showRouteModes =
    config.seaRouteGenerationMode !== undefined ||
    config.landRouteGenerationMode !== undefined ||
    config.landRouteElevationAversion !== undefined;

  return (
    <Dialog
      isOpen={true}
      title={`Regenerate ${config.featureName}`}
      onClose={handleCancel}
      buttons={[
        { label: "Proceed", onClick: handleProceed },
        { label: "Cancel", onClick: handleCancel }
      ]}
    >
      <div>
        <p>
          Regenerate will remove all the custom changes for the {config.featureName}.
          <br />
          <br />
          Are you sure you want to proceed?
        </p>
        {showRouteModes && (
          <div>
            {config.seaRouteGenerationMode !== undefined && (
              <div>
                <label htmlFor="seaRouteGenerationMode">Sea route connections </label>
                <select
                  id="seaRouteGenerationMode"
                  value={seaRouteGenerationMode}
                  onChange={event =>
                    setSeaRouteGenerationMode(event.target.value === "augmented" ? "augmented" : "legacy")
                  }
                >
                  <option value="augmented">Improved coastal and nearby-port connections</option>
                  <option value="legacy">Previous sparse network (Urquhart)</option>
                </select>
                <p>
                  The improved mode restores nearby Delaunay connections and keeps a separate coastal port backbone.
                </p>
              </div>
            )}
            {config.landRouteGenerationMode !== undefined && (
              <div>
                <label htmlFor="landRouteGenerationMode">Land route pathfinding </label>
                <select
                  id="landRouteGenerationMode"
                  value={landRouteGenerationMode}
                  onChange={event =>
                    setLandRouteGenerationMode(event.target.value === "legacy" ? "legacy" : "elevationAware")
                  }
                >
                  <option value="elevationAware">Prefer valleys (elevation-aware)</option>
                  <option value="legacy">Previous weaker height cost</option>
                </select>
                <p>
                  Elevation-aware mode prefers gentler climbs; mountain passes still connect when no lowland corridor
                  exists. Tune the aversion slider below.
                </p>
              </div>
            )}
            {config.landRouteElevationAversion !== undefined && (
              <div>
                <label htmlFor="landRouteElevationAversion">
                  Route elevation aversion{" "}
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
                <p>
                  0 allows short ridge shortcuts (e.g. ~500&nbsp;m climbs between nearby burgs). 1 is the default.
                  Higher values force longer valley detours. Sole passes still connect when no alternative exists.
                </p>
              </div>
            )}
          </div>
        )}
        {config.showDontAskAgain !== false && (
          <div>
            <input ref={checkboxRef} id="dontAskAgain" className="checkbox" type="checkbox" />
            <label htmlFor="dontAskAgain" className="checkbox-label dontAsk">
              <i>do not ask again</i>
            </label>
          </div>
        )}
      </div>
    </Dialog>
  );
};
