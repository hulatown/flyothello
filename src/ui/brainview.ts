/** Live neuron-activity view: phosphor-style decay over a heat ramp. */
import { GRID_W, GRID_H } from '../fly/worker';

const RAMP = (() => {                       // deep teal -> cyan -> amber -> white, 256 levels
  const r = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let R: number, G: number, B: number;
    if (t < 0.45) { const u = t / 0.45; R = 18 + u * 20; G = 60 + u * 130; B = 80 + u * 110; }
    else if (t < 0.8) { const u = (t - 0.45) / 0.35; R = 38 + u * 200; G = 190 - u * 20; B = 190 - u * 130; }
    else { const u = (t - 0.8) / 0.2; R = 238 + u * 17; G = 170 + u * 85; B = 60 + u * 195; }
    r[i * 3] = R; r[i * 3 + 1] = G; r[i * 3 + 2] = B;
  }
  return r;
})();

export class BrainView {
  private ctx: CanvasRenderingContext2D;
  private img: ImageData;
  private heat: Float32Array;
  private raf = 0;
  readonly aspect = GRID_W / GRID_H;

  constructor(canvas: HTMLCanvasElement, private base: Uint8Array | null = null, private decay = 0.91) {
    canvas.width = GRID_W; canvas.height = GRID_H;
    const c = canvas.getContext('2d', { alpha: false });
    if (!c) throw new Error('2D canvas unavailable');
    this.ctx = c;
    this.ctx.imageSmoothingEnabled = true;
    this.img = this.ctx.createImageData(GRID_W, GRID_H);
    this.heat = new Float32Array(GRID_W * GRID_H);
    for (let i = 3; i < this.img.data.length; i += 4) this.img.data[i] = 255;
    this.paint();
  }

  /** Accept one activity frame: accumulate and schedule a repaint. */
  push(grid: ArrayBuffer) {
    const g = new Uint8Array(grid);
    for (let i = 0; i < this.heat.length; i++) this.heat[i] = this.heat[i] * this.decay + g[i];
    if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.paint(); });
  }

  /** Keep decaying with no input so the afterglow fades out naturally. */
  fade() {
    let any = false;
    for (let i = 0; i < this.heat.length; i++) {
      if (this.heat[i] > 0.01) { this.heat[i] *= this.decay; any = true; } else this.heat[i] = 0;
    }
    this.paint();
    return any;
  }

  clear() { this.heat.fill(0); this.paint(); }

  private paint() {
    const d = this.img.data, h = this.heat;
    for (let i = 0; i < h.length; i++) {
      const act = h[i] <= 0 ? 0 : Math.min(255, (Math.log1p(h[i]) * 118) | 0);
      const bg = this.base ? (this.base[i] * 0.20) | 0 : 0;   // faint static outline
      const v = act > bg ? act : bg;
      const o = v * 3, p = i * 4;
      d[p] = RAMP[o]; d[p + 1] = RAMP[o + 1]; d[p + 2] = RAMP[o + 2];
    }
    this.ctx.putImageData(this.img, 0, 0);
  }
}
