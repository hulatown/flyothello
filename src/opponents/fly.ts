/** The connectome simulation as a playable opponent. Owns the worker dialogue. */
import { drawFly } from '../ui/fly';
import { T, type Lang } from '../ui/i18n';
import type { Opponent, ThinkRequest, ThinkResult, AgentState, Lines } from './types';
import type { BrainView } from '../ui/brainview';

export class FlyOpponent implements Opponent {
  readonly id = 'fly';
  readonly icon = '🪰';
  readonly panel = 'brain' as const;
  private seed = 1;
  private pending: ((r: ThinkResult) => void) | null = null;

  constructor(private worker: Worker, private view: () => BrainView | null) {
    const prev = worker.onmessage;
    worker.onmessage = (e: MessageEvent) => {
      const m = e.data;
      if (m.type === 'tick') this.view()?.push(m.grid);
      else if (m.type === 'done' && this.pending) {
        const done = this.pending; this.pending = null;
        done({ move: m.move, degenerate: m.degenerate, ms: m.ms, caption: `${Math.round(m.ms)} ms` });
      } else if (prev) (prev as (ev: MessageEvent) => void).call(worker, e);
    };
  }

  draw(el: HTMLElement, state: AgentState) { drawFly(el, state); }
  lines(lang: Lang): Lines { return T[lang].fly; }
  reset() { this.view()?.clear(); }

  think(req: ThinkRequest): Promise<ThinkResult> {
    if (req.say) {
      const p = T[req.lang].fly.think;
      req.say(p[(Math.random() * p.length) | 0]);
    }
    return new Promise(res => {
      this.pending = res;
      this.worker.postMessage({
        type: 'think',
        board: req.board.slice().buffer,
        n: req.n, player: req.player,
        seed: (this.seed++ * 2654435761) >>> 0,
        temp: req.temp, viz: true,
      });
    });
  }
}
