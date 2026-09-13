/** The depth-limited alpha-beta engine as a playable opponent.
 *
 * The search itself takes single-digit milliseconds. The visible delay is a
 * replay of the recorded search trace, stretched over a window proportional to
 * how many nodes were actually evaluated — so a harder position really does take
 * the robot longer, and the tree you watch is the tree it really walked.
 */
import { bestMove } from '../game/engine';
import { legalMoves } from '../game/othello';
import { drawRobot } from '../ui/robot';
import { T, type Lang } from '../ui/i18n';
import type { Opponent, ThinkRequest, ThinkResult, AgentState, Lines } from './types';
import type { TreeView } from '../ui/treeview';

const MS_PER_NODE = 1.5, MIN_MS = 250, MAX_MS = 900;

export class EngineOpponent implements Opponent {
  readonly id = 'engine';
  readonly icon = '🤖';
  readonly panel = 'tree' as const;

  constructor(private view: () => TreeView | null) {}

  draw(el: HTMLElement, state: AgentState) { drawRobot(el, state); }
  lines(lang: Lang): Lines { return T[lang].robot; }
  reset() { this.view()?.clear(); }

  think(req: ThinkRequest): Promise<ThinkResult> {
    const { board, player, n, depth, say, lang } = req;
    if (!legalMoves(board, player, n).length)
      return Promise.resolve({ move: -1, degenerate: false, ms: 0 });

    const t0 = performance.now();
    const d = bestMove(board, player, n, depth);      // ~5 ms
    const ms = Math.min(MAX_MS, Math.max(MIN_MS, d.nodes * MS_PER_NODE));

    if (say) {
      const tpl = T[lang].robot.think;
      say(tpl[(Math.random() * tpl.length) | 0]
           .replace('{n}', String(d.nodes)).replace('{d}', String(depth)));
    }
    this.view()?.play(d.trace, ms, d.move, n);

    return new Promise(res => setTimeout(() => res({
      move: d.move,
      degenerate: false,                                // the search always has a preference
      ms: performance.now() - t0,
      caption: `${d.nodes} · ${d.trace.filter(t => t.pruned).length}`,
    }), ms));
  }

}
