"""Reference engine moves for tools/verify_engine.mts to compare against."""
import os, sys, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent / 'pipeline'))
from paths import data_dir
os.chdir(data_dir())
import numpy as np
import othello as O

cases = []
rng = np.random.default_rng(42)
for n in (6, 8):
    for k in range(25):
        b = O.start_board(n); p = 1
        for _ in range(rng.integers(2, n * n // 2)):
            mv = O.legal_moves(b, p, n)
            if not mv: break
            b = O.apply_move(b, p, int(rng.choice(mv)), n); p = 3 - p
        if not O.legal_moves(b, p, n):
            p = 3 - p
            if not O.legal_moves(b, p, n): continue
        row = dict(n=n, board=b.tolist(), player=int(p), moves={})
        for d in (1, 2, 3):
            row['moves'][str(d)] = int(O.best_move(b, p, n, d))
        cases.append(row)
out = Path(__file__).parent / 'expected_engine.json'
json.dump(cases, open(out, 'w'))
print(f"wrote {len(cases)} positions x depths 1/2/3 -> {out.name}")
