"""Decoding score plus a permutation test.

Key detail: the null distribution must go through the identical model-selection
pipeline, otherwise the observed score gets a free selection advantage.
"""
import numpy as np
from sklearn.decomposition import PCA
from sklearn.linear_model import Ridge
from sklearn.model_selection import KFold

KS     = (5, 10, 20, 40)
ALPHAS = (1e-1, 1, 10, 1e2, 1e3, 1e4)
MIN_R2 = 0.05          # effect-size floor: below this, "significant" is not practically meaningful

def _cv(F, Y, seed):
    best = -np.inf
    for a in ALPHAS:
        p = np.zeros_like(Y)
        for tr, te in KFold(5, shuffle=True, random_state=seed).split(F):
            p[te] = Ridge(alpha=a).fit(F[tr], Y[tr]).predict(F[te])
        best = max(best, 1 - ((Y-p)**2).sum() / ((Y-Y.mean(0))**2).sum())
    return best

def score(feats, Y, seed=0):
    """feats: {k: PCA-reduced features}. Returns (best R^2, best k) over k and alpha."""
    r = [(_cv(F, Y, seed), k) for k, F in feats.items()]
    return max(r)

def decode(Z, Y, n_perm=100):
    Y = np.asarray(Y, np.float64)
    n = len(Y)
    feats = {k: PCA(k, random_state=0).fit_transform(Z) for k in KS if k < min(n, Z.shape[1])}
    obs, best_k = score(feats, Y)
    # null: shuffle the pairing, then run the identical selection pipeline
    null = np.array([score(feats, Y[np.random.default_rng(s).permutation(n)], seed=s)[0]
                     for s in range(n_perm)])
    thr = np.percentile(null, 95)
    p   = (null >= obs).mean()
    ok  = (obs > thr) and (obs >= MIN_R2)
    return dict(r2=obs, k=best_k, null95=thr, p=p, verdict="informative" if ok else "not significant")
