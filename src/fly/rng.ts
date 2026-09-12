/** mulberry32 — deterministic 32-bit PRNG. tools/verify_sim.py holds a
 * bit-identical Python implementation. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function (): number {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
