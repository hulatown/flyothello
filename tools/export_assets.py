"""Export the connectome, readout, injection map and visualisation coordinates
as flat binaries the browser can read directly.
"""
import os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent / 'pipeline'))
from paths import data_dir, asset_dir
os.chdir(data_dir())
import numpy as np, pandas as pd, json
import features as F, train as TR
from flylif import FlyBrain, W_SYN, DT, V_0, V_RST, V_TH, T_MBR, TAU, T_RFC, T_DLY

OUT = str(asset_dir())
meta = {}

# ---------- 1. connectome (CSR, |synapses| >= 5) ----------
con = pd.read_parquet('_con_5.parquet')
pre  = con['Presynaptic_Index'].to_numpy(np.int32)
post = con['Postsynaptic_Index'].to_numpy(np.int32)
wgt  = con['Excitatory x Connectivity'].to_numpy()
assert np.abs(wgt).max() <= 2405
o = np.lexsort((post, pre)); post, wgt = post[o], wgt[o]
N = 138639
indptr = np.zeros(N+1, np.int32); np.cumsum(np.bincount(pre, minlength=N), out=indptr[1:])
# Clip weights to int8: 99.9% of edges have |w| <= 127, the rest saturate.
w8 = np.clip(wgt, -127, 127).astype(np.int8)
clipped = int((np.abs(wgt) > 127).sum())
with open(f'{OUT}/connectome.bin','wb') as f:
    f.write(indptr.tobytes()); f.write(post.tobytes()); f.write(w8.tobytes())
meta['connectome'] = dict(neurons=N, edges=int(len(post)), threshold=5, clipped=clipped,
                          layout='int32 indptr[N+1], int32 post[E], int8 weight[E]')
print(f"connectome.bin  {len(post):,} edges, {clipped} saturated, "
      f"{os.path.getsize(f'{OUT}/connectome.bin')/1e6:.1f}MB")

# ---------- 2. visualisation coordinates ----------
xy = np.load('viz_xy.npy')
u = np.stack([((xy[:,0]-xy[:,0].min())/(xy[:,0].ptp())*65535).astype(np.uint16),
              ((xy[:,1]-xy[:,1].min())/(xy[:,1].ptp())*65535).astype(np.uint16)], 1)
u.tofile(f'{OUT}/positions.bin')
meta['positions'] = dict(count=N, layout='uint16 x[N], interleaved xy', aspect=float(xy[:,0].ptp()/xy[:,1].ptp()))
print(f"positions.bin   {os.path.getsize(f'{OUT}/positions.bin')/1e3:.0f}KB")

# ---------- 3. per board size: injection map + readout ----------
brain = FlyBrain('Completeness_783.csv', '_con_5.parquet')
for n, featfile in ((8, 'feat_8_real.npy'), (6, 'feat_6big_real.npy')):
    idx, cell = F.make_retina(brain, n)
    ro = F.readout_ids(brain)
    np.concatenate([idx.astype(np.int32).view(np.uint8),
                    cell.astype(np.int8).view(np.uint8)]).tofile(f'{OUT}/inject-{n}.bin')

    X = np.load(featfile)
    pf = 'positions_6big.npz' if n == 6 else 'positions_8.npz'
    d = np.load(pf); B, PL, M = d['boards'], d['players'], d['best']
    assert len(X) == len(B), (len(X), len(B))
    live = X.std(0) > 0
    Xl = X[:, live]; mu, sd = Xl.mean(0), Xl.std(0)+1e-6
    model, alpha = TR.fit_readout((Xl-mu)/sd, TR.onehot(M, n))   # fit on all data for the shipped model
    Wm = model.coef_.astype(np.float32)                          # (n*n, live)
    b  = model.intercept_.astype(np.float32)
    with open(f'{OUT}/readout-{n}.bin','wb') as f:
        f.write(ro[live].astype(np.int32).tobytes())
        f.write(mu.astype(np.float32).tobytes()); f.write(sd.astype(np.float32).tobytes())
        f.write(Wm.tobytes()); f.write(b.tobytes())
    meta[f'board{n}'] = dict(inject=int(len(idx)), readout=int(live.sum()), alpha=float(alpha),
                             cells=n*n, trained_on=int(len(B)))
    print(f"inject-{n}.bin  {len(idx):,} injection sites | readout-{n}.bin  {int(live.sum())} dims x {n*n}  alpha={alpha:g}")

# ---------- 4. simulation constants ----------
meta['sim'] = dict(dt=DT, v0=V_0, vrst=V_RST, vth=V_TH, tmbr=T_MBR, tau=TAU,
                   trfc=T_RFC, tdly=T_DLY, wsyn=W_SYN, steps=F.STEPS,
                   lum=dict(empty=50.0, mine=10.0, theirs=190.0))
json.dump(meta, open(f'{OUT}/meta.json','w'), indent=1)
print("\nmeta.json:"); print(json.dumps(meta, indent=1)[:900])
