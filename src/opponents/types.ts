/** A playable opponent. Designed so more "brains" can be added later:
 *  main.ts only ever talks to this interface, never to a specific opponent. */
import type { Board } from '../game/othello';
import type { Lang } from '../ui/i18n';

export type AgentState = 'idle' | 'think' | 'happy' | 'sad' | 'shrug' | 'nap';

export interface Lines {
  think: readonly string[];
  idle: readonly string[];
  shrug: string;
  note: string;
}

export interface ThinkRequest {
  board: Board;
  player: number;   // which side the opponent plays
  n: number;
  temp: number;     // difficulty knob; meaning is opponent-specific
  depth: number;    // search depth, ignored by opponents that do not search
  lang: Lang;
  /** Push a line while thinking, so opponents can report real numbers. */
  say?: (text: string) => void;
}

export interface ThinkResult {
  move: number;         // -1 when there is no legal move
  degenerate: boolean;  // the opponent had no real preference
  ms: number;           // wall time actually spent presenting the decision
  caption?: string;     // short factual line for the panel, e.g. "212 nodes"
}

export interface Opponent {
  readonly id: string;
  readonly icon: string;                 // shown in the segmented control
  readonly panel: 'brain' | 'tree';      // which visualiser this opponent drives
  draw(el: HTMLElement, state: AgentState): void;
  lines(lang: Lang): Lines;
  /** Resolve with a move. May animate while thinking. */
  think(req: ThinkRequest): Promise<ThinkResult>;
  /** Called when a new game starts. */
  reset(): void;
}
