"""Train the readout and evaluate: real wiring / shuffled wiring / no-fly / random legal."""
import numpy as np, sys, time
from sklearn.linear_model import Ridge
import othello as O, features as F

def onehot(best, n): 
    Y = np.zeros((len(best), n*n), np.float32); Y[np.arange(len(best)), best] = 1; return Y

def raw_features(boards, players, n):
    """No-fly control: perspective-normalised two-plane board encoding."""
    V = np.stack([F.to_mover_view(boards[i], players[i]) for i in range(len(boards))])
    return np.concatenate([(V == 1).astype(np.float32), (V == 2).astype(np.float32)], 1)

def fit_readout(Xtr, Ytr, alphas=(1, 10, 1e2, 1e3, 1e4)):
    """Pick alpha on a validation split."""
    k = int(len(Xtr)*0.85)
    best, bm = -1, None
    for a in alphas:
        m = Ridge(alpha=a).fit(Xtr[:k], Ytr[:k])
        s = (m.predict(Xtr[k:]).argmax(1) == Ytr[k:].argmax(1)).mean()
        if s > best: best, bm = s, a
    return Ridge(alpha=bm).fit(Xtr, Ytr), bm

def top1_legal(model, X, boards, players, best, n):
    """Top-1 agreement under a legal-move mask, plus the random-legal baseline."""
    P = model.predict(X); hit = 0; base = 0
    for i in range(len(X)):
        mv = O.legal_moves(boards[i], players[i], n)
        if not mv: continue
        pick = max(mv, key=lambda s: P[i, s])
        hit += (pick == best[i]); base += 1.0/len(mv)
    return hit/len(X), base/len(X)

def run(n, conditions=('real','shuffled'), n_pos=None):
    d = np.load(f'positions_{n}.npz')
    B, PL, M = d['boards'], d['players'], d['best']
    if n_pos: B, PL, M = B[:n_pos], PL[:n_pos], M[:n_pos]
    Y = onehot(M, n); split = int(len(B)*0.8)
    print(f"\n=== {n}x{n}  positions {len(B)}  train {split} / test {len(B)-split} ===")
    rows = []
    for cond in conditions:
        t0 = time.perf_counter()
        br = F.make_brain(cond, seed=11)
        idx, cell = F.make_retina(br, n); ro = F.readout_ids(br)
        X = F.extract(br, idx, cell, ro, B, PL, seed=5, log=f"{n}x{n}/{cond}")
        np.save(f'feat_{n}_{cond}.npy', X)
        live = X.std(0) > 0; X = X[:, live]
        mu, sd = X[:split].mean(0), X[:split].std(0)+1e-6
        Z = (X-mu)/sd
        m, a = fit_readout(Z[:split], Y[:split])
        acc, base = top1_legal(m, Z[split:], B[split:], PL[split:], M[split:], n)
        rows.append((cond, X.shape[1], acc, base, a, time.perf_counter()-t0))
        print(f"  {cond:9s} live dims {X.shape[1]:5d} top1={acc:.3f} (random baseline {base:.3f}) alpha={a:g} {rows[-1][5]:.0f}s", flush=True)
    Xr = raw_features(B, PL, n)
    m, a = fit_readout(Xr[:split], Y[:split])
    acc, base = top1_legal(m, Xr[split:], B[split:], PL[split:], M[split:], n)
    rows.append(('no-fly', Xr.shape[1], acc, base, a, 0))
    print(f"  {'no-fly':9s} dims {Xr.shape[1]:8d} top1={acc:.3f} (random baseline {base:.3f}) alpha={a:g}")
    np.save(f'result_{n}.npy', np.array(rows, dtype=object), allow_pickle=True)
    return rows

if __name__ == '__main__':
    for n in (int(x) for x in sys.argv[1:] or [8]):
        run(n)
