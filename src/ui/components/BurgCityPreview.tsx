import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { generationPhaseLabel } from "../../city-editor/core/generationDiagnostics";
import { burgEditorActions } from "../../controllers/burg-editor";
import { getBurgSiteDescriptor } from "../../services/burgSiteDescriptor";
import type { BurgData } from "../../store/burgEditorState";
import { CityPreviewViewport } from "./CityPreviewViewport";

export function BurgCityPreview({ burgData }: { burgData: BurgData }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const imageTiming = useRef<{
    url: string;
    started: number;
    imageStarted: number;
    timings: Record<string, number>;
  } | null>(null);

  const [progress, setProgress] = useState<
    import("../../city-editor/core/generationDiagnostics").GenerationSample | null
  >(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  useEffect(() => {
    try {
      const began = performance.now();
      const site = getBurgSiteDescriptor(burgData.id);
      if (!site) throw new Error("Missing city site");
      setSnapshot(
        JSON.stringify({ site, generator: "castle-city-v1", preview: 1, buildingPattern: "legacy", attempt })
      );
      console.debug("[City preview] descriptor", { elapsedMs: performance.now() - began });
    } catch (error) {
      console.error("[City preview] Cannot build descriptor", error);
      setSnapshot(null);
      setUrl(null);
      imageTiming.current = null;
      setFailed(true);
    }
  }, [burgData, attempt]);

  // Stable generation input, independent of the BurgData object's identity.
  useEffect(() => {
    if (snapshot === null) return;
    const inputSnapshot = snapshot;
    let disposed = false;
    let imageUrl: string | undefined;
    let cancel: (() => void) | undefined;
    setUrl(null);
    setFailed(false);
    setProgress(null);
    const started = performance.now();
    const timings: Record<string, number> = {};

    async function generate() {
      const [
        { parseDescriptor, shareFromDescriptor },
        { createGridDocument, descriptorFrameGridOptions },
        { defaultGenerationSettings },
        { startCityGeneration },
        { serializeCityPreviewSvg }
      ] = await Promise.all([
        import("../../city-editor/io/incomingCity"),
        import("../../city-editor/core/document"),
        import("../../city-editor/core/generate"),
        import("../../city-editor/core/generationWorkerClient"),
        import("../../city-editor/render/previewSvg")
      ]);
      if (disposed) return;
      const inputStarted = performance.now();
      const descriptor = parseDescriptor(JSON.stringify(JSON.parse(inputSnapshot).site));
      if (!descriptor) throw new Error("Missing city site");
      const share = shareFromDescriptor(descriptor);
      timings.input = performance.now() - inputStarted;
      const gridStarted = performance.now();
      const document = createGridDocument({
        size: share.size,
        grid: share.grid,
        seed: share.gridSeed ?? share.seed,
        hexSizeMeters: share.hexSizeMeters,
        patchParams: share.patchParams,
        ...(share.descriptor
          ? descriptorFrameGridOptions(
              share.descriptor.frame,
              share.descriptor.burg.waterAccess?.port.river === true,
              share.descriptor.burg.riverPlacement?.bankDistanceMeters
            )
          : {}),
        measureBlockSize: share.measureBlockSize === true
      });
      if (disposed) return;
      timings.grid = performance.now() - gridStarted;
      const workerStarted = performance.now();
      const samples: import("../../city-editor/core/generationDiagnostics").GenerationSample[] = [];
      const { logGenerationFailures } = await import("../../city-editor/core/generationDiagnostics");
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
        sample => {
          if (disposed) return;
          samples.push(sample);
          if (sample.failure && timings.firstFailure === undefined) timings.firstFailure = performance.now() - started;
          setProgress(sample);
        },
        undefined,
        undefined,
        measured => Object.assign(timings, measured)
      );
      cancel = job.cancel;
      const city = await job.result;
      if (disposed) return;
      timings.worker = performance.now() - workerStarted;
      if (!city) {
        logGenerationFailures(samples, { mode: "preview", seed: share.seed });
        throw new Error("City generation failed");
      }
      if (samples.some(sample => sample.failure))
        console.debug(
          "[City preview] rejected attempts",
          samples.filter(sample => sample.failure)
        );
      const svgStarted = performance.now();
      const svg = serializeCityPreviewSvg(city);
      timings.svg = performance.now() - svgStarted;
      timings.total = performance.now() - started;
      console.debug("[City preview] timings", {
        ...timings,
        cells: Object.keys(city.mesh.faces).length,
        svgBytes: new Blob([svg]).size,
        symbols: (svg.match(/data-preview-block=/g) ?? []).length
      });
      imageUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      imageTiming.current = { url: imageUrl, started, imageStarted: performance.now(), timings };
      setUrl(imageUrl);
    }
    void generate().catch(error => {
      if (!disposed) {
        console.error("[City preview] Generation failed", error);
        setFailed(true);
      }
    });
    return () => {
      disposed = true;
      cancel?.();
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [snapshot]);

  return (
    <div id="burgCityPreview" style={{ width: "min(640px, 75vw)" }}>
      {url ? (
        <>
          <p>{t("dialogs.burgEditor.previewSimplified")}</p>
          <CityPreviewViewport
            url={url}
            alt={t("dialogs.burgEditor.previewAriaLabel")}
            onLoad={() => {
              const measured = imageTiming.current;
              if (measured?.url === url)
                console.debug("[City preview] image-ready", {
                  ...measured.timings,
                  imageMs: performance.now() - measured.imageStarted,
                  totalMs: performance.now() - measured.started
                });
            }}
            onError={() => {
              if (imageTiming.current?.url === url) {
                URL.revokeObjectURL(url);
                imageTiming.current = null;
                setUrl(null);
                setFailed(true);
              }
            }}
          />
        </>
      ) : (
        <p role="status">
          {t(failed ? "dialogs.burgEditor.previewError" : "dialogs.burgEditor.previewLoading")}
          {!failed && progress
            ? ` · ${t("dialogs.burgEditor.previewProgress", { attempt: progress.attempt, phase: generationPhaseLabel(progress.phase), retry: progress.failure ? t("dialogs.burgEditor.previewRetrying") : "" })}`
            : ""}
        </p>
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
