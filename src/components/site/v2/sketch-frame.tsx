"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A page shown small, at a fixed screen size: an iframe laid out `width` by
 * `height` pixels and scaled to the box it is given. The index of hero
 * sketches uses it, so each sketch is seen as a 1440-wide or 375-wide screen
 * would show it, with its own styles, fonts and breakpoints, whatever the
 * width of the index page.
 *
 * Before script runs the iframe simply fills the box, unscaled.
 */
export function SketchFrame({ src, title, width, height }: { src: string; title: string; width: number; height: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el || !("ResizeObserver" in window)) return;
    const observer = new ResizeObserver(() => setScale(el.clientWidth / width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [width]);

  return (
    <div ref={box} className="relative overflow-hidden" style={{ aspectRatio: `${width} / ${height}` }}>
      <iframe
        src={src}
        title={title}
        className="absolute left-0 top-0 border-0"
        style={scale === null ? { width: "100%", height: "100%" } : { width, height, transform: `scale(${scale})`, transformOrigin: "0 0" }}
      />
    </div>
  );
}
