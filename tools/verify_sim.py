"""Python reference implementation using a mulberry32 identical to the TS one.

Writes the expected simulation output for tools/verify_sim.mts to compare against.
"""
import os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent / 'pipeline'))
from paths import data_dir, asset_dir
os.chdir(data_dir())
import numpy as np, json
import othello as O
A = str(asset_dir())
M = json.load(open(f'{A}/meta.json')); C = M['sim']

class MB32:
    """mulberry32, bit-identical to src/fly/rng.ts."""
    def __init__(s, seed): s.a = seed & 0xFFFFFFFF
    def __call__(s):
        s.a = (s.a + 0x6D2B79F5) & 0xFFFFFFFF
        t = s.a
        t = (t ^ (t >> 15)) * (t | 1) & 0xFFFFFFFF
        t = (t ^ (t + ((t ^ (t >> 7)) * (t | 61) & 0xFFFFFFFF))) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

N = M['connectome']['neurons']; E = M['connectome']['edges']
raw = open(f'{A}/connectome.bin','rb').read()
indptr = np.frombuffer(raw, np.int32, N+1, 0)
post   = np.frombuffer(raw, np.int32, E, (N+1)*4)
w8     = np.frombuffer(raw, np.int8,  E, (N+1)*4 + E*4)

def run(n, board, player, seed):
    ib = open(f'{A}/inject-{n}.bin','rb').read()
    idx  = np.frombuffer(ib, np.int32, 33208, 0)
    cell = np.frombuffer(ib, np.int8, 33208, 33208*4)
    v = np.full(N, C['v0'], np.float32); g = np.zeros(N, np.float32)
    refr = np.zeros(N, np.int32)
    dly = round(C['tdly']/C['dt']); rfc = round(C['trfc']/C['dt'])
    ring = np.zeros((dly+1, N), np.float32); counts = np.zeros(N, np.int32)
    decay = np.exp(-C['dt']/C['tau']); kV = C['dt']/C['tmbr']
    view = board.copy()
    if player == 2: view[board==1]=2; view[board==2]=1
    L = C['lum']; rates = np.full(33208, L['empty'], np.float32)
    on = cell >= 0
    rates[on] = np.where(view[cell[on]]==1, L['mine'], np.where(view[cell[on]]==2, L['theirs'], L['empty']))
    rnd = MB32(seed)
    for t in range(C['steps']):
        slot = t % (dly+1)
        g += ring[slot]; ring[slot] = 0
        free = refr <= 0
        v[free] += kV*(C['v0'] - v[free] + g[free]); refr[~free] -= 1
        g *= decay
        spk = list(np.flatnonzero((refr<=0) & (v > C['vth'])))
        fset = [int(idx[k]) for k in range(33208) if rnd() < rates[k]*C['dt']]
        sset = set(spk); spk += [i for i in fset if i not in sset]
        out = (t+dly) % (dly+1)
        for i in spk:
            v[i]=C['vrst']; g[i]=0; refr[i]=rfc; counts[i]+=1
            a,b = indptr[i], indptr[i+1]
            np.add.at(ring[out], post[a:b], w8[a:b]*C['wsyn'])
        for i in fset: refr[i]=0
    return counts

cases=[]
rng=np.random.default_rng(3)
for n in (6,8):
    for k in range(3):
        b=O.start_board(n); p=1
        for _ in range(rng.integers(3,14)):
            mv=O.legal_moves(b,p,n)
            if not mv: break
            b=O.apply_move(b,p,int(rng.choice(mv)),n); p=3-p
        seed=1000+k
        c=run(n,b,p,seed)
        cases.append(dict(n=n, board=b.tolist(), player=int(p), seed=seed,
                          total=int(c.sum()), active=int((c>0).sum()),
                          top=[[int(i),int(c[i])] for i in np.argsort(c)[::-1][:8]]))
        print(f"{n}x{n} seed={seed}: total spikes {c.sum()}, active {(c>0).sum()}", flush=True)
json.dump(cases, open(Path(__file__).parent / 'expected.json','w'))
print("wrote tools/expected.json")
