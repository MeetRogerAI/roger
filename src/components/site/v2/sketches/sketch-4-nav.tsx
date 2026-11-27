"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * The header of hero sketch 4. It takes the colour of whichever part of the
 * world is under it: sky over the hero, brick over the wall. Each section
 * names its part with data-sk4-zone. With no script it stays the sky's colour,
 * which has its own ground and reads over either part.
 */
export function Sketch4Nav({ children }: { children: ReactNode }) {
  const [zone, setZone] = useState("sky");

  useEffect(() => {
    const sections = [...document.querySelectorAll<HTMLElement>("[data-sk4-zone]")];
    let frame = 0;
    const read = () => {
      frame = 0;
      // The section that has reached the header's foot. A link to a section stops it 72px down (scroll-padding-top), which counts.
      let under = sections[0]?.dataset.sk4Zone ?? "sky";
      for (const section of sections) if (section.getBoundingClientRect().top <= 80) under = section.dataset.sk4Zone ?? under;
      setZone(under);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <header className="sk4-nav" data-zone={zone}>
      {children}
    </header>
  );
}
