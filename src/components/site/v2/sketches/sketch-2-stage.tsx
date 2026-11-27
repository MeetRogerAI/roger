"use client";

import { useEffect } from "react";

/**
 * Stages the brick rail of hero sketch 2: a week of bricks arrives as its part
 * of the story comes up the screen. The markup is the finished picture, three
 * weeks in place. This only runs where motion is allowed, and it marks the
 * sketch "is-staged" itself, so with no script or with reduced motion nothing
 * is ever hidden. A week that has arrived stays.
 */
export function Sketch2Stage() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('[data-sketch="2"]');
    if (!root || !("IntersectionObserver" in window)) return;
    if (!window.matchMedia("(prefers-reduced-motion: no-preference)").matches) return;

    const parts = [...root.querySelectorAll<HTMLElement>("[data-sk2-week]")];
    let shown = 1;
    const show = (week: number) => {
      if (week <= shown) return;
      shown = week;
      root.dataset.week = String(week);
    };
    // A page opened part-way down already has the weeks above it.
    for (const part of parts) if (part.getBoundingClientRect().top < window.innerHeight * 0.6) shown = Math.max(shown, Number(part.dataset.sk2Week));
    root.dataset.week = String(shown);
    root.classList.add("is-staged");

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) show(Number((entry.target as HTMLElement).dataset.sk2Week));
      },
      { rootMargin: "0px 0px -40% 0px", threshold: 0.2 },
    );
    for (const part of parts) io.observe(part);
    return () => {
      io.disconnect();
      root.classList.remove("is-staged");
      delete root.dataset.week;
    };
  }, []);
  return null;
}
