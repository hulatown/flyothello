"""Board -> retinotopic map -> photoreceptor firing rates."""
import numpy as np, pandas as pd
from flylif import DT

EMPTY, BLACK, WHITE = 0, 1, 2
LUM = {EMPTY: 50.0, BLACK: 10.0, WHITE: 190.0}   # Hz: empty = mid grey, dark stone = dim, light stone = bright


def build_retina(ann, brain, board_n=8, frac=0.60):
    """Project each eye's R1-6 onto a 2D sheet, normalise, and lay the board over it.

    frac: fraction of the visual field the board covers; photoreceptors outside
    that window see background.
    Returns cell[i] = board square seen by photoreceptor i, or -1 for background.
    """
    r16 = ann[ann.cell_type.astype(str) == 'R1-6']
    idx_all, cell_all = [], []
    for side in ['left', 'right']:
        h = r16[r16.side == side]
        ids = [brain.idx[f] for f in h.root_id if f in brain.idx]
        keep = [f in brain.idx for f in h.root_id]
        P = h.loc[keep, ['pos_x', 'pos_y', 'pos_z']].to_numpy(float)
        P = P - P.mean(0)
        # first two principal components span the sheet
        _, _, Vt = np.linalg.svd(P, full_matrices=False)
        uv = P @ Vt[:2].T
        # normalise to [0,1]^2 using percentiles to resist outliers
        lo, hi = np.percentile(uv, 1, axis=0), np.percentile(uv, 99, axis=0)
        uv = (uv - lo) / (hi - lo)
        # board occupies the central `frac` of the field
        m = (1 - frac) / 2
        gx = np.floor((uv[:, 0] - m) / frac * board_n)
        gy = np.floor((uv[:, 1] - m) / frac * board_n)
        ok = (gx >= 0) & (gx < board_n) & (gy >= 0) & (gy < board_n)
        cell = np.where(ok, gy * board_n + gx, -1).astype(int)
        idx_all.extend(ids); cell_all.extend(cell.tolist())
    return np.array(idx_all, np.int64), np.array(cell_all, np.int64)


def board_to_rates(board, pr_idx, pr_cell):
    """board: length n*n array (0 empty / 1 dark / 2 light) -> per-photoreceptor rate."""
    rates = np.full(len(pr_idx), LUM[EMPTY], np.float32)
    on = pr_cell >= 0
    rates[on] = np.array([LUM[int(v)] for v in board[pr_cell[on]]], np.float32)
    return rates


def drive(pr_idx, rates, rng):
    """Poisson-sample each source at its own rate; returns neurons forced to spike."""
    return pr_idx[rng.random(len(pr_idx)) < rates * DT]


def random_board(n, rng, fill=0.45):
    b = np.zeros(n * n, np.int64)
    k = int(n * n * fill)
    pos = rng.choice(n * n, k, replace=False)
    b[pos] = rng.integers(1, 3, k)
    return b


def opening(n=8):
    b = np.zeros(n * n, np.int64); c = n // 2
    b[(c - 1) * n + (c - 1)] = WHITE; b[(c - 1) * n + c] = BLACK
    b[c * n + (c - 1)] = BLACK;       b[c * n + c] = WHITE
    return b
