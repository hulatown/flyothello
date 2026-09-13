/** Headless check: the engine opponent can play complete games, and every
 *  search trace it produces is structurally sound enough for TreeView. */
import { bestMove } from '../src/game/engine.js';
import { startBoard, legalMoves, applyMove, score, type Board } from '../src/game/othello.js';

let games = 0, plies = 0, bad = 0;
const nodeMax: Record<number, number> = { 6: 0, 8: 0 };
const traceMax: Record<number, number> = { 6: 0, 8: 0 };
const delays: number[] = [];

function checkTrace(trace: ReturnType<typeof bestMove>['trace'], n: number) {
  if (!trace.length) { console.log('  ✗ empty trace'); bad++; return; }
  if (trace[0].parent !== -1 || trace[0].depth !== 0) { console.log('  ✗ bad root'); bad++; }
  const seen = new Set([0]);
  for (let i = 1; i < trace.length; i++) {
    const t = trace[i];
    if (t.id !== i) { console.log(`  ✗ id mismatch at ${i}`); bad++; break; }
    if (!seen.has(t.parent)) { console.log(`  ✗ parent ${t.parent} unseen at ${i}`); bad++; break; }
    if (t.depth !== trace[t.parent].depth + 1) { console.log(`  ✗ depth break at ${i}`); bad++; break; }
    if (t.move < 0 || t.move >= n * n) { console.log(`  ✗ move out of range at ${i}`); bad++; break; }
    seen.add(t.id);
  }
  traceMax[n] = Math.max(traceMax[n], trace.length);
}

for (const n of [6, 8]) {
  for (const depth of [1, 2, 3]) {
    for (let g = 0; g < 4; g++) {
      let b: Board = startBoard(n), p = 1, guard = 0;
      while (guard++ < 200) {
        const mv = legalMoves(b, p, n);
        if (!mv.length) {
          if (!legalMoves(b, 3 - p, n).length) break;
          p = 3 - p; continue;
        }
        const t0 = performance.now();
        const d = bestMove(b, p, n, depth);
        const el = performance.now() - t0;
        if (!mv.includes(d.move)) { console.log(`  ✗ illegal move ${d.move}`); bad++; break; }
        checkTrace(d.trace, n);
        nodeMax[n] = Math.max(nodeMax[n], d.nodes);
        if (depth === 3) delays.push(Math.min(900, Math.max(250, d.nodes * 1.5)));
        if (depth === 3 && n === 8 && el > 60) { console.log(`  ✗ slow search ${el.toFixed(0)}ms`); bad++; }
        b = applyMove(b, p, d.move, n); p = 3 - p; plies++;
      }
      const [dk, lt] = score(b);
      if (dk + lt < 8) { console.log(`  ✗ game ended too early (${dk}+${lt})`); bad++; }
      games++;
    }
  }
}
delays.sort((a, b) => a - b);
console.log(`  完整对局 ${games} 局 / ${plies} 手`);
console.log(`  评估节点上限: 6x6 ${nodeMax[6]}  8x8 ${nodeMax[8]}`);
console.log(`  轨迹节点上限: 6x6 ${traceMax[6]}  8x8 ${traceMax[8]}  ← TreeView 要画的量`);
console.log(`  深度3 延迟: 中位 ${delays[delays.length >> 1] | 0}ms  最大 ${delays[delays.length - 1] | 0}ms`);
console.log(bad === 0 ? '\n✓ 全部通过' : `\n✗ ${bad} 个问题`);
process.exit(bad === 0 ? 0 : 1);
