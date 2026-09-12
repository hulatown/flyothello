/** Verify the TS simulation core against the Python reference implementation. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { FlyBrain, poissonDrive, mulberry32 } from '../src/fly/sim.js';

const A = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets');
const meta = JSON.parse(readFileSync(join(A, 'meta.json'), 'utf8'));
const C = meta.sim;
const N = meta.connectome.neurons, E = meta.connectome.edges;

function loadBuf(p: string): ArrayBuffer {
  const b = readFileSync(p);
  const ab = new ArrayBuffer(b.byteLength);
  new Uint8Array(ab).set(b);
  return ab;
}

const brain = new FlyBrain(loadBuf(join(A, 'connectome.bin')), N, E, C);
const cases = JSON.parse(readFileSync(join(A, '..', '..', 'tools', 'expected.json'), 'utf8'));

const inj: Record<number, { idx: Int32Array; cell: Int8Array }> = {};
for (const n of [6, 8]) {
  const ab = loadBuf(join(A, `inject-${n}.bin`));
  inj[n] = { idx: new Int32Array(ab, 0, 33208), cell: new Int8Array(ab, 33208 * 4, 33208) };
}

const spikes = new Int32Array(N), forced = new Int32Array(33208);
let allOk = true;

for (const c of cases) {
  const { idx, cell } = inj[c.n];
  const board: number[] = c.board;
  const view = board.slice();
  if (c.player === 2) for (let i = 0; i < view.length; i++)
    view[i] = board[i] === 1 ? 2 : board[i] === 2 ? 1 : 0;

  const rates = new Float32Array(33208).fill(C.lum.empty);
  for (let k = 0; k < 33208; k++) {
    const cl = cell[k];
    if (cl >= 0) rates[k] = view[cl] === 1 ? C.lum.mine : view[cl] === 2 ? C.lum.theirs : C.lum.empty;
  }

  brain.reset();
  const rand = mulberry32(c.seed);
  for (let t = 0; t < C.steps; t++) {
    const nf = poissonDrive(idx, rates, C.dt, rand, forced);
    brain.step(forced, nf, spikes);
  }
  const total = brain.counts.reduce((a, b) => a + b, 0);
  const active = brain.counts.reduce((a, b) => a + (b > 0 ? 1 : 0), 0);
  const dT = Math.abs(total - c.total) / c.total;
  const dA = Math.abs(active - c.active) / c.active;
  const topOk = c.top.filter(([i, v]: [number, number]) =>
    Math.abs(brain.counts[i] - v) <= Math.max(1, v * 0.05)).length;
  const ok = dT < 0.02 && dA < 0.02 && topOk >= 6;
  allOk &&= ok;
  console.log(
    `${c.n}x${c.n} seed=${c.seed}  spikes ${total} (expected ${c.total}, diff ${(dT * 100).toFixed(2)}%)  ` +
    `active ${active} (expected ${c.active}, diff ${(dA * 100).toFixed(2)}%)  top8 match ${topOk}/8  ${ok ? '✓' : '✗'}`);
}
console.log(allOk ? '\nAll passed: TS matches Python' : '\nMismatch — readout weights cannot be transferred as-is');
process.exit(allOk ? 0 : 1);
