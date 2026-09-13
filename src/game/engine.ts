/** Depth-limited alpha-beta Othello engine, with an optional search trace.
 *
 * A faithful port of tools/pipeline/othello.py — the same engine that produced
 * the training labels for the fly readout. Determinism matters: Python's sorted()
 * is stable and max() returns the first maximum, so move ordering and tie-breaking
 * are reproduced exactly, otherwise the two implementations would diverge on ties.
 */
import { legalMoves, applyMove, type Board } from './othello';

/** One visited node, in visitation order. `pruned` nodes were never explored. */
export interface TraceNode {
  id: number;
  parent: number;   // -1 at the root
  depth: number;    // 0 at the root
  move: number;     // the move that led to this node, -1 at the root
  score: number;    // NaN until evaluated
  pruned: boolean;  // cut off by an alpha-beta cutoff
}

export interface Decision {
  move: number;
  score: number;
  nodes: number;    // nodes actually evaluated (excludes pruned)
  trace: TraceNode[];
}

const wCache = new Map<number, Float32Array>();

/** Positional weights: corners >> edges >> squares diagonal to a corner. */
export function weights(n: number): Float32Array {
  const hit = wCache.get(n);
  if (hit) return hit;
  const W = new Float32Array(n * n).fill(1);
  for (let i = 0; i < n; i++) { W[i] = 3; W[(n - 1) * n + i] = 3; W[i * n] = 3; W[i * n + n - 1] = 3; }
  for (const [r, c] of [[0, 0], [0, n - 1], [n - 1, 0], [n - 1, n - 1]]) W[r * n + c] = 30;
  for (const [r, c] of [[0, 1], [1, 0], [1, 1]])
    for (const [a, b] of [[r, c], [r, n - 1 - c], [n - 1 - r, c], [n - 1 - r, n - 1 - c]])
      W[a * n + b] = -8;
  wCache.set(n, W);
  return W;
}

export function evaluate(b: Board, player: number, n: number): number {
  const W = weights(n), opp = 3 - player;
  let pos = 0;
  for (let i = 0; i < b.length; i++) {
    if (b[i] === player) pos += W[i];
    else if (b[i] === opp) pos -= W[i];
  }
  const mob = legalMoves(b, player, n).length - legalMoves(b, opp, n).length;
  return pos + 4 * mob;
}

interface Ctx { trace: TraceNode[] | null; nodes: number; n: number }

function search(
  b: Board, player: number, depth: number, a: number, beta: number,
  ctx: Ctx, parent: number, myId: number,
): { score: number; move: number } {
  const n = ctx.n;
  const mv = legalMoves(b, player, n);

  if (!mv.length) {
    if (!legalMoves(b, 3 - player, n).length) {           // game over: final margin
      let d = 0;
      for (const v of b) d += v === player ? 1 : v === 3 - player ? -1 : 0;
      return { score: 1e6 * Math.sign(d), move: -1 };
    }
    const s = search(b, 3 - player, depth, -beta, -a, ctx, parent, myId);  // pass
    return { score: -s.score, move: -1 };
  }

  if (depth === 0) {
    ctx.nodes++;
    const W = weights(n);
    // Python's max(mv, key=...) keeps the FIRST maximum.
    const best = mv.reduce((x, y) => (W[y] > W[x] ? y : x));
    return { score: evaluate(b, player, n), move: best };
  }

  // Python sorts descending by weight with a stable sort; JS Array.sort is stable too.
  const ordered = [...mv].sort((x, y) => weights(n)[y] - weights(n)[x]);
  let best = -1e9, bm = mv[0], cut = -1;

  for (let i = 0; i < ordered.length; i++) {
    const s = ordered[i];
    const id = ctx.trace ? ctx.trace.length : 0;
    if (ctx.trace) ctx.trace.push({ id, parent: myId, depth: ctx.trace[myId].depth + 1, move: s, score: NaN, pruned: false });
    const r = search(applyMove(b, player, s, n), 3 - player, depth - 1, -beta, -a, ctx, myId, id);
    const sc = -r.score;
    if (ctx.trace) ctx.trace[id].score = sc;
    if (sc > best) { best = sc; bm = s; }
    if (sc > a) a = sc;
    if (a >= beta) { cut = i; break; }                     // alpha-beta cutoff
  }

  if (ctx.trace && cut >= 0) {                             // record what was never explored
    for (let i = cut + 1; i < ordered.length; i++) {
      const id = ctx.trace.length;
      ctx.trace.push({ id, parent: myId, depth: ctx.trace[myId].depth + 1, move: ordered[i], score: NaN, pruned: true });
    }
  }
  return { score: best, move: bm };
}

export function bestMove(b: Board, player: number, n: number, depth = 3, withTrace = true): Decision {
  const trace: TraceNode[] | null = withTrace ? [{ id: 0, parent: -1, depth: 0, move: -1, score: NaN, pruned: false }] : null;
  const ctx: Ctx = { trace, nodes: 0, n };
  const r = search(b, player, depth, -1e9, 1e9, ctx, -1, 0);
  if (trace) trace[0].score = r.score;
  return { move: r.move, score: r.score, nodes: ctx.nodes, trace: trace ?? [] };
}
