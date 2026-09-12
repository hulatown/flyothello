/// <reference lib="webworker" />
/** Fly worker: owns the brain, runs the simulation, and streams activity back
 * to the main thread already aggregated into a small grid. */
import { FlyBrain, type SimConst } from './sim';
import { think, pickMove, parseReadout, parseInject, type Readout, type Inject } from './policy';
import { mulberry32 } from './rng';
import type { Board } from '../game/othello';

export const GRID_W = 320, GRID_H = 154;   // matches the 2.08 aspect ratio of the brain projection

let brain: FlyBrain | null = null;
let C: SimConst;
let bin: Int32Array;                        // which grid cell each neuron falls into
const readouts: Record<number, Readout> = {};
const injects: Record<number, Inject> = {};

function buildBins(pos: ArrayBuffer, N: number): Uint8Array {
  const xy = new Uint16Array(pos);
  bin = new Int32Array(N);
  const dens = new Float32Array(GRID_W * GRID_H);
  for (let i = 0; i < N; i++) {
    const gx = Math.min(GRID_W - 1, (xy[i * 2] / 65536 * GRID_W) | 0);
    const gy = Math.min(GRID_H - 1, (xy[i * 2 + 1] / 65536 * GRID_H) | 0);
    bin[i] = gy * GRID_W + gx;
    dens[bin[i]]++;
  }
  // Static outline of the brain: log-scaled neuron density, so the shape stays
  // visible even when nothing is firing.
  let mx = 0;
  for (const v of dens) if (v > mx) mx = v;
  const base = new Uint8Array(dens.length);
  const k = 255 / Math.log1p(mx);
  for (let i = 0; i < dens.length; i++) base[i] = Math.log1p(dens[i]) * k;
  return base;
}

self.onmessage = (e: MessageEvent) => {
  const m = e.data;
  if (m.type === 'init') {
    C = m.meta.sim;
    brain = new FlyBrain(m.connectome, m.meta.connectome.neurons, m.meta.connectome.edges, C);
    const base = buildBins(m.positions, m.meta.connectome.neurons);
    for (const n of [6, 8]) {
      injects[n] = parseInject(m.inject[n]);
      readouts[n] = parseReadout(m.readout[n], n * n);
    }
    (self as unknown as Worker).postMessage({ type: 'ready', base: base.buffer }, [base.buffer]);
    return;
  }

  if (m.type === 'think') {
    const { n, player, seed, temp, viz } = m;
    const board: Board = new Int8Array(m.board);
    const acc = new Uint8Array(GRID_W * GRID_H);   // activation strength for this tick

    const t0 = performance.now();
    const scores = think(
      brain!, injects[n], readouts[n], C, board, player, n, seed,
      viz ? (_step, spikes, nSpk) => {
        for (let k = 0; k < nSpk; k++) {
          const b = bin[spikes[k]];
          if (acc[b] < 255) acc[b]++;
        }
        const snap = acc.slice();                   // copy then transfer; keep accumulating locally
        (self as unknown as Worker).postMessage(
          { type: 'tick', grid: snap.buffer }, [snap.buffer]);
        acc.fill(0);
      } : undefined,
      15,
    );
    const rand = mulberry32(seed ^ 0x9e3779b9);
    const { move, degenerate } = pickMove(scores, board, player, n, temp, rand);
    (self as unknown as Worker).postMessage({
      type: 'done', move, degenerate, ms: performance.now() - t0,
      scores: scores.buffer,
    }, [scores.buffer]);
  }
};
