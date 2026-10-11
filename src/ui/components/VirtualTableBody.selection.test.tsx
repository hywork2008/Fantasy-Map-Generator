import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { VirtualTableBody } from "./VirtualTableBody";

const virtualizer = vi.hoisted(() => ({
  scrollToIndex: vi.fn(),
  scrollToOffset: vi.fn(),
  getVirtualItems: () => [{ index: 0, start: 0, end: 12, key: 0 }],
  getTotalSize: () => 1200,
  measureElement: vi.fn(),
  scrollOffset: 0,
  shouldAdjustScrollPositionOnItemSizeChange: undefined
}));
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: () => virtualizer,
  measureElement: vi.fn()
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("reveals an unmounted selected row and follows a changed target", async () => {
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const scrollRef = createRef<HTMLDivElement>();
  const items = Array.from({ length: 100 }, (_, id) => id);
  const render = (index: number) => (
    <div ref={scrollRef}>
      <table>
        <VirtualTableBody
          items={items}
          scrollElementRef={scrollRef}
          scrollToIndex={index}
          renderRow={id => (
            <tr>
              <td>{id}</td>
            </tr>
          )}
        />
      </table>
    </div>
  );
  const flushFrames = () => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach(callback => {
      callback(0);
    });
  };
  try {
    await act(async () => root.render(render(80)));
    expect(host.querySelectorAll("td")[0]?.textContent).toBe("0");
    await act(async () => flushFrames());
    expect(virtualizer.scrollToIndex).toHaveBeenLastCalledWith(80, { align: "center", behavior: "auto" });

    await act(async () => root.render(render(40)));
    await act(async () => flushFrames());
    expect(virtualizer.scrollToIndex).toHaveBeenLastCalledWith(40, { align: "center", behavior: "auto" });

    virtualizer.scrollToIndex.mockClear();
    await act(async () => root.render(render(-1)));
    await act(async () => flushFrames());
    expect(virtualizer.scrollToIndex).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
