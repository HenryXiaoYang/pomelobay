/**
 * The paper, and the places it changes colour.
 *
 * Sections that sit on a different stock carry `data-paper="<daisyUI colour>"`
 * (Challenges on base-200, Influence on the neutral ink, the footer on
 * base-200); everything else is on base-100. With this running, those sections
 * drop their own background and the paper is painted once, behind the page, on
 * a fixed canvas.
 *
 * At rest the papers meet at a clean edge, exactly where the sections meet.
 * Only while the page is moving does that edge come apart: it breaks into a
 * dot screen - every cell of a fixed ruling holds one dot, sized by how far
 * that row is through the change - and the faster the scroll, the deeper the
 * screen reaches into the padding on either side. When the scroll stops the
 * screen closes back up to a solid edge in about half a second. Two flat inks
 * and a varying coverage is how a press makes a tint, so even mid-change every
 * pixel is one paper or the other.
 *
 * Adapted from henryyang.net's PaperDissolve. There the screen is a transient
 * of a scroll timeline between two light stocks and the paper is flat at rest.
 * A timeline doesn't fit this page - one stock is near-black ink and several
 * sections are shorter than the viewport, so dark dots would rest on text -
 * so the screen is tied to motion instead: same press language, same "only
 * while it is changing", and text is always on solid paper because the screen
 * never leaves the padding.
 *
 * Cost: a frame is a few solid fills plus one tiled fill per screened row,
 * from cell-sized patterns cached per level. The loop runs only while there is
 * motion or a screen still closing, then draws one last clean frame and stops.
 * Under prefers-reduced-motion the screen never opens.
 */

/** CSS px between dot centres: fine enough to read as a tint, coarse enough that a dot is a dot. */
const PITCH = 6;
/** Distinct radii the screen is quantised to. */
const LEVELS = 40;
/** Upper bound on each half of a band, before REACH. */
const MAX_HALF = 160;
/** Share of the measured padding a fully open screen may take, so dots never touch a line of text. */
const REACH = 0.7;
/** Scroll speed, in CSS px per ms, that opens the screen fully. ~2.4 is a brisk wheel or flick. */
const FULL_SPEED = 2.4;
/** How quickly the screen closes once motion stops (time constant, ms): ~3x this to a clean edge. */
const RELEASE_MS = 150;
/** How much of the gap to a faster target is closed per frame: opens fast, but not in one jump. */
const ATTACK = 0.35;
/** A dot that covers its cell corner to corner: half the diagonal, in cells. */
const FULL = Math.SQRT1_2;
/** Coverage of a dot inscribed in its cell - past this, neighbours overlap. */
const KISS = Math.PI / 4;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

interface Edge {
  /** Document y where the two papers meet. */
  at: number;
  /** How far a fully open screen may reach above and below it. */
  above: number;
  below: number;
  from: string;
  to: string;
}

interface Segment {
  /** Document y span of a block printed on a stock other than base. */
  top: number;
  bottom: number;
  paper: string;
}

/** The radius, in cells, whose dots cover this fraction of the cell. */
function radiusFor(coverage: number): number {
  return coverage <= KISS
    ? Math.sqrt(coverage / Math.PI)
    : 0.5 + (FULL - 0.5) * ((coverage - KISS) / (1 - KISS));
}

function px(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Padding at one edge of a block, including its first/last child's - the
 * sections put their padding on an inner wrapper, not on themselves.
 */
function edgePadding(el: Element, side: "top" | "bottom"): number {
  const own = px(getComputedStyle(el).getPropertyValue(`padding-${side}`));
  const child = side === "top" ? el.firstElementChild : el.lastElementChild;
  const inner = child
    ? px(getComputedStyle(child).getPropertyValue(`padding-${side}`))
    : 0;
  return own + inner;
}

export function initPaper(): void {
  const main = document.querySelector("main");
  if (!main) return;

  const canvas = document.createElement("canvas");
  canvas.className = "paper-canvas";
  canvas.setAttribute("aria-hidden", "true");
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return;

  const root = document.documentElement;
  const tokens = getComputedStyle(root);
  const paperOf = (name: string | undefined): string =>
    tokens.getPropertyValue(`--color-${name ?? "base-100"}`).trim() ||
    tokens.getPropertyValue("--color-base-100").trim();
  const base = paperOf("base-100");
  const still = window.matchMedia(REDUCED_MOTION).matches;

  // The canvas is hidden in forced-colors mode anyway (see CSS); don't spend
  // a frame loop on it. And if the paper tokens didn't resolve - the
  // stylesheet failed while this script loaded - an empty fillStyle would
  // leave the canvas default black under the whole page. Bail out and let
  // the sections keep their own backgrounds.
  if (window.matchMedia("(forced-colors: active)").matches) return;
  if (!base || !CSS.supports("color", base)) return;

  let dpr = 1;
  let cell = 0;
  let cellCss = 0;
  let rows = 0;
  let segments: Segment[] = [];
  let edges: Edge[] = [];
  let tiles = new Map<string, CanvasPattern | null>();

  /** One cell: the upper paper as ground, the lower paper as a dot of the level's radius. Neighbours are drawn too so a dot that reaches past its cell still tiles. */
  const tileOf = (from: string, to: string, level: number): CanvasPattern | null => {
    const key = `${from}|${to}|${level}`;
    const cached = tiles.get(key);
    if (cached !== undefined) return cached;

    const tile = document.createElement("canvas");
    tile.width = cell;
    tile.height = cell;
    const t = tile.getContext("2d");
    let pattern: CanvasPattern | null = null;
    if (t) {
      t.fillStyle = from;
      t.fillRect(0, 0, cell, cell);
      t.fillStyle = to;
      const r = radiusFor(level / (LEVELS - 1)) * cell;
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          t.beginPath();
          t.arc((ox + 0.5) * cell, (oy + 0.5) * cell, r, 0, Math.PI * 2);
          t.fill();
        }
      }
      pattern = ctx.createPattern(tile, "repeat");
    }
    tiles.set(key, pattern);
    return pattern;
  };

  /**
   * Reads the papers off the page. Each block (a child of <main>, or the
   * footer) is on its data-paper stock or on base; margins between blocks are
   * base. Wherever neighbouring blocks differ there is an edge, at the side of
   * the block that isn't base, with the padding (plus any margin) on each side
   * as the room a screen may open into.
   */
  const measureBlocks = (): void => {
    const blocks = [
      ...Array.from(main.children),
      ...Array.from(document.querySelectorAll("body > footer")),
    ]
      .filter((el) => el.getBoundingClientRect().height > 0)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          el,
          top: rect.top + scrollY,
          bottom: rect.bottom + scrollY,
          paper: paperOf((el as HTMLElement).dataset["paper"]),
        };
      });

    segments = blocks
      .filter((b) => b.paper !== base)
      .map((b) => ({ top: b.top, bottom: b.bottom, paper: b.paper }));

    edges = [];
    for (let i = 1; i < blocks.length; i++) {
      const prev = blocks[i - 1]!;
      const next = blocks[i]!;
      if (prev.paper === next.paper) continue;
      const gap = Math.max(0, next.top - prev.bottom);
      const atNext = next.paper !== base;
      edges.push({
        at: atNext ? next.top : prev.bottom,
        above: Math.min(MAX_HALF, edgePadding(prev.el, "bottom") + (atNext ? gap : 0)) * REACH,
        below: Math.min(MAX_HALF, edgePadding(next.el, "top") + (atNext ? 0 : gap)) * REACH,
        from: prev.paper,
        to: next.paper,
      });
    }
  };

  const measureCanvas = (): void => {
    // Capped at 2: a denser display costs the same bounded canvas
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cell = Math.max(2, Math.round(PITCH * dpr));
    cellCss = cell / dpr;
    // Exactly the viewport. Rounding up to whole cells made the canvas a few
    // px wider than any viewport not divisible by the pitch (375px phones),
    // and even a fixed element that wide gives the page a sideways scroll.
    // The last row/column of cells is simply cut off at the edge instead.
    canvas.width = Math.round(root.clientWidth * dpr);
    canvas.height = Math.round(root.clientHeight * dpr);
    canvas.style.width = `${root.clientWidth}px`;
    canvas.style.height = `${root.clientHeight}px`;
    rows = Math.ceil(canvas.height / cell);
    tiles = new Map();
  };

  /**
   * One frame at scroll offset `y` with the screen `open` (0..1) of the way.
   * First the flat papers at their exact edges, device-pixel sharp; then, if
   * open, the screened rows over each edge, quantised to the ruling.
   */
  /**
   * What the flat part of the last frame looked like, so an identical frame
   * is skipped. DIRTY never equals a real frame: it is the state before the
   * first paint, after a resize (which clears the canvas) and after any frame
   * with an open screen (so the frame that closes it is always painted).
   */
  const DIRTY = "\u0000";
  let lastFlat = DIRTY;

  const draw = (y: number, open: number): void => {
    const view = canvas.height / dpr;

    // Most of a scroll passes over one paper: the frame would be identical
    // to the last, so don't repaint a full-viewport canvas for nothing. A
    // frame is only skipped when no screen is open and the visible paper
    // runs (in device pixels) are exactly what is already on the canvas.
    const runs: [string, number, number][] = [];
    for (const seg of segments) {
      const top = Math.max(0, seg.top - y);
      const bottom = Math.min(view, seg.bottom - y);
      if (bottom <= top) continue;
      runs.push([seg.paper, Math.round(top * dpr), Math.round(bottom * dpr)]);
    }
    const flat = runs.map((r) => r.join(":")).join("|");
    if (open <= 0 && flat === lastFlat) return;
    lastFlat = open > 0 ? DIRTY : flat;

    ctx.fillStyle = base;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const [paper, y0, y1] of runs) {
      ctx.fillStyle = paper;
      ctx.fillRect(0, y0, canvas.width, y1 - y0);
    }

    if (open <= 0) return;
    for (const edge of edges) {
      const start = edge.at - edge.above * open - y;
      const end = edge.at + edge.below * open - y;
      if (end <= 0 || start >= view || end - start < cellCss) continue;
      const first = Math.max(0, Math.floor(start / cellCss));
      const last = Math.min(rows - 1, Math.ceil(end / cellCss));
      for (let row = first; row <= last; row++) {
        const centre = (row + 0.5) * cellCss;
        if (centre < start || centre >= end) continue;
        const level = Math.round(((centre - start) / (end - start)) * (LEVELS - 1));
        ctx.fillStyle =
          level <= 0 ? edge.from : level >= LEVELS - 1 ? edge.to : (tileOf(edge.from, edge.to, level) ?? edge.from);
        ctx.fillRect(0, row * cell, canvas.width, cell);
      }
    }
  };

  // Motion: `open` follows scroll speed up quickly and decays exponentially
  // once the page is still, then the loop stops on a clean frame.
  let open = 0;
  let lastY = scrollY;
  let lastT = performance.now();
  let frame = 0;

  const tick = (now: number): void => {
    frame = 0;
    const y = scrollY;
    const dt = Math.max(1, now - lastT);
    const speed = Math.abs(y - lastY) / dt;
    lastY = y;
    lastT = now;

    if (!still) {
      const target = Math.min(1, speed / FULL_SPEED);
      open = target > open ? open + (target - open) * ATTACK : open * Math.exp(-dt / RELEASE_MS);
      if (open < 0.01) open = 0;
    }

    draw(y, open);
    if (open > 0) frame = requestAnimationFrame(tick);
  };

  const wake = (): void => {
    if (frame) return;
    // Reset the clock so a long idle gap doesn't read as zero speed
    lastT = performance.now();
    frame = requestAnimationFrame(tick);
  };

  const remeasure = (): void => {
    lastFlat = DIRTY;
    measureCanvas();
    measureBlocks();
    draw(scrollY, open);
  };

  measureCanvas();
  measureBlocks();
  document.body.prepend(canvas);
  // Second half of the stylesheet check: without the .paper-canvas rule the
  // canvas is an in-flow block at the top of the page, not a fixed backdrop
  if (getComputedStyle(canvas).position !== "fixed") {
    canvas.remove();
    return;
  }
  draw(scrollY, 0);
  // Only now hand the backgrounds over: if anything above failed, the
  // sections keep their own flat colours.
  root.classList.add("paper-on");

  addEventListener("scroll", wake, { passive: true });
  addEventListener("resize", remeasure);
  // Images, fonts and settings-driven content all move the edges
  new ResizeObserver(() => {
    measureBlocks();
    wake();
  }).observe(document.body);
}
