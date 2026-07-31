import { useVirtualizer } from "@tanstack/react-virtual";
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
    overscan: 10
  });

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

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0]?.start || 0 : 0;
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
