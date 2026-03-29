"use client";

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Analysis } from "@/hooks/useApiData";

const VIRTUAL_THRESHOLD = 100;
const ESTIMATED_ROW_HEIGHT = 280;

interface VirtualizedAnalysisListProps {
  items: Analysis[];
  renderItem: (analysis: Analysis) => React.ReactNode;
  footer?: React.ReactNode;
}

export function VirtualizedAnalysisList({
  items,
  renderItem,
  footer,
}: VirtualizedAnalysisListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 5,
  });

  // Below threshold: render normally (no virtualization overhead)
  if (items.length < VIRTUAL_THRESHOLD) {
    return (
      <div className="space-y-4">
        {items.map((a) => (
          <div key={a.id}>{renderItem(a)}</div>
        ))}
        {footer}
      </div>
    );
  }

  return (
    <div ref={parentRef} className="h-[80vh] overflow-auto">
      <div
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index];
          return (
            <div
              key={item.id}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 w-full pb-4"
              style={{ top: virtualRow.start }}
            >
              {renderItem(item)}
            </div>
          );
        })}
      </div>
      {footer}
    </div>
  );
}
