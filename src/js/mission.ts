/**
 * Mission line entrance: words arrive in reading order, then the hand-drawn
 * loop is drawn around the highlighted word - one GSAP timeline, played once
 * by ScrollTrigger when the line is well inside the viewport.
 *
 * The page is complete without this file: the words render visible and the
 * loop renders already drawn (CSS rests the dash at offset 0). The timeline's
 * from-states only exist inside the reduced-motion-safe matchMedia context.
 *
 * Words are split here rather than in the template so the message stays a
 * single plain setting in Console.
 */

import { gsap, MOTION_OK } from "./motion";

/** Wraps each word of `root` in a span; the highlight stays one unit. */
function splitWords(root: HTMLElement): void {
  for (const node of Array.from(root.childNodes)) {
    if (node instanceof HTMLElement && node.hasAttribute("data-mission-mark")) {
      node.classList.add("mission-word");
      continue;
    }
    if (node.nodeType !== Node.TEXT_NODE) continue;

    const fragment = document.createDocumentFragment();
    // Keep the whitespace as text nodes so the line still wraps naturally
    for (const part of (node.textContent ?? "").split(/(\s+)/)) {
      if (part === "") continue;
      if (/^\s+$/.test(part)) {
        fragment.append(part);
        continue;
      }
      const word = document.createElement("span");
      word.className = "mission-word";
      word.textContent = part;
      fragment.append(word);
    }
    node.replaceWith(fragment);
  }
}

/**
 * Refits the loop to the circled word's real box.
 *
 * The SVG has to stretch to the word, and with preserveAspectRatio="none"
 * that stretches the stroke too: on a short word the sides came out ~15%
 * heavier than the top. vector-effect: non-scaling-stroke would fix it in
 * Chrome but breaks pathLength dashes in other engines, so instead the
 * viewBox is set to the box's pixel size and the path's coordinates are
 * scaled into it. The stroke is then uniform and stays ~0.09em of the text.
 * Without JS the template's 200x80 drawing is used as-is.
 */
function fitLoop(mark: HTMLElement): void {
  const svg = mark.querySelector<SVGSVGElement>("svg");
  const path = svg?.querySelector<SVGPathElement>("path");
  const base = path?.getAttribute("d");
  if (!svg || !path || !base) return;

  const fit = (): void => {
    const { width, height } = svg.getBoundingClientRect();
    if (width === 0 || height === 0) return;
    const sx = width / 200;
    const sy = height / 80;
    // Every coordinate in the drawing is an absolute x,y pair (M/C only)
    let index = 0;
    const d = base.replace(/-?\d*\.?\d+/g, (n) =>
      (Number(n) * (index++ % 2 === 0 ? sx : sy)).toFixed(1),
    );
    const em = Number.parseFloat(getComputedStyle(mark).fontSize);
    svg.setAttribute("viewBox", `0 0 ${width.toFixed(1)} ${height.toFixed(1)}`);
    path.setAttribute("d", d);
    path.setAttribute("stroke-width", (em * 0.09).toFixed(2));
  };

  fit();
  // Webfont swap and breakpoint changes both resize the word
  new ResizeObserver(fit).observe(svg);
}

export function initMission(): void {
  const line = document.querySelector<HTMLElement>("[data-mission]");
  if (!line) return;

  // A shape fix, not motion - applies under reduced motion too
  const mark = line.querySelector<HTMLElement>("[data-mission-mark]");
  if (mark) fitLoop(mark);

  gsap.matchMedia().add(MOTION_OK, () => {
    // Idempotent: already-wrapped words are elements and are skipped, so a
    // context re-run (preference toggled back) doesn't double-wrap
    splitWords(line);
    const targets = line.querySelectorAll<HTMLElement>(".mission-word");
    const loop = mark?.querySelector("path");

    const tl = gsap.timeline({
      // "top 70%": the loop is drawn while the reader is looking at it, not
      // while the line slides in at the bottom edge
      scrollTrigger: { trigger: line, start: "top 70%", once: true },
      defaults: { ease: "expo.out" },
    });

    // Chalk coming into focus: a short rise out of a light blur, 70ms apart
    tl.from(targets, {
      opacity: 0,
      y: "0.25em",
      filter: "blur(4px)",
      duration: 0.6,
      stagger: 0.07,
      clearProps: "opacity,transform,filter",
    });

    // The hand speeds through the curve and slows to close it, starting as
    // the last word lands. 1.02 parks the dash clear of the path (see CSS).
    if (loop) {
      tl.fromTo(
        loop,
        { strokeDashoffset: 1.02 },
        { strokeDashoffset: 0, duration: 0.85, ease: "power2.inOut", clearProps: "strokeDashoffset" },
        "-=0.3",
      );
    }
  });
}
