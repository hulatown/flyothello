"""Generate labelled training positions.

Self-play with injected noise spreads the positions out; each position is then
labelled with the best move from a depth-3 search.
"""
import numpy as np, time, sys
import othello as O

def generate(n, n_pos, eps=0.30, depth=3, seed=0):
    rng = np.random.default_rng(seed)
    boards, players, bests = [], [], []
    t0 = time.perf_counter()
    while len(boards) < n_pos:
        b, p = O.start_board(n), 1
        while len(boards) < n_pos:
            mv = O.legal_moves(b, p, n)
            if not mv:
                if not O.legal_moves(b, 3-p, n): break
                p = 3-p; continue
            # record the position plus the depth-3 best move as its label
            boards.append(b.copy()); players.append(p)
            bests.append(O.best_move(b, p, n, depth))
            # play on with a shallow engine plus eps noise to keep positions diverse
            s = rng.choice(mv) if rng.random() < eps else O.best_move(b, p, n, 1)
            b = O.apply_move(b, p, int(s), n); p = 3-p
            if len(boards) % 250 == 0:
                el = time.perf_counter()-t0
                print(f"  {n}x{n} {len(boards)}/{n_pos}  {el:.0f}s  eta {el/len(boards)*(n_pos-len(boards)):.0f}s", flush=True)
    return (np.stack(boards), np.array(players), np.array(bests))

if __name__ == '__main__':
    for n, k in ((8, 5000), (6, 3000)):
        B, P, M = generate(n, k, seed=n)
        np.savez_compressed(f'positions_{n}.npz', boards=B, players=P, best=M)
        legal_cnt = np.mean([len(O.legal_moves(B[i], P[i], n)) for i in range(0, len(B), 50)])
        print(f"{n}x{n}: {len(B)} positions saved, mean legal moves {legal_cnt:.1f}", flush=True)
