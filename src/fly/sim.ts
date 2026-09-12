/** Whole-brain LIF core. Event-driven CSR propagation, step-for-step
 * identical to the Python reference implementation. */
import { mulberry32 } from './rng';

export interface SimConst {
  dt: number; v0: number; vrst: number; vth: number;
  tmbr: number; tau: number; trfc: number; tdly: number; wsyn: number; steps: number;
  lum: { empty: number; mine: number; theirs: number };
}

export class FlyBrain {
  readonly N: number;
  private indptr: Int32Array;
  private post: Int32Array;
  private w8: Int8Array;
  private C: SimConst;
  private dly: number;
  private rfcSteps: number;
  private decayG: number;
  private kV: number;

  v!: Float32Array;
  g!: Float32Array;
  refr!: Int32Array;
  private ring!: Float32Array;   // (dly+1) x N, flattened
  private t = 0;
  counts!: Int32Array;

  constructor(buf: ArrayBuffer, N: number, edges: number, C: SimConst) {
    this.N = N; this.C = C;
    let o = 0;
    this.indptr = new Int32Array(buf, o, N + 1); o += (N + 1) * 4;
    this.post   = new Int32Array(buf, o, edges);  o += edges * 4;
    this.w8     = new Int8Array(buf, o, edges);
    this.dly      = Math.round(C.tdly / C.dt);
    this.rfcSteps = Math.round(C.trfc / C.dt);
    this.decayG   = Math.exp(-C.dt / C.tau);
    this.kV       = C.dt / C.tmbr;
    this.reset();
  }

  reset() {
    const N = this.N;
    this.v = new Float32Array(N).fill(this.C.v0);
    this.g = new Float32Array(N);
    this.refr = new Int32Array(N);
    this.ring = new Float32Array((this.dly + 1) * N);
    this.counts = new Int32Array(N);
    this.t = 0;
  }

  /** Advance one step. `forced` holds neurons driven to spike this step
 * (sensory input). Returns how many neurons spiked. */
  step(forced: Int32Array | null, forcedLen: number, outSpikes: Int32Array): number {
    const { N, v, g, refr, ring, post, indptr, w8 } = this;
    const slot = (this.t % (this.dly + 1)) * N;
    const kV = this.kV, v0 = this.C.v0, decay = this.decayG;

    for (let i = 0; i < N; i++) { g[i] += ring[slot + i]; ring[slot + i] = 0; }
    for (let i = 0; i < N; i++) {
      if (refr[i] <= 0) v[i] += kV * (v0 - v[i] + g[i]);
      else refr[i] -= 1;
      g[i] *= decay;
    }

    let n = 0;
    const vth = this.C.vth;
    for (let i = 0; i < N; i++) if (refr[i] <= 0 && v[i] > vth) outSpikes[n++] = i;
    if (forced) {                                   // merge in forced spikes, avoiding duplicates
      for (let k = 0; k < forcedLen; k++) {
        const i = forced[k];
        if (!(refr[i] <= 0 && v[i] > vth)) outSpikes[n++] = i;
      }
    }

    const wsyn = this.C.wsyn, vrst = this.C.vrst, rfc = this.rfcSteps;
    const outSlot = ((this.t + this.dly) % (this.dly + 1)) * N;
    for (let k = 0; k < n; k++) {
      const i = outSpikes[k];
      v[i] = vrst; g[i] = 0; refr[i] = rfc;
      this.counts[i]++;
      for (let e = indptr[i], end = indptr[i + 1]; e < end; e++) {
        ring[outSlot + post[e]] += w8[e] * wsyn;
      }
    }
    if (forced) for (let k = 0; k < forcedLen; k++) refr[forced[k]] = 0;
    this.t++;
    return n;
  }
}

/** Poisson drive: sample which neurons are forced to spike this step. */
export function poissonDrive(
  ids: Int32Array, rates: Float32Array, dt: number,
  rand: () => number, out: Int32Array
): number {
  let n = 0;
  for (let k = 0; k < ids.length; k++) if (rand() < rates[k] * dt) out[n++] = ids[k];
  return n;
}

export { mulberry32 };
