import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { burgEditorActions } from "../../controllers/burg-editor";
import { getBurgSiteDescriptor } from "../../services/burgSiteDescriptor";
import type { BurgData } from "../../store/burgEditorState";

export function BurgCityPreview({ burgData }: { burgData: BurgData }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt explicitly restarts a failed generation.
  useEffect(() => {
    let disposed = false;
    let imageUrl: string | undefined;
    let cancel: (() => void) | undefined;
    setUrl(null);
    setFailed(false);

    async function generate() {
      const [
        { parseDescriptor, shareFromDescriptor },
        { createGridDocument },
        { defaultGenerationSettings },
        { startCityGeneration },
        { serializeCitySvg }
      ] = await Promise.all([
        import("../../city-editor/io/incomingCity"),
        import("../../city-editor/core/document"),
        import("../../city-editor/core/generate"),
        import("../../city-editor/core/generationWorkerClient"),
        import("../../city-editor/render/svg")
      ]);
      if (disposed) return;
      const site = getBurgSiteDescriptor(burgData.id);
      const descriptor = site && parseDescriptor(JSON.stringify(site));
      if (!descriptor) throw new Error("Missing city site");
      const share = shareFromDescriptor(descriptor);
      const document = createGridDocument({
        size: share.size,
        grid: share.grid,
        seed: share.gridSeed ?? share.seed,
        hexSizeMeters: share.hexSizeMeters,
        patchParams: share.patchParams,
        extentMeters: share.descriptor?.frame.extentMeters,
        cityRadiusMeters: share.descriptor?.frame.cityRadiusMeters,
        measureBlockSize: share.measureBlockSize === true
      });
      if (disposed) return;
      const job = startCityGeneration(
        {
          document,
          seed: share.seed,
          settings: {
            ...defaultGenerationSettings(),
            buildingPattern: "legacy",
            ...share.settings,
            descriptor: share.descriptor
          }
        },
        () => {}
      );
      cancel = job.cancel;
      const city = await job.result;
      if (disposed) return;
      if (!city) throw new Error("City generation failed");
      imageUrl = URL.createObjectURL(new Blob([serializeCitySvg(city)], { type: "image/svg+xml" }));
      setUrl(imageUrl);
    }
    void generate().catch(() => {
      if (!disposed) setFailed(true);
    });
    return () => {
      disposed = true;
      cancel?.();
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [burgData, attempt]);

  return (
    <div id="burgCityPreview" style={{ width: "min(640px, 75vw)" }}>
      {url ? (
        <img
          src={url}
          alt={t("dialogs.burgEditor.previewAriaLabel")}
          style={{ display: "block", width: "100%", maxHeight: "65vh", objectFit: "contain" }}
        />
      ) : (
        <p role="status">{t(failed ? "dialogs.burgEditor.previewError" : "dialogs.burgEditor.previewLoading")}</p>
      )}
      {failed && (
        <button type="button" onClick={() => setAttempt(value => value + 1)}>
          {t("dialogs.burgEditor.previewRetry")}
        </button>
      )}
      <button type="button" onClick={() => burgEditorActions.openCityEditor()}>
        {t("dialogs.burgEditor.previewCityEditor")}
      </button>
    </div>
  );
}
