import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

export function CityPreviewViewport({
  url,
  alt,
  onLoad,
  onError
}: {
  url: string;
  alt: string;
  onLoad?: () => void;
  onError?: () => void;
}) {
  const { t } = useTranslation();
  const viewport = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const reset = useRef(() => {});

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new image must reset the viewport and its gestures.
  useEffect(() => {
    const frame = viewport.current;
    const img = image.current;
    if (!frame || !img) return;
    let scale = 1;
    let x = 0;
    let y = 0;
    let drag: { id: number; x: number; y: number } | null = null;
    let animation = 0;
    const paint = () => {
      cancelAnimationFrame(animation);
      animation = requestAnimationFrame(() => {
        img.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
      });
    };
    reset.current = () => {
      scale = 1;
      x = y = 0;
      paint();
    };
    reset.current();
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = frame.getBoundingClientRect();
      const px = event.clientX - rect.left - rect.width / 2;
      const py = event.clientY - rect.top - rect.height / 2;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
      const next = Math.min(16, Math.max(0.5, scale * Math.exp(-delta * 0.002)));
      x = px - (px - x) * (next / scale);
      y = py - (py - y) * (next / scale);
      scale = next;
      paint();
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || drag) return;
      event.preventDefault();
      event.stopPropagation();
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      frame.setPointerCapture(event.pointerId);
      frame.style.cursor = "grabbing";
    };
    const move = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.id) return;
      x += event.clientX - drag.x;
      y += event.clientY - drag.y;
      drag.x = event.clientX;
      drag.y = event.clientY;
      paint();
    };
    const end = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.id) return;
      drag = null;
      if (frame.hasPointerCapture(event.pointerId)) frame.releasePointerCapture(event.pointerId);
      frame.style.cursor = "grab";
    };
    frame.addEventListener("wheel", wheel, { passive: false });
    frame.addEventListener("pointerdown", down);
    frame.addEventListener("pointermove", move);
    frame.addEventListener("pointerup", end);
    frame.addEventListener("pointercancel", end);
    frame.addEventListener("lostpointercapture", end);
    return () => {
      cancelAnimationFrame(animation);
      frame.removeEventListener("wheel", wheel);
      frame.removeEventListener("pointerdown", down);
      frame.removeEventListener("pointermove", move);
      frame.removeEventListener("pointerup", end);
      frame.removeEventListener("pointercancel", end);
      frame.removeEventListener("lostpointercapture", end);
    };
  }, [url]);

  return (
    <>
      <div
        ref={viewport}
        style={{
          height: "min(640px, 60vh)",
          overflow: "hidden",
          cursor: "grab",
          touchAction: "none",
          background: "#d5cfbf"
        }}
      >
        <img
          onLoad={onLoad}
          onError={onError}
          ref={image}
          src={url}
          alt={alt}
          draggable={false}
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            objectFit: "contain",
            transformOrigin: "center",
            userSelect: "none",
            pointerEvents: "none"
          }}
        />
      </div>
      <span>{t("dialogs.burgEditor.previewNavigation")}</span>{" "}
      <button type="button" onClick={() => reset.current()}>
        {t("dialogs.burgEditor.previewReset")}
      </button>
    </>
  );
}
