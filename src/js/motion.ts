/**
 * The homepage's scroll-linked motion, on GSAP + ScrollTrigger.
 *
 * One material idea carries it: this is a printed page. The paper changes
 * through a dot screen (paper.ts); photos arrive the same way - pressed in
 * through a halftone whose dots grow until they merge into the picture - and
 * the Challenges pictogram counts its people in one at a time, so "4 in 10"
 * reads as a count rather than a picture of one.
 *
 * This module and GSAP are a separate chunk, imported by main.ts only on
 * pages that have something to animate, so posts and archives never
 * download them.
 *
 * Everything here runs once per element and lives inside a single
 * gsap.matchMedia context for prefers-reduced-motion: no-preference. Under
 * "reduce" none of it is created, so the page simply renders as authored;
 * without JS the same is true. Nothing is hidden by CSS ahead of time.
 */

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { getLenis } from "./smooth-scroll";

gsap.registerPlugin(ScrollTrigger);

// Smooth scroll moves the page on its own frame loop; tell ScrollTrigger on
// every Lenis frame so triggers fire on the frame the content gets there.
getLenis()?.on("scroll", ScrollTrigger.update);

export { gsap, ScrollTrigger };

export const MOTION_OK = "(prefers-reduced-motion: no-preference)";

/** Dot ruling of the photo screen, in CSS px. Matches the paper's feel at a slightly finer pitch, since it sits on a picture. */
const PRINT_PITCH = 7;
/** Radius at which a dot covers its cell corner to corner (half the diagonal), plus a hair so no seams survive. */
const PRINT_FULL = (PRINT_PITCH * Math.SQRT2) / 2 + 0.3;

/**
 * Photos print in. The mask is a repeating radial dot whose radius is a CSS
 * variable; GSAP tweens the variable from 0 (nothing printed) to full
 * coverage, then the mask is removed so the photo is a plain image again.
 * power2.out on the radius keeps the coverage (which grows with r squared)
 * arriving at a steady rate instead of rushing at the end.
 */
function printPhotos(): () => void {
  const photos = gsap.utils.toArray<HTMLImageElement>("img[data-print]");

  const unmask = (photo: HTMLElement): void => {
    photo.classList.remove("print-mask");
    photo.style.removeProperty("--print-r");
    photo.style.removeProperty("--print-pitch");
  };

  /**
   * Resolves once the photo can actually be shown. On a slow connection the
   * trigger can fire before a lazy image has arrived; printing dots over an
   * empty box and then popping the picture in solid would undo the effect.
   * A photo that fails to load is never masked: the browser's broken-image
   * state and its alt text must stay readable.
   */
  const ready = (photo: HTMLImageElement): Promise<boolean> => {
    if (photo.complete) return Promise.resolve(photo.naturalWidth > 0);
    return new Promise((resolve) => {
      photo.addEventListener("load", () => resolve(true), { once: true });
      photo.addEventListener("error", () => resolve(false), { once: true });
    });
  };

  photos.forEach((photo) => {
    // A photo already known to be broken is left alone
    if (photo.complete && photo.naturalWidth === 0) return;

    photo.style.setProperty("--print-pitch", `${PRINT_PITCH}px`);
    photo.classList.add("print-mask");

    const tween = gsap.fromTo(
      photo,
      { "--print-r": "0px" },
      {
        "--print-r": `${PRINT_FULL}px`,
        duration: 1.1,
        ease: "power2.out",
        paused: true,
        onComplete: () => unmask(photo),
      },
    );

    ScrollTrigger.create({
      trigger: photo,
      start: "top 82%",
      once: true,
      onEnter: () => {
        void ready(photo).then((ok) => {
          if (ok) {
            tween.play();
          } else {
            tween.kill();
            unmask(photo);
          }
        });
      },
    });

    // A load failure before the trigger: unmask right away, no dots ever
    photo.addEventListener(
      "error",
      () => {
        tween.kill();
        unmask(photo);
      },
      { once: true },
    );
  });

  return () => photos.forEach(unmask);
}

/**
 * The pictogram counts in: the highlighted figures start as outlines like the
 * rest and fill one after another. Fill is the meaning here (the template
 * already separates counted from uncounted by fill AND opacity), so that is
 * what moves.
 */
function countPictogram(): void {
  const pictogram = document.querySelector<HTMLElement>("[data-pictogram]");
  if (!pictogram) return;
  const counted = pictogram.querySelectorAll<SVGElement>("svg.fill-current");
  if (counted.length === 0) return;

  gsap.fromTo(
    counted,
    { fillOpacity: 0, opacity: 0.35 },
    {
      fillOpacity: 1,
      opacity: 1,
      duration: 0.4,
      ease: "power2.out",
      stagger: 0.16,
      scrollTrigger: { trigger: pictogram, start: "top 78%", once: true },
      clearProps: "fillOpacity,opacity",
    },
  );
}

export function initMotion(): void {
  gsap.matchMedia().add(MOTION_OK, () => {
    const undoPrint = printPhotos();
    countPictogram();
    // matchMedia reverts the tweens itself; the classes are ours to undo
    return undoPrint;
  });
}
