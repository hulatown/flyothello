# Research pipeline

The browser app ships prebuilt assets in `public/assets/`. This directory holds
the pipeline that produced them, plus the cross-implementation verification.

## Bulk data (not in this repository)

Set `FLYOTHELLO_DATA` (or pass `--data <dir>`) to a directory containing:

| file | what it is | where to get it |
|---|---|---|
| `Completeness_783.csv` | the 138,639 modelled neurons | [philshiu/Drosophila_brain_model](https://github.com/philshiu/Drosophila_brain_model) |
| `Connectivity_783.parquet` | signed synapse counts | same repository |
| `annot.tsv` | neuron annotations (cell type, class, side, position) | [flyconnectome/flywire_annotations](https://github.com/flyconnectome/flywire_annotations), `Supplemental_file1_neuron_annotations.tsv` |
| `fib.json` | visual cell types used to pick the relay layer | [TuragaLab/flyvis](https://github.com/TuragaLab/flyvis), `flyvis/connectome/fib25-fib19_v2.2.json` |

Generated into the same directory by the pipeline: `_con_5.parquet`,
`positions_*.npz`, `feat_*.npy`, `viz_xy.npy`.

## Pipeline

```
pipeline/flylif.py         whole-brain LIF simulator (event-driven CSR)
pipeline/retina.py         board -> retinotopic map -> firing rates
pipeline/othello.py        rules plus a depth-limited alpha-beta engine
pipeline/gen_positions.py  labelled training positions via noisy self-play
pipeline/features.py       position -> readout features, per wiring condition
pipeline/train.py          fit readouts, evaluate real / shuffled / no-fly
pipeline/stats.py          permutation-tested decoding scores
```

The `shuffled` condition permutes the postsynaptic column of the connectivity
table, preserving each neuron's out-degree and the multiset of weights while
destroying topology. It is the control that decides whether the fly's wiring
matters; see the finding in the top-level README.

## Export and verification

```bash
python3 tools/export_assets.py     # writes public/assets/*
python3 tools/verify_sim.py        # Python reference spike counts
npx tsx tools/verify_sim.mts       # TS must match bit-for-bit
python3 tools/verify_policy.py     # reference scores and moves
npx tsx tools/verify_policy.mts    # TS must choose the same move
npx tsx tools/bench.mts            # per-move timing
```

Both simulators use the same mulberry32 PRNG, so the two implementations are
directly comparable rather than merely statistically similar.
