/** Decision-tree visualiser: the alpha-beta search growing, then being pruned.
 *
 * The counterpart to BrainView. Where the fly panel shows activity spreading,
 * this shows a tree expanding and branches being cut — the visual signature of
 * alpha-beta, and the reason the engine is so much faster than the fly.
 */
import type { TraceNode } from '../game/engine';

/** Flat index -> Othello square notation, e.g. 27 on an 8x8 board -> "d4". */
const sq = (mv: number, n: number) =>
  String.fromCharCode(97 + (mv % n)) + (Math.floor(mv / n) + 1);

const W = 640, H = 308;
const DRAW_DEPTH = 2;   // deeper plies are summarised by marker size, not drawn   // 2.08 aspect, matching the brain panel

interface Placed { x: number; y: number; node: TraceNode }

export class TreeView {
  private ctx: CanvasRenderingContext2D;
  private placed: Placed[] = [];
  private raf = 0;
  private t0 = 0;
  private dur = 0;
  private order: number[] = [];
  private childCount: number[] = [];
  private n = 8;

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = W; canvas.height = H;
    const c = canvas.getContext('2d');
    if (!c) throw new Error('2D canvas unavailable');
    this.ctx = c;
    this.clear();
  }

  /** Assign coordinates: x by depth, y by subtree leaf count so siblings stay together. */
  private layout(trace: TraceNode[]) {
    const kids: number[][] = trace.map(() => []);
    this.childCount = trace.map(() => 0);
    let maxD = 0;
    for (const n of trace) {
      if (n.parent >= 0) { kids[n.parent].push(n.id); this.childCount[n.parent]++; }
      if (n.depth > maxD) maxD = n.depth;
    }

    // The root is a single known node, so it gets a narrow column instead of an
    // equal share; the depths that actually carry information get the rest.
    const pad = 14, ch = H - pad * 2;
    const x0 = pad, x1 = W * 0.15, xEnd = W * 0.90;
    const cw = maxD > 1 ? (xEnd - x1) / (maxD - 1) : 0;
    const xAt = (d: number) => (d === 0 ? x0 : x1 + (d - 1) * cw);
    this.placed = new Array(trace.length);
    const walk = (id: number, y0: number, y1: number) => {
      const n = trace[id];
      this.placed[id] = { x: xAt(n.depth), y: (y0 + y1) / 2, node: n };
      // Equal share per sibling rather than proportional to leaf count: with
      // 830 leaves over 280px a proportional layout smears every level across
      // the full height and the tree reads as horizontal streaks. Equal share
      // keeps each first-level option as one compact bush.
      const ks = kids[id];
      if (!ks.length) return;
      const h = (y1 - y0) / ks.length, inset = h * 0.17;
      ks.forEach((k, j) => walk(k, y0 + j * h + inset, y0 + (j + 1) * h - inset));
    };
    if (trace.length) walk(0, pad, pad + ch);
  }

  /** Animate the search being replayed over `durMs`. */
  play(trace: TraceNode[], durMs: number, bestMove: number, n = 8) {
    cancelAnimationFrame(this.raf);
    this.layout(trace);
    // Reveal by depth so the tree visibly grows left to right. Within a level the
    // order is still the order the search visited them; the raw trace order is
    // depth-first, which reads as blocks filling top to bottom instead.
    // Only levels that are actually drawn belong in the reveal order; including
    // the undrawn deepest ply would leave three quarters of the animation with
    // nothing changing on screen.
    this.order = this.placed.map((_, i) => i)
      .filter(i => trace[i].depth <= DRAW_DEPTH)
      .sort((a, b) => trace[a].depth - trace[b].depth || a - b);
    this.n = n;
    this.t0 = performance.now();
    this.dur = Math.max(1, durMs);
    const step = () => {
      const p = Math.min(1, (performance.now() - this.t0) / this.dur);
      this.paint(p, p >= 1 ? bestMove : -1);
      if (p < 1) this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  clear() {
    cancelAnimationFrame(this.raf);
    this.placed = []; this.order = [];
    const g = this.ctx;
    g.fillStyle = '#0a1416'; g.fillRect(0, 0, W, H);
  }

  private paint(p: number, bestMove: number) {
    const g = this.ctx, P = this.placed;
    g.fillStyle = '#0a1416'; g.fillRect(0, 0, W, H);
    if (!P.length) return;
    const nShow = Math.ceil(this.order.length * p);
    const on = new Uint8Array(P.length);
    for (let i = 0; i < nShow; i++) on[this.order[i]] = 1;

    // Visual weight falls off with depth. Measured worst case for 8x8 depth 3:
    // 13 nodes at d1 (21px apart), 193 at d2 (1.4px), 830 at d3 (0.34px). Markers
    // are only legible down to d2, so deeper levels are carried by edges alone —
    // and since pruned children are contiguous in the layout, cut-off regions read
    // as solid blocks of red rather than speckle.
    // Only two levels are drawn. The deepest ply is 830 nodes over 280px in the
    // worst case, which renders as horizontal streaks and carries no information;
    // instead each depth-2 marker grows with how many children it spawned, so
    // "this line was explored further" stays visible without drawing all of them.
    const EW = [0, 1.8, 1.0, 0, 0];
    const EA = [0, 0.58, 0.26, 0, 0];
    const NR = [5, 3.6, 1.4, 0, 0];

    for (let i = 1; i < P.length; i++) {
      if (!on[i]) continue;
      const n = P[i], par = P[n.node.parent];
      if (!par || !on[n.node.parent] || n.node.depth > DRAW_DEPTH) continue;
      const d = Math.min(4, n.node.depth);
      g.lineWidth = EW[d];
      g.strokeStyle = n.node.pruned
        ? `rgba(196,72,58,${EA[d] + 0.12})`
        : `rgba(95,188,199,${EA[d]})`;
      g.beginPath();
      g.moveTo(par.x, par.y);
      g.bezierCurveTo((par.x + n.x) / 2, par.y, (par.x + n.x) / 2, n.y, n.x, n.y);
      g.stroke();
    }

    for (let i = 0; i < P.length; i++) {
      if (!on[i]) continue;
      const { x, y, node } = P[i];
      if (node.depth > DRAW_DEPTH) continue;
      let r = NR[Math.min(4, node.depth)];
      if (!r) continue;
      if (node.depth === DRAW_DEPTH) r += Math.min(2.2, (this.childCount[i] ?? 0) * 0.16);
      if (node.pruned) {
        if (node.depth <= 1) {                      // an X is only readable near the trunk
          g.strokeStyle = 'rgba(214,92,74,.85)'; g.lineWidth = 1.4;
          g.beginPath(); g.moveTo(x - 3, y - 3); g.lineTo(x + 3, y + 3);
          g.moveTo(x + 3, y - 3); g.lineTo(x - 3, y + 3); g.stroke();
        } else {
          g.fillStyle = 'rgba(196,72,58,.75)';
          g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
        }
      } else {
        g.fillStyle = node.depth === 0 ? '#f0b54a' : '#5fbcc7';
        g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
      }
    }

    if (bestMove >= 0) {
      const pick = P.find(q => q && q.node.depth === 1 && q.node.move === bestMove);
      if (pick) {                                   // the line it settled on
        g.strokeStyle = '#f0b54a'; g.lineWidth = 2.6;
        g.beginPath(); g.moveTo(P[0].x, P[0].y);
        g.bezierCurveTo((P[0].x + pick.x) / 2, P[0].y, (P[0].x + pick.x) / 2, pick.y, pick.x, pick.y);
        g.stroke();
        g.fillStyle = '#f0b54a';
        g.beginPath(); g.arc(pick.x, pick.y, 5, 0, 6.2832); g.fill();
      }

      // Square and score for every first-level option, drawn last so they sit on
      // top, and placed in the gap before depth 1 to miss the d1->d2 edges.
      g.textBaseline = 'middle'; g.textAlign = 'right';
      // Best-scoring first, skipping any label that would collide: at 14 options
      // the rows are 20px apart and every label simply does not fit.
      const cands = P.filter(q => q && q.node.depth === 1 && !q.node.pruned && Number.isFinite(q.node.score))
        .sort((a, z) => (a.node.move === bestMove ? -1 : z.node.move === bestMove ? 1 : z.node.score - a.node.score));
      const taken: number[] = [];
      for (const q of cands) {
        const chosen = q.node.move === bestMove;
        if (taken.some(y => Math.abs(y - q.y) < (chosen ? 24 : 21))) continue;
        taken.push(q.y);
        const label = `${sq(q.node.move, this.n)} ${q.node.score > 0 ? '+' : ''}${q.node.score.toFixed(0)}`;
        g.font = `${chosen ? 700 : 500} ${chosen ? 16 : 12}px ui-monospace, "IBM Plex Mono", monospace`;
        const tx = q.x - 9, w = g.measureText(label).width;
        g.fillStyle = chosen ? 'rgba(10,20,22,.92)' : 'rgba(10,20,22,.55)';
        g.fillRect(tx - w - 5, q.y - (chosen ? 11 : 9), w + 10, chosen ? 22 : 18);
        g.fillStyle = chosen ? '#f0b54a' : 'rgba(158,206,214,.8)';
        g.fillText(label, tx, q.y);
      }
      g.textAlign = 'left';
    }
  }
}
