import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { CityPreviewViewport } from "./CityPreviewViewport";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

it("zooms around the cursor, prevents page scrolling, and resets the view", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<CityPreviewViewport url="blob:test" alt="city" />));
    const frame = host.querySelector("div")!;
    const image = host.querySelector("img")!;
    vi.spyOn(frame, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 400, height: 400 } as DOMRect);
    const wheel = new WheelEvent("wheel", { deltaY: -100, clientX: 300, clientY: 200, cancelable: true });
    frame.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(image.style.transform).toContain(`scale(${Math.exp(0.2)})`);
    expect(image.style.transform).toContain(`translate(${100 - 100 * Math.exp(0.2)}px, 0px)`);
    frame.setPointerCapture = vi.fn();
    frame.hasPointerCapture = vi.fn(() => true);
    frame.releasePointerCapture = vi.fn();
    const pointer = (type: string, clientX: number, clientY: number) => {
      const event = new MouseEvent(type, { button: 0, clientX, clientY, cancelable: true });
      Object.defineProperty(event, "pointerId", { value: 1 });
      frame.dispatchEvent(event);
    };
    pointer("pointerdown", 20, 30);
    pointer("pointermove", 60, 80);
    expect(image.style.transform).toContain(`translate(${100 - 100 * Math.exp(0.2) + 40}px, 50px)`);
    pointer("pointerup", 60, 80);
    pointer("pointermove", 100, 100);
    expect(image.style.transform).toContain(", 50px)");
    expect(frame.releasePointerCapture).toHaveBeenCalledWith(1);
    host.querySelector("button")!.click();
    expect(image.style.transform).toBe("translate(0px, 0px) scale(1)");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
