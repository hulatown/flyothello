"""Othello rules plus a small alpha-beta engine. Supports 6x6 and 8x8.

0 = empty, 1 = dark, 2 = light.
"""
import numpy as np
from functools import lru_cache

DIRS = [(-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1)]

@lru_cache(maxsize=None)
def _rays(n):
    """Precomputed ray of squares from each square in each direction."""
    out = []
    for s in range(n*n):
        r, c = divmod(s, n); per_dir = []
        for dr, dc in DIRS:
            ray = []; rr, cc = r+dr, c+dc
            while 0 <= rr < n and 0 <= cc < n:
                ray.append(rr*n+cc); rr += dr; cc += dc
            per_dir.append(tuple(ray))
        out.append(tuple(per_dir))
    return tuple(out)

def start_board(n=8):
    b = np.zeros(n*n, np.int8); c = n//2
    b[(c-1)*n+(c-1)] = 2; b[(c-1)*n+c] = 1
    b[c*n+(c-1)] = 1;     b[c*n+c] = 2
    return b

def flips_for(b, player, sq, n):
    if b[sq]: return ()
    opp = 3 - player; got = []
    for ray in _rays(n)[sq]:
        buf = []
        for t in ray:
            v = b[t]
            if v == opp: buf.append(t)
            elif v == player:
                got.extend(buf); break
            else: break
        else: continue
    return tuple(got)

def legal_moves(b, player, n):
    return [s for s in range(n*n) if b[s] == 0 and flips_for(b, player, s, n)]

def apply_move(b, player, sq, n):
    nb = b.copy(); nb[sq] = player
    for t in flips_for(b, player, sq, n): nb[t] = player
    return nb

def _weights(n):
    """Classic positional weights: corners >> edges >> squares next to corners."""
    W = np.ones((n, n), np.float32) * 1.0
    W[0,:] = W[-1,:] = W[:,0] = W[:,-1] = 3.0
    W[0,0] = W[0,-1] = W[-1,0] = W[-1,-1] = 30.0
    for r,c in [(0,1),(1,0),(1,1)]:
        for rr,cc in [(r,c),(r,n-1-c),(n-1-r,c),(n-1-r,n-1-c)]:
            W[rr,cc] = -8.0
    return W.ravel()

def evaluate(b, player, n):
    W = _weights(n); opp = 3-player
    pos = W[b == player].sum() - W[b == opp].sum()
    mob = len(legal_moves(b, player, n)) - len(legal_moves(b, opp, n))
    return pos + 4.0*mob

def search(b, player, n, depth, a=-1e9, beta=1e9):
    mv = legal_moves(b, player, n)
    if not mv:
        if not legal_moves(b, 3-player, n):
            d = int((b == player).sum() - (b == 3-player).sum())
            return 1e6*np.sign(d), None
        s, _ = search(b, 3-player, n, depth, -beta, -a)
        return -s, None
    if depth == 0:
        return evaluate(b, player, n), max(mv, key=lambda s: _weights(n)[s])
    best, bm = -1e9, mv[0]
    for s in sorted(mv, key=lambda s: -_weights(n)[s]):
        sc, _ = search(apply_move(b, player, s, n), 3-player, n, depth-1, -beta, -a)
        sc = -sc
        if sc > best: best, bm = sc, s
        a = max(a, sc)
        if a >= beta: break
    return best, bm

def best_move(b, player, n, depth=3):
    return search(b, player, n, depth)[1]
