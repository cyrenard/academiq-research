import React, { useState, useEffect, useRef, UIEvent, ReactNode } from 'react';

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  renderItem: (item: T, index: number) => ReactNode;
  containerHeight?: string | number;
  className?: string;
}

export function VirtualList<T>({
  items,
  itemHeight,
  renderItem,
  containerHeight = '100%',
  className = ''
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeightPx, setContainerHeightPx] = useState(400);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Set initial container height
    setContainerHeightPx(el.clientHeight);

    // Watch for container resize
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeightPx(entry.contentRect.height || el.clientHeight);
      }
    });

    resizeObserver.observe(el);
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  };

  const totalHeight = items.length * itemHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - 2); // 2 items buffer
  const endIndex = Math.min(
    items.length,
    Math.ceil((scrollTop + containerHeightPx) / itemHeight) + 2 // 2 items buffer
  );

  const visibleItems = items.slice(startIndex, endIndex);
  const offsetY = startIndex * itemHeight;

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={`overflow-y-auto ${className}`}
      style={{ height: containerHeight, position: 'relative' }}
    >
      <div style={{ height: totalHeight, width: '100%', position: 'relative' }}>
        <div
          style={{
            transform: `translate3d(0, ${offsetY}px, 0)`,
            left: 0,
            right: 0,
            top: 0,
            position: 'absolute',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px' // preserves flex-gap if used
          }}
        >
          {visibleItems.map((item, index) => renderItem(item, startIndex + index))}
        </div>
      </div>
    </div>
  );
}
