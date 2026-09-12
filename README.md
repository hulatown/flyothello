# 🪰 FlyOthello

A real fruit-fly connectome plays Othello in your browser. Every move is produced
by 138,639 simulated neurons wired exactly as they are in a real *Drosophila*
brain (though shuffling that wiring at random leaves it playing just as well).

[中文版 / Chinese README](README.zh-CN.md) · [Source](https://github.com/hulatown/flyothello) · MIT + CC-BY data

---

## The honest finding

This started as something to build for fun. As the design got deeper a question
surfaced: **does the fly's actual wiring contribute anything, or is it just an
elaborate random feature expander?**

I ran the controls. The answer is no.

| 6×6 board, 9,000 positions | top-1 agreement with a depth-3 engine |
|---|---|
| random legal move | 0.275 |
| **real connectome** | **0.4578** ± .0230 |
| **shuffled connectome** (degree-matched) | **0.4472** ± .0230 |
| **no fly at all** (linear model on the raw board) | **0.5122** ± .0231 |

- **real vs shuffled: +0.011, McNemar p = 0.347. Not significant.**
  The fly's topology is indistinguishable from a random graph with the same
  degree sequence.
- **no-fly vs real: +0.054, p < 0.00001.** Skipping the fly entirely works
  *better*.

An earlier run on 3,000 positions showed real > shuffled at p = 0.047. Tripling
the sample shrank the effect from +0.045 to +0.011 and the significance
evaporated. A textbook false positive. The analysis plan for the confirmatory
run was written and frozen *before* the data existed; it is in the repository as
[`tools/pipeline/confirm6.py`](tools/pipeline/confirm6.py), hypothesis and
threshold declared in its docstring.

So: the fly does play. It beats random legal play 65–75% of the time. But what
makes it work is "there is a complicated nonlinear system in the middle", not
"it is a fly brain".

I shipped it anyway, because a negative result you can play with is more
interesting than another demo that skips the control.

## How it actually works

```
board state
  └─ perspective-normalised (side to move is always "dark")
  └─ each square → a luminance → a firing rate (10 / 50 / 190 Hz)
      ↓
  33,208 visual relay neurons (T4, T5, Tm, TmY types)
  laid out retinotopically; ~261 neurons see each square
      ↓
  whole-brain leaky integrate-and-fire, 30 ms of biological time
  138,639 neurons · 2,700,513 synapses · wiring never changes
      ↓
  read spike counts from 1,933 visual-projection neurons
      ↓
  one trained matrix (1,933 × 64) → 64 move scores
  → mask to legal moves → argmax, or sample with temperature
```

**The only thing that is ever trained is that final matrix.** The connectome's
2.7 million synapses are fixed. This is reservoir computing with a real animal's
wiring as the reservoir.

### Why the board is injected at the relay layer, rather than letting the fly look at it

The honest design was to render the board onto the fly's hexagonal retina and
drive the photoreceptors. **It does not work**: zero descending or motor neurons
fire, even at 4× drive strength. Photoreceptors and lamina/medulla neurons are
graded-potential cells that do not fire action potentials, and the whole-brain
LIF model treats every neuron as spiking. Signal dies in the medulla:

| layer | active |
|---|---|
| R1-6 photoreceptors | 7932 / 7932 (driven) |
| L1 / L2 | ~31% |
| L3 | 13% |
| Tm1 / Tm2 | 9–13% |
| **Tm9 / T4 / T5** | **0** |

So the board is injected one stage downstream instead. This is a real limitation
and the reason the claim is "the board is injected into the fly's visual relay
layer", not "the fly sees the board".

### Where the board information is

Decoding the board back out of neural activity, by depth:

| read from | R² (per-square) |
|---|---|
| optic lobe | 0.379 |
| visual projection neurons | 0.293 |
| central brain | 0.044 |
| descending neurons | 0.030 |

Monotonic decay with distance from the injection site. That is the signature of
a lossy channel, not of computation. The readout sits at the visual-projection layer
because that is the last place the board is still recoverable.

## Running it

```bash
npm install
npm run dev          # then open the printed URL
npm run build        # static output in dist/
```

Everything runs client-side; there is no server component. First load fetches
about 10 MB, most of it the gzipped connectome, which the browser inflates with
`DecompressionStream` (Safari 16.4+ / Chrome 80+). After that each move takes
~300 ms on a desktop.

A live view of neuron activity sits beside the board, projected onto a frontal
view of the brain. The two optic lobes light up first (that is the injection),
then the signal spreads inward. It is the animated version of the decay table
above.

## Verifying it

The simulation is implemented twice. Once in Python for the research pipeline,
once in TypeScript for the browser — and they are checked against each other.

```bash
export FLYOTHELLO_DATA=/path/to/research/data
python3 tools/verify_sim.py       # writes expected spike counts
npx tsx tools/verify_sim.mts      # compares: 0.00% deviation, bit-identical
python3 tools/verify_policy.py    # writes expected scores and moves
npx tsx tools/verify_policy.mts   # compares: identical moves, ~1e-9 score drift
npx tsx tools/bench.mts           # timing
```

See [tools/README.md](tools/README.md) for the research pipeline and how to
obtain the bulk data files (they are not in this repository).

## Layout

```
src/game/othello.ts     rules, legal moves, flips
src/fly/sim.ts          whole-brain LIF core (event-driven CSR)
src/fly/rng.ts          mulberry32, bit-identical to the Python side
src/fly/policy.ts       board → injection → readout → move scores
src/fly/worker.ts       runs the brain off the UI thread
src/ui/brainview.ts     live activity rendering
tools/pipeline/         research pipeline (Python)
tools/export_assets.py  produces public/assets/*.bin
```

## Data and credits

Connectome data is derived from **FlyWire FAFB v783** and redistributed here
under **CC-BY 4.0**. If you use it, cite the original work:

- Dorkenwald et al., *Whole-brain annotation and multi-connectome cell typing of
  Drosophila* — the FlyWire connectome
- Shiu et al., *Nature* 2024 — the leaky integrate-and-fire whole-brain model and
  its parameters
- Lappalainen et al., *Nature* 2024 — the visual cell-type inventory used to pick
  the relay layer

Training labels come from the small alpha-beta engine in
`tools/pipeline/othello.py`; no external engine is required.

Code is MIT licensed. See [LICENSE](LICENSE).

## What this is not

It is not evidence of consciousness, not a complete recreation of a fly, and not
a fly that understands Othello. It is a wiring diagram plus a seven-parameter
point-neuron model, with a linear layer on top that learned to read it. The model
has no plasticity, no neuromodulation, and no internal state. It cannot learn
anything, and it does not remember the previous move.
