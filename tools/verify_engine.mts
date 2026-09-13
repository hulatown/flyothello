/** Verify the TS engine picks the same moves as the Python reference. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { bestMove } from '../src/game/engine.js';
import { legalMoves } from '../src/game/othello.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cases = JSON.parse(readFileSync(join(root, 'tools', 'expected_engine.json'), 'utf8'));
let bad = 0, total = 0;
const nodeStats: Record<number, number[]> = { 6: [], 8: [] };

for (const c of cases) {
  const board = new Int8Array(c.board);
  for (const d of [1, 2, 3]) {
    const r = bestMove(board, c.player, c.n, d);
    total++;
    if (r.move !== c.moves[String(d)]) {
      bad++;
      if (bad <= 5) console.log(`  ✗ ${c.n}x${c.n} depth=${d}: TS ${r.move} vs Python ${c.moves[String(d)]}`);
    }
    if (d === 3) nodeStats[c.n].push(r.nodes);
    // trace sanity
    const t = r.trace;
    if (t.length && t[0].parent !== -1) { console.log('  ✗ trace root malformed'); bad++; }
    for (const nd of t) if (nd.parent >= nd.id && nd.id !== 0) { console.log('  ✗ trace parent order'); bad++; break; }
  }
  const mv = legalMoves(board, c.player, c.n);
  const r = bestMove(board, c.player, c.n, 3);
  if (!mv.includes(r.move)) { console.log(`  ✗ illegal move ${r.move}`); bad++; }
}
for (const n of [6, 8]) {
  const s = nodeStats[n].sort((a, b) => a - b);
  console.log(`  ${n}x${n} depth3 评估节点: 中位 ${s[s.length >> 1]}  最多 ${s[s.length - 1]}`);
}
console.log(bad === 0 ? `\n✓ ${total} 个 (局面 × 深度) 全部与 Python 一致` : `\n✗ ${bad}/${total} 不一致`);
process.exit(bad === 0 ? 0 : 1);
