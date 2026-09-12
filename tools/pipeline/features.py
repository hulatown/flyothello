"""Position -> fly readout features. Three wiring conditions, two board sizes."""
import numpy as np, pandas as pd, json
from flylif import FlyBrain, DT
import retina as R

STEPS   = 300          # 30 ms of biological time
CON     = '_con_5.parquet'
COMP    = 'Completeness_783.csv'
_ann = None

def ann():
    global _ann
    if _ann is None:
        _ann = pd.read_csv('annot.tsv', sep='\t', low_memory=False)
    return _ann

def make_brain(condition='real', seed=0):
    """real = true wiring; shuffled = degree-matched permutation that keeps
    out-degree and the weight multiset but randomises topology."""
    if condition == 'real':
        return FlyBrain(COMP, CON)
    con = pd.read_parquet(CON)
    rng = np.random.default_rng(seed)
    con = con.copy()
    con['Postsynaptic_Index'] = rng.permutation(con['Postsynaptic_Index'].values)
    p = f'_con_shuf_{seed}.parquet'; con.to_parquet(p)
    return FlyBrain(COMP, p)

def make_retina(brain, n):
    """Retinotopic map over the relay layer: which board square each site sees."""
    seam = ann()[ann().cell_type.astype(str).isin(json.load(open('fib.json'))['output_units'])]
    idx, cell = [], []
    for side in ['left', 'right']:
        h = seam[seam.side == side]
        keep = [f in brain.idx for f in h.root_id]
        ids  = [brain.idx[f] for f in h.root_id if f in brain.idx]
        P = h.loc[keep, ['pos_x','pos_y','pos_z']].to_numpy(float); P -= P.mean(0)
        _, _, Vt = np.linalg.svd(P, full_matrices=False); uv = P @ Vt[:2].T
        lo, hi = np.percentile(uv,1,0), np.percentile(uv,99,0); uv = (uv-lo)/(hi-lo)
        m = 0.2
        gx = np.floor((uv[:,0]-m)/0.6*n); gy = np.floor((uv[:,1]-m)/0.6*n)
        ok = (gx>=0)&(gx<n)&(gy>=0)&(gy<n)
        idx.extend(ids); cell.extend(np.where(ok, gy*n+gx, -1).astype(int).tolist())
    return np.array(idx, np.int64), np.array(cell, np.int64)

def readout_ids(brain):
    a = ann()
    return np.array([brain.idx[f] for f in
                     a[a.super_class == 'visual_projection'].root_id if f in brain.idx])

def to_mover_view(board, player):
    """Perspective normalisation: the side to move is always presented as dark."""
    if player == 1: return board
    out = board.copy(); out[board == 1] = 2; out[board == 2] = 1
    return out

def extract(brain, idx, cell, ro, boards, players, seed=0, log=None):
    rng = np.random.default_rng(seed)
    X = np.zeros((len(boards), len(ro)), np.float32)
    on = cell >= 0
    for k in range(len(boards)):
        v = to_mover_view(boards[k], players[k])
        rates = np.full(len(idx), R.LUM[R.EMPTY], np.float32)
        rates[on] = np.array([R.LUM[int(t)] for t in v[cell[on]]], np.float32)
        brain.reset(); c = np.zeros(brain.N, np.int64)
        for _ in range(STEPS):
            c[brain.step(forced=idx[rng.random(len(idx)) < rates*DT])] += 1
        X[k] = c[ro]
        if log and (k+1) % 250 == 0: print(f"   {log} {k+1}/{len(boards)}", flush=True)
    return X
