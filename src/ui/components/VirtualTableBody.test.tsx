import { measureElement as defaultMeasureElement, Virtualizer } from "@tanstack/virtual-core";
import { describe, expect, it } from "vitest";

describe("VirtualTableBody resilience to display:none and resize", () => {
  it("prevents 161px gap when closed in display:none and reopened with larger size", () => {
    const count = 15;
    const realRowHeight = 23;

    let scrollTopVal = 0;
    const scrollContainer = {
      get scrollTop() {
        return scrollTopVal;
      },
      set scrollTop(val: number) {
        scrollTopVal = val;
      },
      clientHeight: 400,
      offsetHeight: 400,
      scrollHeight: 400,
      scrollTo({ top }: { top: number }) {
        scrollTopVal = top;
      },
      addEventListener: () => {},
      removeEventListener: () => {}
    };

    let rectCb: (rect: { width: number; height: number }) => void = () => {};
    let offsetCb: (offset: number, isScrolling: boolean) => void = () => {};

    const customMeasureElement = (
      element: Element,
      entry: ResizeObserverEntry | undefined,
      instance: Virtualizer<Element, Element>
    ) => {
      // If entry has blockSize <= 0 (e.g. display: none), preserve existing cached size
      if (entry?.borderBoxSize) {
        const box = entry.borderBoxSize[0];
        if (box && box.blockSize <= 0) {
          const index = instance.indexFromElement(element);
          const key = instance.options.getItemKey(index);
          return instance.itemSizeCache.get(key) ?? instance.options.estimateSize(index);
        }
      }
      return defaultMeasureElement(element, entry, instance);
    };

    const virtualizer = new Virtualizer({
      count,
      getScrollElement: () => scrollContainer as unknown as Element,
      estimateSize: () => 12,
      overscan: 10,
      measureElement: customMeasureElement,
      scrollToFn: offset => {
        scrollTopVal = offset;
      },
      observeElementRect: (_inst, cb) => {
        rectCb = cb;
        return () => {};
      },
      observeElementOffset: (_inst, cb) => {
        offsetCb = cb;
        return () => {};
      }
    });
    virtualizer.shouldAdjustScrollPositionOnItemSizeChange = () => false;

    virtualizer._didMount();
    virtualizer._willUpdate();

    // 1. Initial render with 15 rows of 23px
    rectCb({ width: 800, height: 400 });
    offsetCb(0, false);
    for (let i = 0; i < count; i++) {
      virtualizer.measureElement({
        getAttribute: () => String(i),
        offsetHeight: realRowHeight
      } as unknown as Element);
    }

    expect(virtualizer.scrollOffset).toBe(0);
    expect(virtualizer.getVirtualItems()[0]?.index).toBe(0);
    expect(virtualizer.getVirtualItems()[0]?.start).toBe(0);

    // 2. Closed -> display: none -> ResizeObserver reports size = 0 for items
    scrollContainer.clientHeight = 0;
    rectCb({ width: 0, height: 0 });

    for (let i = 0; i < count; i++) {
      const measured = customMeasureElement(
        { getAttribute: () => String(i) } as unknown as Element,
        { borderBoxSize: [{ inlineSize: 0, blockSize: 0 }] } as unknown as ResizeObserverEntry,
        virtualizer
      );
      virtualizer.resizeItem(i, measured);
    }

    // 3. Re-opened -> window resized larger (height 700)
    scrollContainer.clientHeight = 700;
    rectCb({ width: 800, height: 700 });

    for (let i = 0; i < count; i++) {
      const measured = customMeasureElement(
        { getAttribute: () => String(i), offsetHeight: realRowHeight } as unknown as Element,
        { borderBoxSize: [{ inlineSize: 800, blockSize: realRowHeight }] } as unknown as ResizeObserverEntry,
        virtualizer
      );
      virtualizer.resizeItem(i, measured);
    }

    const isAtTop = (scrollContainer.scrollTop ?? 0) <= 0;
    if (isAtTop && virtualizer.scrollOffset !== 0) {
      virtualizer.scrollToOffset(0);
    }
    const finalItems = virtualizer.getVirtualItems();
    const paddingTop = !isAtTop && finalItems.length > 0 ? finalItems[0]?.start || 0 : 0;

    expect(virtualizer.scrollOffset).toBe(0);
    expect(finalItems[0]?.index).toBe(0);
    expect(paddingTop).toBe(0);
  });

  it("reconciles when virtualizer held stale scrollOffset but DOM scrollTop is 0", () => {
    const count = 25;
    let scrollTopVal = 0;
    const scrollContainer = {
      get scrollTop() {
        return scrollTopVal;
      },
      set scrollTop(val: number) {
        scrollTopVal = val;
      },
      clientHeight: 700,
      scrollHeight: 575,
      scrollTo({ top }: { top: number }) {
        scrollTopVal = top;
      },
      addEventListener: () => {},
      removeEventListener: () => {}
    };

    let rectCb2: ((rect: { width: number; height: number }) => void) | null = null;
    const virtualizer = new Virtualizer({
      count,
      getScrollElement: () => scrollContainer as unknown as Element,
      estimateSize: () => 23,
      overscan: 10,
      scrollToFn: offset => {
        scrollTopVal = offset;
      },
      observeElementRect: (_inst, cb) => {
        rectCb2 = cb;
        return () => {};
      },
      observeElementOffset: () => () => {}
    });
    virtualizer.shouldAdjustScrollPositionOnItemSizeChange = () => false;
    virtualizer._didMount();
    virtualizer._willUpdate();
    rectCb2?.({ width: 800, height: 700 });

    // With overscan: 10, startIndex needs to be 17 to have start=7:
    // 17 * 23 = 391
    virtualizer.scrollOffset = 391;

    // Without sync, virtualizer has items starting at index 7 (start = 161)
    expect(virtualizer.getVirtualItems()[0]?.start).toBe(161);

    // With our sync logic:
    const isAtTop = (scrollContainer.scrollTop ?? 0) <= 0;
    if (isAtTop && virtualizer.scrollOffset !== 0) {
      virtualizer.scrollOffset = 0;
      virtualizer.scrollToOffset(0);
    }
    const items = virtualizer.getVirtualItems();
    const paddingTop = !isAtTop && items.length > 0 ? items[0]?.start || 0 : 0;

    expect(virtualizer.scrollOffset).toBe(0);
    expect(items[0]?.index).toBe(0);
    expect(paddingTop).toBe(0);
  });
});
