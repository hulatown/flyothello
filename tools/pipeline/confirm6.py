"""Pre-registered confirmatory test for the 6x6 board.

The analysis plan below was written and frozen BEFORE this data existed, after an
exploratory run on 3,000 positions produced a marginal real > shuffled result
(p = 0.047, one of four comparisons).

  Primary hypothesis (single):  real wiring top-1 > shuffled wiring top-1
  Test:                         McNemar, paired, on a pre-declared held-out split
  Threshold:                    p < 0.05, no multiple-comparison correction,
                                because this is one pre-specified hypothesis
  Secondary (reported only):    no-fly vs real; effect stability across folds

Folds are contiguous blocks rather than random: successive positions come from
the same game and are highly correlated, so a random split would leak.

Result: +0.0106, p = 0.347. The primary hypothesis was not supported; the
earlier p = 0.047 was a false positive.
"""
import os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from paths import data_dir
os.chdir(data_dir())
import numpy as np
from scipy.stats import binomtest
import othello as O, train as TR

n = 6
d = np.load('positions_6big.npz'); B,PL,M = d['boards'],d['players'],d['best']
Y = TR.onehot(M, n)
feats = {c: np.load(f'feat_6big_{c}.npy') for c in ('real','shuffled')}
feats['no-fly'] = TR.raw_features(B, PL, n)

def picks_for(X, tr, te):
    live = X[tr].std(0) > 0
    Xl = X[:, live]
    mu, sd = Xl[tr].mean(0), Xl[tr].std(0)+1e-6
    Z = (Xl-mu)/sd
    m,_ = TR.fit_readout(Z[tr], Y[tr])
    P = m.predict(Z[te])
    return np.array([max(O.legal_moves(B[j],PL[j],n), key=lambda s:P[i,s])
                     for i,j in enumerate(te)])

def mcnemar(a, b):
    n01=int((a&~b).sum()); n10=int((~a&b).sum())
    return n01, n10, (binomtest(n01,n01+n10,0.5).pvalue if n01+n10 else 1.0)

N=len(B); sp=int(N*0.8); tr=np.arange(sp); te=np.arange(sp,N)
print(f"positions {N}  train {len(tr)}  held out {len(te)}\n")
hit={k: picks_for(X,tr,te)==M[te] for k,X in feats.items()}
for k,v in hit.items():
    se=np.sqrt(v.mean()*(1-v.mean())/len(v))
    print(f"  {k:9s} top1={v.mean():.4f} ±{1.96*se:.4f}")

print("\n[PRIMARY] real vs shuffled")
n01,n10,p = mcnemar(hit['real'], hit['shuffled'])
print(f"  diff {hit['real'].mean()-hit['shuffled'].mean():+.4f}   McNemar {n01}/{n10}   p={p:.5f}")
print(f"  → {'supported: the fly topology contributes' if p<0.05 else 'not supported: indistinguishable from a random graph'}")

print("\n[SECONDARY] no-fly vs real")
n01,n10,p2 = mcnemar(hit['no-fly'], hit['real'])
print(f"  diff {hit['no-fly'].mean()-hit['real'].mean():+.4f}   McNemar {n01}/{n10}   p={p2:.5f}")

print("\n[STABILITY] 5 contiguous blocks")
diffs=[]
for f in range(5):
    lo,hi = f*N//5, (f+1)*N//5
    te2=np.arange(lo,hi); tr2=np.concatenate([np.arange(0,lo),np.arange(hi,N)])
    r=picks_for(feats['real'],tr2,te2)==M[te2]
    s=picks_for(feats['shuffled'],tr2,te2)==M[te2]
    diffs.append(r.mean()-s.mean())
    print(f"  fold {f+1}: real {r.mean():.4f}  shuffled {s.mean():.4f}  diff {diffs[-1]:+.4f}")
diffs=np.array(diffs)
print(f"  mean {diffs.mean():+.4f} ± {diffs.std():.4f}   {int((diffs>0).sum())}/5 folds positive")
