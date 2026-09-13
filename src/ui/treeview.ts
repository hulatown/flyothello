/** Decision-tree visualiser: the alpha-beta search growing, then being pruned.
 *
 * The counterpart to BrainView. Where the fly panel shows activity spreading,
 * this shows a tree expanding and branches being cut — the visual signature of
 * alpha-beta, and the reason the engine is so much faster than the fly.
 */
import type { TraceNode } from '../game/engine';

const W = 640, H = 308;   // 2.08 aspect, matching the brain panel

interface Placed { x: number; y: number; node: TraceNode }

export class TreeView {
  private ctx: CanvasRenderingContext2D;
  private placed: Placed[] = [];
  private raf = 0;
  private t0 = 0;
  private dur = 0;

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
    let maxD = 0;
    for (const n of trace) {
      if (n.parent >= 0) kids[n.parent].push(n.id);
      if (n.depth > maxD) maxD = n.depth;
    }
    const leaves = new Array(trace.length).fill(0);
    for (let i = trace.length - 1; i >= 0; i--)
      leaves[i] = kids[i].length ? kids[i].reduce((s, k) => s + leaves[k], 0) : 1;

    const pad = 14, cw = (W - pad * 2) / Math.max(1, maxD), ch = H - pad * 2;
    this.placed = new Array(trace.length);
    const walk = (id: number, y0: number, y1: number) => {
      const n = trace[id];
      this.placed[id] = { x: pad + n.depth * cw, y: (y0 + y1) / 2, node: n };
      let y = y0;
      for (const k of kids[id]) {
        const h = (y1 - y0) * (leaves[k] / leaves[id]);
        walk(k, y, y + h);
        y += h;
      }
    };
    if (trace.length) walk(0, pad, pad + ch);
  }

  /** Animate the search being replayed over `durMs`. */
  play(trace: TraceNode[], durMs: number, bestMove: number) {
    cancelAnimationFrame(this.raf);
    this.layout(trace);
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
    this.placed = [];
    const g = this.ctx;
    g.fillStyle = '#0a1416'; g.fillRect(0, 0, W, H);
  }

  private paint(p: number, bestMove: number) {
    const g = this.ctx, P = this.placed;
    g.fillStyle = '#0a1416'; g.fillRect(0, 0, W, H);
    if (!P.length) return;
    const shown = Math.ceil(P.length * p);

    // Visual weight falls off with depth. Measured worst case for 8x8 depth 3:
    // 13 nodes at d1 (21px apart), 193 at d2 (1.4px), 830 at d3 (0.34px). Markers
    // are only legible down to d2, so deeper levels are carried by edges alone —
    // and since pruned children are contiguous in the layout, cut-off regions read
    // as solid blocks of red rather than speckle.
    const EW = [0, 1.6, 0.8, 0.45, 0.35];
    const EA = [0, 0.55, 0.30, 0.16, 0.12];
    const NR = [5, 3.4, 1.3, 0, 0];

    for (let i = 1; i < shown; i++) {
      const n = P[i], par = P[n.node.parent];
      if (!par) continue;
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

    for (let i = 0; i < shown; i++) {
      const { x, y, node } = P[i];
      const r = NR[Math.min(4, node.depth)];
      if (!r) continue;
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

    if (bestMove >= 0) {                            // trace the chosen line once finished
      const pick = P.find(q => q && q.node.depth === 1 && q.node.move === bestMove);
      if (pick) {
        g.strokeStyle = '#f0b54a'; g.lineWidth = 2.6;
        g.beginPath(); g.moveTo(P[0].x, P[0].y);
        g.bezierCurveTo((P[0].x + pick.x) / 2, P[0].y, (P[0].x + pick.x) / 2, pick.y, pick.x, pick.y);
        g.stroke();
        g.fillStyle = '#f0b54a';
        g.beginPath(); g.arc(pick.x, pick.y, 5, 0, 6.2832); g.fill();
      }
    }
  }
}
