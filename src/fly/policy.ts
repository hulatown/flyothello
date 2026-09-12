/** Fly policy: board -> injection -> whole-brain LIF -> visual-projection readout -> linear layer -> move scores. */
import { FlyBrain, poissonDrive, mulberry32, type SimConst } from './sim';
import { moverView, legalMoves, type Board } from '../game/othello';

export interface Readout {
  ids: Int32Array;      // indices of readout neurons within the whole brain
  mu: Float32Array;
  sd: Float32Array;
  W: Float32Array;      // (cells x live), row-major
  b: Float32Array;      // (cells)
  cells: number;
}

export interface Inject { idx: Int32Array; cell: Int8Array; }

export function parseReadout(ab: ArrayBuffer, cells: number): Readout {
  const live = (ab.byteLength - cells * 4) / (12 + 4 * cells);  // ids + mu + sd are each `live` entries
  let o = 0;
  const ids = new Int32Array(ab, o, live); o += live * 4;
  const mu  = new Float32Array(ab, o, live); o += live * 4;
  const sd  = new Float32Array(ab, o, live); o += live * 4;
  const W   = new Float32Array(ab, o, cells * live); o += cells * live * 4;
  const b   = new Float32Array(ab, o, cells);
  return { ids, mu, sd, W, b, cells };
}

export function parseInject(ab: ArrayBuffer, count = 33208): Inject {
  return { idx: new Int32Array(ab, 0, count), cell: new Int8Array(ab, count * 4, count) };
}

/** One 'think'. onTick fires every few steps to feed the live visualisation. */
export function think(
  brain: FlyBrain, inj: Inject, ro: Readout, C: SimConst,
  board: Board, player: number, n: number, seed: number,
  onTick?: (step: number, spikes: Int32Array, nSpk: number) => void,
  tickEvery = 15,
): Float32Array {
  const view = moverView(board, player);
  const K = inj.idx.length;
  const rates = new Float32Array(K).fill(C.lum.empty);
  for (let k = 0; k < K; k++) {
    const cl = inj.cell[k];
    if (cl >= 0) rates[k] = view[cl] === 1 ? C.lum.mine : view[cl] === 2 ? C.lum.theirs : C.lum.empty;
  }
  brain.reset();
  const rand = mulberry32(seed);
  const spikes = new Int32Array(brain.N), forced = new Int32Array(K);
  for (let t = 0; t < C.steps; t++) {
    const nf = poissonDrive(inj.idx, rates, C.dt, rand, forced);
    const nSpk = brain.step(forced, nf, spikes);
    if (onTick && (t + 1) % tickEvery === 0) onTick(t + 1, spikes, nSpk);
  }
  // readout -> standardise -> linear layer
  const live = ro.ids.length;
  const z = new Float32Array(live);
  for (let i = 0; i < live; i++) z[i] = (brain.counts[ro.ids[i]] - ro.mu[i]) / ro.sd[i];
  const s = new Float32Array(ro.cells);
  for (let c = 0; c < ro.cells; c++) {
    let acc = ro.b[c]; const off = c * live;
    for (let i = 0; i < live; i++) acc += ro.W[off + i] * z[i];
    s[c] = acc;
  }
  return s;
}

/** Scores -> move. temp=0 takes the argmax; >0 samples with temperature
 * (the difficulty knob — the fly stays in the loop either way). */
export function pickMove(
  scores: Float32Array, board: Board, player: number, n: number,
  temp: number, rand: () => number,
): { move: number; degenerate: boolean } {
  const mv = legalMoves(board, player, n);
  if (!mv.length) return { move: -1, degenerate: false };
  let hi = -Infinity, lo = Infinity;
  for (const s of mv) { if (scores[s] > hi) hi = scores[s]; if (scores[s] < lo) lo = scores[s]; }
  const degenerate = hi - lo < 1e-4;          // the fly has no opinion about this move
  if (temp <= 0 || degenerate) {
    if (degenerate) return { move: mv[(rand() * mv.length) | 0], degenerate };
    return { move: mv.reduce((a, b) => (scores[b] > scores[a] ? b : a)), degenerate };
  }
  const w = mv.map(s => Math.exp((scores[s] - hi) / temp));
  const sum = w.reduce((a, b) => a + b, 0);
  let r = rand() * sum;
  for (let i = 0; i < mv.length; i++) { r -= w[i]; if (r <= 0) return { move: mv[i], degenerate }; }
  return { move: mv[mv.length - 1], degenerate };
}
