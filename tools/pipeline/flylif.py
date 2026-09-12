"""
Minimal whole-brain Drosophila LIF simulator (FlyWire FAFB v783).
Event-driven CSR propagation -- fast enough to run a closed loop.
Parameters follow Shiu et al. 2024 (Nature), model.py of philshiu/Drosophila_brain_model.
"""
import numpy as np, pandas as pd, time

DT      = 0.1e-3    # s   integration step
V_0     = -52e-3    # V   rest
V_RST   = -52e-3    # V   reset
V_TH    = -45e-3    # V   threshold
T_MBR   = 20e-3     # s   membrane time constant
TAU     = 5e-3      # s   synaptic (alpha) decay
T_RFC   = 2.2e-3    # s   refractory
T_DLY   = 1.8e-3    # s   axonal delay
W_SYN   = 0.275e-3  # V   volt per synapse  (the one free parameter)


class FlyBrain:
    def __init__(self, comp_csv, conn_parquet):
        comp = pd.read_csv(comp_csv, index_col=0)
        self.flyids = comp.index.to_numpy()
        self.idx = {f: i for i, f in enumerate(self.flyids)}
        self.N = len(self.flyids)

        con = pd.read_parquet(conn_parquet)
        pre  = con['Presynaptic_Index'].to_numpy(np.int32)
        post = con['Postsynaptic_Index'].to_numpy(np.int32)
        w    = con['Excitatory x Connectivity'].to_numpy(np.float32) * W_SYN

        # CSR by presynaptic neuron -> O(spikes x fan-out) per step
        order = np.argsort(pre, kind='stable')
        self.post = post[order]
        self.w    = w[order]
        self.indptr = np.zeros(self.N + 1, np.int64)
        np.cumsum(np.bincount(pre, minlength=self.N), out=self.indptr[1:])
        self.E = len(w)

        self.dly = int(round(T_DLY / DT))
        self.rfc = int(round(T_RFC / DT))
        self.decay_g = np.exp(-DT / TAU)
        self.reset()

    def reset(self):
        self.v = np.full(self.N, V_0, np.float32)
        self.g = np.zeros(self.N, np.float32)
        self.refr = np.zeros(self.N, np.int32)
        self.ring = np.zeros((self.dly + 1, self.N), np.float32)  # delay line for g
        self.t = 0

    def step(self, forced=None):
        """One DT. `forced` = indices driven to spike this step (sensory drive)."""
        slot = self.t % (self.dly + 1)
        self.g += self.ring[slot]; self.ring[slot] = 0.0

        free = self.refr <= 0
        self.v[free] += (DT / T_MBR) * (V_0 - self.v[free] + self.g[free])
        self.g *= self.decay_g
        self.refr[~free] -= 1

        spk = np.flatnonzero((self.v > V_TH) & free)
        if forced is not None and len(forced):
            spk = np.union1d(spk, forced)
        if len(spk):
            self.v[spk] = V_RST; self.g[spk] = 0.0; self.refr[spk] = self.rfc
            if forced is not None and len(forced):
                self.refr[forced] = 0          # sensory drive ignores refractoriness
            s, e = self.indptr[spk], self.indptr[spk + 1]
            n = e - s
            if n.sum():
                # concatenated aranges -> flat edge index of every outgoing synapse
                ends = np.cumsum(n); starts = ends - n
                flat = np.arange(ends[-1]) - np.repeat(starts - s, n)
                np.add.at(self.ring[(self.t + self.dly) % (self.dly + 1)],
                          self.post[flat], self.w[flat])
        self.t += 1
        return spk


def poisson_drive(ids, rate_hz, rng):
    return np.asarray(ids)[rng.random(len(ids)) < rate_hz * DT]


if __name__ == '__main__':
    rng = np.random.default_rng(0)
    b = FlyBrain('Completeness_783.csv', 'Connectivity_783.parquet')
    print(f'{b.N:,} neurons  {b.E:,} synapses')

    sugar = [720575940624963786,720575940630233916,720575940637568838,720575940638202345,
             720575940617000768,720575940630797113,720575940632889389,720575940621754367,
             720575940621502051,720575940640649691,720575940639332736,720575940616885538,
             720575940639198653,720575940620900446,720575940617937543,720575940632425919,
             720575940633143833,720575940612670570,720575940628853239,720575940629176663,
             720575940611875570]
    drive = np.array([b.idx[f] for f in sugar if f in b.idx], np.int64)
    print(f'{len(drive)}/21 sugar GRNs found in v783')

    counts = np.zeros(b.N, np.int64)
    T = 1.0
    t0 = time.perf_counter()
    for _ in range(int(T / DT)):
        spk = b.step(forced=poisson_drive(drive, 200.0, rng))
        counts[spk] += 1
    wall = time.perf_counter() - t0
    print(f'{T}s biological in {wall:.1f}s wall  ({T/wall:.2f}x realtime, 1 CPU core)')

    active = counts > 0
    print(f'active neurons: {active.sum()}   total spikes: {counts.sum():,}')
    top = np.argsort(counts)[::-1][:15]
    print('\ntop responders (flywire id, Hz):')
    for i in top:
        tag = ' <- driven' if i in drive else ''
        print(f'  {b.flyids[i]}  {counts[i]/T:6.1f}{tag}')
