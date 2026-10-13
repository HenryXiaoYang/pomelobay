/**
 * Lenis smooth scrolling, plus section snapping on pages that opt in.
 *
 * Snapping is opt-in per element via `data-snap-section`, because only the
 * homepage is built from viewport-sized sections. On a long post, snapping
 * would yank the reader away from the paragraph they were on.
 *
 * Snap type is "proximity", not "mandatory" or "lock": a section taller than
 * the viewport (About on a phone) has to stay readable mid-way, so the page
 * only settles onto a section when a scroll comes to rest near its edge.
 *
 * Under prefers-reduced-motion none of this runs and the page keeps native
 * scrolling. That is decided once at load: Lenis can't be swapped out
 * cleanly mid-session, and the preference rarely changes while a page is open.
 */

import Lenis from "lenis";
import Snap from "lenis/snap";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/** Exponential ease-out: quick to respond, long soft landing. */
const easeOutExpo = (t: number): number =>
  t === 1 ? 1 : 1 - Math.pow(2, -10 * t);

let activeLenis: Lenis | null = null;

/** The page's Lenis instance, or null under reduced motion (native scroll). */
export function getLenis(): Lenis | null {
  return activeLenis;
}

export function initSmoothScroll(): void {
  if (window.matchMedia(REDUCED_MOTION).matches) return;

  const lenis = new Lenis({
    // Lenis runs its own frame loop. GSAP is not part of this bundle - it is
    // a chunk loaded only on pages with scroll-linked motion - so the motion
    // chunk hooks ScrollTrigger to this instance when it arrives (motion.ts).
    autoRaf: true,
    lerp: 0.1,
    // In-page links (a menu item pointing at /#about) glide instead of jump
    anchors: true,
    // Halo's search popup is a web component with its own scroll area.
    // Lenis walks the composed path, so this reaches into its shadow root.
    prevent: (node) => node.localName === "search-modal",
  });
  activeLenis = lenis;

  const sections = Array.from(
    document.querySelectorAll<HTMLElement>("[data-snap-section]"),
  );
  if (sections.length === 0) return;

  const snap = new Snap(lenis, {
    type: "proximity",
    duration: 1.1,
    easing: easeOutExpo,
    debounce: 250,
  });

  sections.forEach((section) => {
    // The first section sits under the sticky header, so its element top is
    // 4rem down the page. Snapping there would park the header over the
    // section; the true resting point is the top of the document.
    if (section.offsetTop <= window.innerHeight * 0.25) {
      snap.add(0);
    } else {
      snap.addElement(section, { align: "start" });
    }
  });

  // Let the page come to rest at the very bottom too, otherwise a proximity
  // snap near the last section would pull back from the footer.
  const footer = document.querySelector<HTMLElement>("body > footer");
  if (footer) snap.addElement(footer, { align: "end" });
}
