/** Headless integration test: boot the real app inside jsdom and drive the UI.
 *  Catches wiring and CSS-visibility bugs that type-checking cannot see. */
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const A = join(root, 'public', 'assets');
const out = mkdtempSync(join(tmpdir(), 'flyui-'));

await build({
  entryPoints: [join(root, 'src/main.ts')],
  bundle: true, format: 'iife', outfile: join(out, 'app.js'),
  loader: { '.css': 'empty' }, logLevel: 'silent', target: 'es2022',
  define: { 'import.meta.url': '"http://localhost/src/main.ts"' },
});
const appCode = readFileSync(join(out, 'app.js'), 'utf8');
const css = readFileSync(join(root, 'src/style.css'), 'utf8');
let html = readFileSync(join(root, 'index.html'), 'utf8')
  .replace('<link rel="stylesheet" href="/src/style.css">', `<style>${css}</style>`)
  .replace('<script type="module" src="/src/main.ts"></script>', '');

const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true });
const w = dom.window as unknown as Window & typeof globalThis & Record<string, unknown>;

const files: Record<string, string> = {
  '/assets/meta.json': 'meta.json', '/assets/connectome.bin.gz': 'connectome.bin.gz',
  '/assets/positions.bin': 'positions.bin',
  '/assets/inject-6.bin': 'inject-6.bin', '/assets/inject-8.bin': 'inject-8.bin',
  '/assets/readout-6.bin': 'readout-6.bin', '/assets/readout-8.bin': 'readout-8.bin',
};
w.fetch = (async (u: string) => {
  const f = files[String(u)];
  if (!f) throw new Error('unexpected fetch ' + u);
  const b = readFileSync(join(A, f));
  return { ok: true, status: 200,
    json: async () => JSON.parse(b.toString()),
    arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
}) as unknown as typeof fetch;
class FakeWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  postMessage(m: { type: string }) {
    if (m.type === 'init')
      setTimeout(() => {
        try { this.onmessage?.({ data: { type: 'ready', base: new Uint8Array(320 * 154).buffer } }); }
        catch (err) { console.log('  !! ready 处理器抛错: ' + ((err as Error).stack ?? err)); }
      }, 0);
  }
}
w.Worker = FakeWorker as unknown as typeof Worker;
// jsdom has no canvas; a minimal 2D stub is enough for the views to construct.
(w.HTMLCanvasElement.prototype as unknown as Record<string, unknown>).getContext = function () {
  return {
    canvas: this, fillStyle: '', strokeStyle: '', lineWidth: 1, imageSmoothingEnabled: true,
    fillRect() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, arc() {},
    fill() {}, stroke() {}, bezierCurveTo() {}, putImageData() {},
    createImageData: (a: number, b: number) => ({ data: new Uint8ClampedArray(a * b * 4), width: a, height: b }),
  };
};
w.requestAnimationFrame = ((cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16) as unknown as number) as typeof requestAnimationFrame;
w.cancelAnimationFrame = ((id: number) => clearTimeout(id)) as typeof cancelAnimationFrame;
w.DecompressionStream = globalThis.DecompressionStream as never;
w.Blob = globalThis.Blob as never;
w.Response = globalThis.Response as never;
const errs: string[] = [];
w.addEventListener('error', (e) => errs.push('error: ' + ((e as ErrorEvent).error?.stack ?? (e as ErrorEvent).message)));
w.addEventListener('unhandledrejection', (e) => errs.push('rejection: ' + (((e as PromiseRejectionEvent).reason as Error)?.stack ?? String((e as PromiseRejectionEvent).reason))));

w.eval(appCode);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
await sleep(900);   // past the 500 ms removal of the loading screen

const $ = (s: string) => w.document.querySelector(s) as HTMLElement;
const vis = (el: HTMLElement | null) => !!el && w.getComputedStyle(el).display !== 'none';
let bad = 0;
const ok = (c: boolean, label: string, extra = '') => {
  console.log(`  ${c ? '✓' : '✗'} ${label}${extra ? '  ' + extra : ''}`); if (!c) bad++;
};

if ($('#loading') && !$('#loading').classList.contains('gone'))
  console.log(`  !! boot 失败: ${$('#loadTxt')?.textContent} / ${$('#loadSub')?.textContent}`);
ok(!$('#loading'), '加载页已移除（真人点击的时序）');
ok($('#veil').classList.contains('show'), '新局对话框已弹出');
ok(!vis($('#depthRow')), '选果蝇时深度栏应隐藏', vis($('#depthRow')) ? '← 仍然可见' : '');
ok(!vis($('#tree')), '选果蝇时决策树画布应隐藏', vis($('#tree')) ? '← 仍然可见' : '');
ok(vis($('#brain')), '神经元画布应可见');

($('#pickD') as HTMLButtonElement).click();
await sleep(120);
ok(!$('#veil').classList.contains('show'), '点「我执黑」后对话框关闭');
ok(w.document.querySelectorAll('.sq').length === 64, '棋盘已渲染 64 格',
   `实际 ${w.document.querySelectorAll('.sq').length}`);
ok(w.document.querySelectorAll('.sq.legal').length === 4, '开局 4 个合法落点',
   `实际 ${w.document.querySelectorAll('.sq.legal').length}`);

($('#bNew') as HTMLButtonElement).click(); await sleep(30);
(w.document.querySelector('#segOpp button[data-opp="engine"]') as HTMLButtonElement).click(); await sleep(30);
ok(!vis($('#depthRow')), '深度栏当前对两种对手都隐藏');
($('#pickD') as HTMLButtonElement).click(); await sleep(50);
ok(!vis($('#brain')), '机器人模式下神经元画布隐藏');
ok(vis($('#tree')), '机器人模式下决策树画布可见');

if (errs.length) { console.log('\n运行时错误:'); errs.slice(0, 3).forEach(e => console.log('  ' + e.split('\n').slice(0, 3).join('\n  '))); bad += errs.length; }
console.log(bad === 0 ? '\n✓ UI 集成测试通过' : `\n✗ ${bad} 个问题`);
process.exit(bad === 0 ? 0 : 1);
