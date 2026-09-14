import { measureElement as defaultMeasureElement, useVirtualizer } from "@tanstack/react-virtual";
import React, { useEffect, useState } from "react";

export interface VirtualTableBodyProps<T> {
  items: T[];
  scrollElementRef: React.RefObject<Element | null>;
  estimateSize?: number;
  renderRow: (item: T, index: number) => React.ReactNode;
}

export function VirtualTableBody<T>({
  items,
  scrollElementRef,
  // .fmg-table td has padding: 0 and line-height: 0.9, so a real row renders at
  // ~12px (13px font × 0.9), not the ~28px a generic default would suggest. A
  // guess this far off makes rows appear to gain/lose count while scrolling
  // into not-yet-measured territory, since freshly-scrolled-to rows still use
  // the stale estimate until they're individually measured.
  estimateSize = 12,
  renderRow
}: VirtualTableBodyProps<T>) {
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: () => estimateSize,
    overscan: 10,
    measureElement: (element, entry, instance) => {
      // If entry has blockSize <= 0 (e.g. element is inside display: "none" container or not laid out),
      // do not overwrite any previously recorded valid size with 0.
      if (entry?.borderBoxSize) {
        const box = entry.borderBoxSize[0];
        if (box && box.blockSize <= 0) {
          const index = instance.indexFromElement(element);
          const key = instance.options.getItemKey(index);
          return instance.itemSizeCache.get(key) ?? instance.options.estimateSize(index);
        }
      }
      return defaultMeasureElement(element, entry, instance);
    }
  });

  // Table rows in overview dialogs are static list items and do not need reverse-scroll dynamic anchoring
  // (which causes phantom scroll offsets when items grow from 0 inside display:none to their real size).
  rowVirtualizer.shouldAdjustScrollPositionOnItemSizeChange = () => false;

  // On a fresh mount (a dialog opening for the first time rather than being
  // revealed from a persistent, already-mounted hidden state), the virtualizer's
  // own post-mount re-render can get dropped, leaving the body permanently
  // empty until an unrelated state update elsewhere happens to force a render.
  // Forcing one extra render right after mount reliably picks up the
  // measurement the virtualizer already computed internally.
  const [, forceRenderAfterMount] = useState(0);
  useEffect(() => {
    forceRenderAfterMount(n => n + 1);
  }, []);

  const scrollElement = scrollElementRef.current;
  const isAtTop = (scrollElement?.scrollTop ?? 0) <= 0;
  if (isAtTop && rowVirtualizer.scrollOffset !== 0) {
    rowVirtualizer.scrollOffset = 0;
    rowVirtualizer.scrollToOffset(0);
  }

  const virtualItems = rowVirtualizer.getVirtualItems();
  // When at the top (scrollTop <= 0), there must never be a top spacer.
  const paddingTop = !isAtTop && virtualItems.length > 0 ? virtualItems[0]?.start || 0 : 0;
  const paddingBottom =
    virtualItems.length > 0 ? rowVirtualizer.getTotalSize() - (virtualItems[virtualItems.length - 1]?.end || 0) : 0;

  return (
    <tbody>
      {paddingTop > 0 && (
        <tr>
          <td style={{ height: paddingTop, padding: 0, border: 0, margin: 0 }} colSpan={100} />
        </tr>
      )}
      {virtualItems.map(virtualRow => {
        const item = items[virtualRow.index];
        const rowNode = renderRow(item, virtualRow.index);

        if (React.isValidElement(rowNode)) {
          return React.cloneElement(
            rowNode as React.ReactElement<{
              ref?: React.Ref<Element> | null;
              "data-index"?: number;
              key?: React.Key | null;
            }>,
            {
              ref: rowVirtualizer.measureElement,
              "data-index": virtualRow.index,
              key: rowNode.key ?? virtualRow.key
            }
          );
        }
        return null;
      })}
      {paddingBottom > 0 && (
        <tr>
          <td style={{ height: paddingBottom, padding: 0, border: 0, margin: 0 }} colSpan={100} />
        </tr>
      )}
    </tbody>
  );
}
