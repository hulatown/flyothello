/** Othello rules. 0 = empty, 1 = dark, 2 = light. Supports 6x6 and 8x8. */
export type Cell = 0 | 1 | 2;
export type Board = Int8Array;
export const DARK = 1, LIGHT = 2;

const DIRS: [number, number][] = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];

export function startBoard(n: number): Board {
  const b = new Int8Array(n * n); const c = n / 2;
  b[(c - 1) * n + (c - 1)] = LIGHT; b[(c - 1) * n + c] = DARK;
  b[c * n + (c - 1)] = DARK;        b[c * n + c] = LIGHT;
  return b;
}

export function flips(b: Board, p: number, sq: number, n: number): number[] {
  if (b[sq]) return [];
  const r = (sq / n) | 0, c = sq % n, opp = 3 - p, out: number[] = [];
  for (const [dr, dc] of DIRS) {
    const buf: number[] = [];
    let rr = r + dr, cc = c + dc;
    while (rr >= 0 && rr < n && cc >= 0 && cc < n) {
      const t = rr * n + cc, v = b[t];
      if (v === opp) buf.push(t);
      else { if (v === p) out.push(...buf); break; }
      rr += dr; cc += dc;
    }
  }
  return out;
}

export function legalMoves(b: Board, p: number, n: number): number[] {
  const out: number[] = [];
  for (let s = 0; s < n * n; s++) if (!b[s] && flips(b, p, s, n).length) out.push(s);
  return out;
}

export function applyMove(b: Board, p: number, sq: number, n: number): Board {
  const nb = b.slice(); nb[sq] = p as Cell;
  for (const t of flips(b, p, sq, n)) nb[t] = p as Cell;
  return nb;
}

export function score(b: Board): [number, number] {
  let d = 0, l = 0;
  for (const v of b) { if (v === DARK) d++; else if (v === LIGHT) l++; }
  return [d, l];
}

export function isOver(b: Board, n: number): boolean {
  return legalMoves(b, DARK, n).length === 0 && legalMoves(b, LIGHT, n).length === 0;
}

/** Perspective normalisation: the side to move is always presented as dark,
 * matching how the readout was trained. */
export function moverView(b: Board, player: number): Int8Array {
  if (player === DARK) return b;
  const v = new Int8Array(b.length);
  for (let i = 0; i < b.length; i++) v[i] = b[i] === 1 ? 2 : b[i] === 2 ? 1 : 0;
  return v;
}
