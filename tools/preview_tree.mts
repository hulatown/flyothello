/** Render TreeView to PNGs with node-canvas, so the layout can be eyeballed
 *  without a browser. Not part of the test suite; a design aid. */
import { createCanvas } from 'canvas';
import { writeFileSync } from 'node:fs';
import { TreeView } from '../src/ui/treeview.js';
import { bestMove } from '../src/game/engine.js';
import { startBoard, legalMoves, applyMove } from '../src/game/othello.js';

const g = globalThis as unknown as Record<string, unknown>;
g.requestAnimationFrame = (cb: (t: number) => void) => { cb(0); return 1; };
g.cancelAnimationFrame = () => {};

function shot(n: number, plies: number, file: string, progress = 1) {
  let b = startBoard(n), p = 1;
  for (let i = 0; i < plies; i++) {
    const mv = legalMoves(b, p, n); if (!mv.length) break;
    b = applyMove(b, p, mv[i % mv.length], n); p = 3 - p;
  }
  const d = bestMove(b, p, n, 3);
  const cv = createCanvas(640, 308);
  const tv = new TreeView(cv as unknown as HTMLCanvasElement);
  let t = 0;
  g.performance = { now: () => (t += progress >= 1 ? 1e6 : 0) };
  tv.play(d.trace, progress >= 1 ? 1 : 1000, d.move, n);
  if (progress < 1) {                       // sample a mid-animation frame
    g.performance = { now: () => 1000 * progress };
    (tv as unknown as { paintAt: (p: number, b: number) => void });
  }
  writeFileSync(file, cv.toBuffer('image/png'));
  const d1 = d.trace.filter(x => x.depth === 1);
  console.log(`  ${file.padEnd(26)} ${n}x${n}  轨迹 ${String(d.trace.length).padStart(4)} 节点  ` +
    `第一层 ${String(d1.length).padStart(2)} 个(剪枝 ${d1.filter(x => x.pruned).length})  标签间距 ${(280 / d1.length).toFixed(1)}px`);
}
shot(8, 16, '/tmp/tree-8x8.png');
shot(8, 34, '/tmp/tree-8x8-late.png');
shot(6, 10, '/tmp/tree-6x6.png');
