/**
 * Autoplay + arrow controls layered on top of daisyUI's `carousel`.
 *
 * The scrolling itself is daisyUI/CSS: `.carousel` is scroll-snap with
 * `scroll-behavior: smooth`, which already gives native touch swiping and
 * respects prefers-reduced-motion. This file only adds what CSS can't do -
 * timed advance, arrows, and a pause control.
 *
 * Hard accessibility requirement (WCAG 2.2.2): auto-advancing content must be
 * pausable, so the pause button is not optional. Autoplay is also skipped
 * entirely under prefers-reduced-motion.
 */

import { initPaper } from "./paper";
import { initSmoothScroll } from "./smooth-scroll";

type Direction = -1 | 1;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

class HeroCarousel {
  private readonly root: HTMLElement;
  private readonly slides: readonly HTMLElement[];
  private readonly toggle: HTMLButtonElement | null;
  private readonly intervalMs: number;

  private timer: number | null = null;
  private paused = false;
  /** Off-screen carousels don't autoplay: no smooth-scroll or image decode
   *  work every few seconds while the reader is further down the page. */
  private onScreen = true;

  constructor(root: HTMLElement) {
    this.root = root;
    this.slides = Array.from(
      root.querySelectorAll<HTMLElement>("[data-carousel-slide]"),
    );

    // Controls live outside the scroll container so they don't scroll away
    const scope = root.parentElement ?? root;
    this.toggle = scope.querySelector<HTMLButtonElement>("[data-carousel-toggle]");

    const raw = Number(root.dataset["interval"] ?? "0");
    this.intervalMs = Number.isFinite(raw) && raw > 0 ? raw * 1000 : 0;

    this.bind(scope);
    this.start();
  }

  /** Index derived from scroll position, so a manual swipe stays in sync. */
  private get index(): number {
    const width = this.root.clientWidth;
    if (width === 0) return 0;
    return Math.round(this.root.scrollLeft / width);
  }

  private bind(scope: HTMLElement): void {
    scope
      .querySelector<HTMLButtonElement>("[data-carousel-prev]")
      ?.addEventListener("click", () => this.step(-1));

    scope
      .querySelector<HTMLButtonElement>("[data-carousel-next]")
      ?.addEventListener("click", () => this.step(1));

    this.toggle?.addEventListener("click", () => {
      this.paused = !this.paused;
      if (this.paused) {
        this.stop();
      } else {
        this.start();
      }
      this.syncToggle();
    });

    // Pause while the pointer is over it or focus is inside it
    scope.addEventListener("pointerenter", () => this.stop());
    scope.addEventListener("pointerleave", () => this.start());
    scope.addEventListener("focusin", () => this.stop());
    scope.addEventListener("focusout", () => this.start());

    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        this.onScreen = entries.some((entry) => entry.isIntersecting);
        if (this.onScreen) {
          this.start();
        } else {
          this.stop();
        }
      }).observe(scope);
    }

    // Don't burn CPU on a backgrounded tab
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.stop();
      } else {
        this.start();
      }
    });

    this.root.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        this.step(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        this.step(1);
      }
    });
  }

  private step(direction: Direction): void {
    const count = this.slides.length;
    if (count === 0) return;

    const current = this.index;
    const next = ((current + direction) % count + count) % count;

    // Wrapping end-to-end would smooth-scroll back through every slide,
    // so jump instantly for that one case only.
    const wrapping = Math.abs(next - current) > 1;
    this.root.scrollTo({
      left: next * this.root.clientWidth,
      behavior: wrapping ? "auto" : "smooth",
    });
  }

  private syncToggle(): void {
    const toggle = this.toggle;
    if (!toggle) return;
    // Both strings come from theme settings via data attributes, so the
    // label stays editable in Console rather than being baked in here.
    const label = this.paused
      ? (toggle.dataset["labelPlay"] ?? "Play slideshow")
      : (toggle.dataset["labelPause"] ?? "Pause slideshow");
    toggle.setAttribute("aria-label", label);
    toggle.dataset["state"] = this.paused ? "paused" : "playing";
  }

  private start(): void {
    this.stop();
    if (this.paused) return;
    if (!this.onScreen) return;
    if (this.intervalMs <= 0) return;
    if (this.slides.length < 2) return;
    if (window.matchMedia(REDUCED_MOTION).matches) return;
    this.timer = window.setInterval(() => this.step(1), this.intervalMs);
  }

  private stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }
}

/**
 * GSAP, ScrollTrigger and the sequences built on them are only needed where
 * there is something to animate (the homepage today). They are split into
 * their own chunks and fetched after first paint, so other pages never pay
 * for them and the homepage's main bundle parses sooner. The page is complete
 * without them: everything they animate renders in its final state first.
 */
function loadMotion(): void {
  if (!document.querySelector("[data-mission], [data-print], [data-pictogram]")) return;
  Promise.all([import("./mission"), import("./motion")])
    .then(([mission, motion]) => {
      mission.initMission();
      motion.initMotion();
    })
    // A chunk that fails to load (offline, or a stale cached main.js pointing
    // at chunk names a newer build replaced) costs the motion, nothing else:
    // every animated element already rendered in its final state.
    .catch(() => {});
}

function init(): void {
  // Smooth scroll first: the paper draws on Lenis's scroll event
  initSmoothScroll();
  initPaper();
  loadMotion();
  document
    .querySelectorAll<HTMLElement>("[data-carousel]")
    .forEach((root) => new HeroCarousel(root));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
