import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { FlyBrain, poissonDrive, mulberry32 } from '../src/fly/sim.js';
const A = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets');
const meta = JSON.parse(readFileSync(join(A, 'meta.json'), 'utf8')); const C = meta.sim;
const N = meta.connectome.neurons, E = meta.connectome.edges;
const load = (p: string) => { const b = p.endsWith('.gz') ? gunzipSync(readFileSync(p)) : readFileSync(p); const ab = new ArrayBuffer(b.byteLength); new Uint8Array(ab).set(b); return ab; };
const brain = new FlyBrain(load(join(A, 'connectome.bin.gz')), N, E, C);
const ab = load(join(A, 'inject-8.bin'));
const idx = new Int32Array(ab, 0, 33208);
const rates = new Float32Array(33208).fill(50);
for (let i = 0; i < 33208; i += 3) rates[i] = 190;
const spikes = new Int32Array(N), forced = new Int32Array(33208);
for (const steps of [300, 150]) {
  for (let warm = 0; warm < 2; warm++) { brain.reset(); const r = mulberry32(1); for (let t=0;t<steps;t++) brain.step(forced, poissonDrive(idx,rates,C.dt,r,forced), spikes); }
  const t0 = performance.now(); const R = 5;
  for (let k = 0; k < R; k++) { brain.reset(); const r = mulberry32(k); for (let t=0;t<steps;t++) brain.step(forced, poissonDrive(idx,rates,C.dt,r,forced), spikes); }
  const ms = (performance.now() - t0) / R;
  console.log(`${steps} steps (${steps*0.1}ms biological time): ${ms.toFixed(0)} ms per move`);
}
