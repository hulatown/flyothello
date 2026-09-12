"""End-to-end reference: read the exported readout-*.bin, run the reference
simulation, and emit the expected scores and chosen move.
"""
import os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent / 'pipeline'))
from paths import data_dir, asset_dir
os.chdir(data_dir())
import numpy as np, json
import othello as O
from verify_sim import MB32, N, indptr, post, w8, A, C

def readout(n):
    b = open(f'{A}/readout-{n}.bin','rb').read()
    cells = n*n; live = (len(b) - cells*4)//(12 + 4*cells)
    o=0
    ids=np.frombuffer(b,np.int32,live,o); o+=live*4
    mu =np.frombuffer(b,np.float32,live,o); o+=live*4
    sd =np.frombuffer(b,np.float32,live,o); o+=live*4
    W  =np.frombuffer(b,np.float32,cells*live,o).reshape(cells,live); o+=cells*live*4
    bb =np.frombuffer(b,np.float32,cells,o)
    return ids,mu,sd,W,bb,live

def sim(n, board, player, seed):
    ib=open(f'{A}/inject-{n}.bin','rb').read()
    idx=np.frombuffer(ib,np.int32,33208,0); cell=np.frombuffer(ib,np.int8,33208,33208*4)
    v=np.full(N,C['v0'],np.float32); g=np.zeros(N,np.float32); refr=np.zeros(N,np.int32)
    dly=round(C['tdly']/C['dt']); rfc=round(C['trfc']/C['dt'])
    ring=np.zeros((dly+1,N),np.float32); counts=np.zeros(N,np.int32)
    decay=np.exp(-C['dt']/C['tau']); kV=C['dt']/C['tmbr']
    view=board.copy()
    if player==2: view[board==1]=2; view[board==2]=1
    L=C['lum']; rates=np.full(33208,L['empty'],np.float32); on=cell>=0
    rates[on]=np.where(view[cell[on]]==1,L['mine'],np.where(view[cell[on]]==2,L['theirs'],L['empty']))
    rnd=MB32(seed)
    for t in range(C['steps']):
        slot=t%(dly+1); g+=ring[slot]; ring[slot]=0
        free=refr<=0; v[free]+=kV*(C['v0']-v[free]+g[free]); refr[~free]-=1; g*=decay
        spk=list(np.flatnonzero((refr<=0)&(v>C['vth'])))
        fset=[int(idx[k]) for k in range(33208) if rnd()<rates[k]*C['dt']]
        ss=set(spk); spk+= [i for i in fset if i not in ss]
        out=(t+dly)%(dly+1)
        for i in spk:
            v[i]=C['vrst']; g[i]=0; refr[i]=rfc; counts[i]+=1
            a,b=indptr[i],indptr[i+1]
            np.add.at(ring[out],post[a:b],w8[a:b]*C['wsyn'])
        for i in fset: refr[i]=0
    return counts

cases=[]; rng=np.random.default_rng(11)
for n in (6,8):
    ids,mu,sd,W,bb,live=readout(n)
    for k in range(2):
        b=O.start_board(n); p=1
        for _ in range(rng.integers(4,16)):
            mv=O.legal_moves(b,p,n)
            if not mv: break
            b=O.apply_move(b,p,int(rng.choice(mv)),n); p=3-p
        if not O.legal_moves(b,p,n): p=3-p
        seed=7000+k
        c=sim(n,b,p,seed)
        z=(c[ids]-mu)/sd
        s=(W@z+bb).astype(np.float32)
        mv=O.legal_moves(b,p,n)
        pick=int(max(mv,key=lambda q:s[q]))
        cases.append(dict(n=n,board=b.tolist(),player=int(p),seed=seed,
                          move=pick,scores=[float(x) for x in s]))
        print(f"{n}x{n} seed={seed}: live={live} move={pick} score range [{s.min():.3f},{s.max():.3f}]",flush=True)
json.dump(cases,open(Path(__file__).parent / 'expected_policy.json','w'))
print("wrote expected_policy.json")
