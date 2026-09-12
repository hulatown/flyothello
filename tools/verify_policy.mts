/** End-to-end: run the full TS policy chain and compare scores and moves against Python. */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { FlyBrain } from '../src/fly/sim.js';
import { think, pickMove, parseReadout, parseInject } from '../src/fly/policy.js';
import { mulberry32 } from '../src/fly/rng.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const A = join(root, 'public', 'assets');
const meta = JSON.parse(readFileSync(join(A, 'meta.json'), 'utf8'));
const C = meta.sim;
const load = (p: string) => { const b = p.endsWith('.gz') ? gunzipSync(readFileSync(p)) : readFileSync(p); const ab = new ArrayBuffer(b.byteLength); new Uint8Array(ab).set(b); return ab; };

const brain = new FlyBrain(load(join(A, 'connectome.bin.gz')), meta.connectome.neurons, meta.connectome.edges, C);
const ro: Record<number, ReturnType<typeof parseReadout>> = {};
const inj: Record<number, ReturnType<typeof parseInject>> = {};
for (const n of [6, 8]) {
  ro[n] = parseReadout(load(join(A, `readout-${n}.bin`)), n * n);
  inj[n] = parseInject(load(join(A, `inject-${n}.bin`)));
}
console.log(`readout live: 6x6=${ro[6].ids.length} 8x8=${ro[8].ids.length}`);

const cases = JSON.parse(readFileSync(join(root, 'tools', 'expected_policy.json'), 'utf8'));
let ok = true;
for (const c of cases) {
  const board = new Int8Array(c.board);
  const s = think(brain, inj[c.n], ro[c.n], C, board, c.player, c.n, c.seed);
  const { move } = pickMove(s, board, c.player, c.n, 0, mulberry32(1));
  let maxAbs = 0;
  for (let i = 0; i < s.length; i++) maxAbs = Math.max(maxAbs, Math.abs(s[i] - c.scores[i]));
  const good = move === c.move && maxAbs < 1e-4;
  ok &&= good;
  console.log(`${c.n}x${c.n} seed=${c.seed}  move ${move} (expected ${c.move})  max score deviation ${maxAbs.toExponential(2)}  ${good ? '✓' : '✗'}`);
}
console.log(ok ? '\nEnd-to-end match: the browser runs the same fly the readout was trained on' : '\nMISMATCH');
process.exit(ok ? 0 : 1);
