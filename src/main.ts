import './style.css';
import { T, type Lang } from './ui/i18n';
import { drawFly } from './ui/fly';
import { BrainView } from './ui/brainview';
import { TreeView } from './ui/treeview';
import { FlyOpponent } from './opponents/fly';
import { EngineOpponent } from './opponents/engine';
import type { Opponent, AgentState } from './opponents/types';
import { DARK, LIGHT, startBoard, legalMoves, applyMove, flips, score, type Board } from './game/othello';

const $ = <E extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as E;

let lang: Lang = 'en', N = 8, hints = true;
let human = DARK, board: Board = startBoard(8), turn = DARK, busy = false;
let hist: { b: Board; turn: number }[] = [];
let pendingN: number | null = null, started = false;
let idleTimer: number | null = null, idlePool: string[] = [];
let brainView: BrainView | null = null, treeView: TreeView | null = null;
let brainBase: Uint8Array | null = null;
let ready = false;

/* ---------------- opponents ---------------- */
const opponents: Record<string, Opponent> = {};
let oppId = 'fly';                 // remembered across games
let depth = 3;                     // engine search depth
/** Depth 1/2/3 is implemented and verified but hidden for now: depth 3 is the
 *  engine the fly was trained against, and one fewer choice keeps the new-game
 *  dialog to a single tap. Flip to true to expose the picker. */
const SHOW_DEPTH = false;
let pendingOpp = oppId, pendingDepth = depth;
const opp = () => opponents[oppId];
const L = () => opp().lines(lang);

/* ---------------- asset loading ---------------- */
async function boot() {
  const files: [string, string][] = [
    ['meta', '/assets/meta.json'], ['connectome', '/assets/connectome.bin.gz'],
    ['positions', '/assets/positions.bin'],
    ['inject6', '/assets/inject-6.bin'], ['inject8', '/assets/inject-8.bin'],
    ['readout6', '/assets/readout-6.bin'], ['readout8', '/assets/readout-8.bin'],
  ];
  const weights = [0.01, 0.86, 0.04, 0.02, 0.02, 0.02, 0.03];
  const out: Record<string, ArrayBuffer | Record<string, unknown>> = {};
  let done = 0;
  for (let i = 0; i < files.length; i++) {
    const [k, url] = files[i];
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
    if (k === 'meta') { out[k] = await r.json(); }
    else {
      // The connectome ships gzipped so it travels compressed on any host. Whether
      // it arrives still compressed depends on the server: Vercel sends it raw
      // (Content-Type: application/gzip), while the Vite dev server sets
      // Content-Encoding: gzip and the browser inflates it for us. Sniffing the
      // gzip magic number is the only check that is right in both cases.
      const buf = await r.arrayBuffer();
      const h = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
      if (h[0] === 0x1f && h[1] === 0x8b) {
        if (typeof DecompressionStream === 'undefined')
          throw new Error('This browser lacks DecompressionStream (Safari 16.4+ / Chrome 80+).');
        out[k] = await new Response(
          new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))
        ).arrayBuffer();
      } else out[k] = buf;
    }
    done += weights[i];
    $('#loadBar').style.width = `${Math.round(done * 100)}%`;
  }

  const worker = new Worker(new URL('./fly/worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent) => {
    if (e.data.type !== 'ready') return;
    if (e.data.base) brainBase = new Uint8Array(e.data.base);
    brainView = new BrainView($('#brain') as HTMLCanvasElement, brainBase);
    treeView = new TreeView($('#tree') as HTMLCanvasElement);
    opponents.fly = new FlyOpponent(worker, () => brainView);
    opponents.engine = new EngineOpponent(() => treeView);
    ready = true;
    $('#loading').classList.add('gone');
    setTimeout(() => $('#loading').remove(), 500);
    labels();
    askNew();
  };
  worker.postMessage({
    type: 'init', meta: out.meta, connectome: out.connectome, positions: out.positions,
    inject: { 6: out.inject6, 8: out.inject8 },
    readout: { 6: out.readout6, 8: out.readout8 },
  }, [out.connectome as ArrayBuffer, out.positions as ArrayBuffer,
      out.inject6 as ArrayBuffer, out.inject8 as ArrayBuffer,
      out.readout6 as ArrayBuffer, out.readout8 as ArrayBuffer]);
}

/* ---------------- game flow ---------------- */
function askNew(targetN?: number) {
  pendingN = targetN ?? N;
  pendingOpp = oppId; pendingDepth = depth;
  syncDialog();
  ($('#chCancel') as HTMLElement).style.display = started ? '' : 'none';
  $('#veil').classList.add('show'); clearIdle();
}
function cancelChoose() {
  if (!started) return;
  $('#veil').classList.remove('show'); pendingN = null;
  if (turn === human && !busy) { sayTurn(); armIdle(); }
}
function start(who: number) {
  if (pendingN !== null && pendingN !== N) N = pendingN;
  oppId = pendingOpp; depth = pendingDepth;
  pendingN = null; started = true; human = who;
  labels();
  $('#veil').classList.remove('show');
  board = startBoard(N); turn = DARK; hist = []; busy = false;
  opp().reset();
  setAgent('idle'); render();
  if (turn === human) { sayTurn(); armIdle(); } else step();
}

function render() {
  const g = $('#grid');
  g.style.gridTemplate = `repeat(${N},1fr)/repeat(${N},1fr)`;
  if (g.childElementCount !== N * N) {
    g.innerHTML = '';
    for (let s = 0; s < N * N; s++) {
      const b = document.createElement('button');
      b.className = 'sq';
      b.setAttribute('aria-label', `row ${((s / N) | 0) + 1} column ${s % N + 1}`);
      b.onclick = () => play(s);
      g.appendChild(b);
    }
  }
  const lg = (turn === human && !busy) ? legalMoves(board, human, N) : [];
  [...g.children].forEach((el, s) => {
    const sq = el as HTMLButtonElement;
    sq.classList.toggle('legal', lg.includes(s));
    sq.disabled = !lg.includes(s);
    const want = board[s];
    let d = sq.querySelector('.disc') as HTMLElement | null;
    if (!want) { d?.remove(); return; }
    if (!d) {
      d = document.createElement('div'); d.className = 'disc placing';
      d.innerHTML = '<div class="face dark"></div><div class="face light"></div>';
      sq.appendChild(d);
    }
    d.classList.toggle('is-light', want === LIGHT);
  });
  const [d, l] = score(board);
  $('#sD').lastElementChild!.textContent = String(d);
  $('#sL').lastElementChild!.textContent = String(l);
  $('#sD').classList.toggle('turn', turn === DARK);
  $('#sL').classList.toggle('turn', turn === LIGHT);
  ($('#bUndo') as HTMLButtonElement).disabled = busy || !hist.some(h => h.turn === human);
}

const say = (t: string) => { $('#say').textContent = t; };
const sayTurn = () => say(hints ? T[lang].yourTurn : T[lang].yourTurnNoHint);
function banner(t: string) {
  const b = $('#banner'); b.textContent = t; b.classList.add('show');
  setTimeout(() => b.classList.remove('show'), 1900);
}
function setAgent(s: AgentState) { if (ready) opp().draw($('#flyStage'), s); }

function armIdle() {
  clearIdle();
  idleTimer = window.setTimeout(function tick() {
    if (busy || turn !== human || !ready) return;
    if (!idlePool.length) idlePool = [...L().idle].sort(() => Math.random() - 0.5);
    say(idlePool.pop()!); setAgent(Math.random() < 0.4 ? 'nap' : 'idle');
    idleTimer = window.setTimeout(tick, 9000);
  }, 12000);
}
function clearIdle() { if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; } }

function play(s: number) {
  if (busy || turn !== human || !ready) return;
  if (!flips(board, human, s, N).length) return;
  clearIdle(); setAgent('idle');
  hist.push({ b: board.slice(), turn });
  board = applyMove(board, human, s, N);
  turn = 3 - human; render(); step();
}

function step() {
  const me = legalMoves(board, turn, N), other = legalMoves(board, 3 - turn, N);
  if (!me.length && !other.length) return finish();
  if (!me.length) {
    banner(turn === human ? T[lang].noMove : T[lang].oppPass);
    if (turn !== human) setAgent('shrug');
    turn = 3 - turn; render();
    if (turn !== human) return step();
    sayTurn(); armIdle(); return;
  }
  if (turn !== human) void oppThink();
  else { sayTurn(); setAgent('idle'); render(); armIdle(); }
}

async function oppThink() {
  busy = true; setAgent('think'); render();
  const r = await opp().think({
    board, player: 3 - human, n: N, temp: 0, depth, lang,
    say: (t) => say(t),
  });
  $('#sciMs').textContent = r.caption ?? '—';
  busy = false;
  if (r.move < 0) { turn = human; render(); step(); return; }
  hist.push({ b: board.slice(), turn });
  board = applyMove(board, 3 - human, r.move, N);
  turn = human;
  setAgent('happy');
  if (r.degenerate) say(L().shrug);
  render(); step();
}

function finish() {
  clearIdle();
  const [d, l] = score(board);
  const mine = human === DARK ? d : l, his = human === DARK ? l : d;
  const t = mine > his ? T[lang].win : mine < his ? T[lang].lose : T[lang].draw;
  banner(t); say(t); setAgent(mine > his ? 'sad' : 'happy'); render();
}

/* ---------------- panel ---------------- */
function applyPanel() {
  const isFly = opp().panel === 'brain';
  ($('#brain') as HTMLCanvasElement).hidden = !isFly;
  ($('#tree') as HTMLCanvasElement).hidden = isFly;
  $('#sciTitle').textContent = isFly ? T[lang].panelFly : T[lang].panelEngine;
  $('#sciLegend').textContent = isFly ? T[lang].legendFly : T[lang].legendEngine;
  $('#note').textContent = L().note;
}

/* ---------------- controls ---------------- */
function syncDialog() {
  $('#chSub').textContent = `${pendingN ?? N}×${pendingN ?? N} · ${T[lang].chSub}`;
  document.querySelectorAll<HTMLButtonElement>('#segOpp button').forEach(b =>
    b.classList.toggle('on', b.dataset.opp === pendingOpp));
  document.querySelectorAll<HTMLButtonElement>('#segDepth button').forEach(b =>
    b.classList.toggle('on', Number(b.dataset.d) === pendingDepth));
  ($('#depthRow') as HTMLElement).hidden = !SHOW_DEPTH || pendingOpp !== 'engine';
}
function labels() {
  const t = T[lang];
  $('#bSize').textContent = N === 8 ? t.size6 : t.size8;
  $('#bUndo').textContent = t.undo; $('#bNew').textContent = t.nw; $('#bLang').textContent = t.lang;
  $('#chTitle').textContent = t.chTitle; $('#chCancel').textContent = t.cancel;
  $('#chDepth').textContent = t.chDepth;
  $('#segFly').textContent = t.oppFly; $('#segRobot').textContent = t.oppRobot;
  $('#pdT').textContent = t.pdT; $('#pdS').textContent = t.pdS;
  $('#plT').textContent = t.plT; $('#plS').textContent = t.plS;
  $('#brandSub').textContent = t.brandSub;
  // The loading screen is removed once assets are in, so these are transient.
  const lt = $('#loadTxt'), ls = $('#loadSub');
  if (lt) lt.textContent = t.loading;
  if (ls) ls.textContent = t.loadSub;
  if (ready) applyPanel();
  syncDialog();
}

$('#bSize').onclick = () => askNew(N === 8 ? 6 : 8);
$('#bNew').onclick = () => askNew();
$('#pickD').onclick = () => start(DARK);
$('#pickL').onclick = () => start(LIGHT);
$('#chCancel').onclick = cancelChoose;
$('#veil').onclick = e => { if (e.target === $('#veil')) cancelChoose(); };
addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Escape') cancelChoose(); });
document.querySelectorAll<HTMLButtonElement>('#segOpp button').forEach(b =>
  b.onclick = () => { pendingOpp = b.dataset.opp!; syncDialog(); });
document.querySelectorAll<HTMLButtonElement>('#segDepth button').forEach(b =>
  b.onclick = () => { pendingDepth = Number(b.dataset.d); syncDialog(); });
$('#bHint').onclick = () => {
  hints = !hints; document.body.classList.toggle('nohint', !hints);
  $('#bHint').classList.toggle('on', hints);
  if (turn === human && !busy) sayTurn();
};
$('#bUndo').onclick = () => {
  if (busy) return;
  clearIdle();
  while (hist.length) { const h = hist.pop()!; if (h.turn === human) { board = h.b; turn = human; break; } }
  setAgent('idle'); render(); sayTurn(); armIdle();
};
$('#bLang').onclick = () => { lang = lang === 'en' ? 'zh' : 'en'; idlePool = []; labels(); if (turn === human && !busy) sayTurn(); };

/** A stalled loading screen with no message is the worst failure mode; surface it. */
function showFatal(err: unknown) {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  console.error(err);
  const txt = $('#loadTxt'), sub = $('#loadSub'), bar = $('#loadBar');
  if (txt && sub) {                       // still on the loading screen
    txt.textContent = '😵 ' + T[lang].loadFail;
    sub.textContent = msg.slice(0, 160);
    if (bar) bar.style.background = '#c4483a';
  } else banner('⚠ ' + msg.slice(0, 90));  // already playing: do not fail silently
}
addEventListener('unhandledrejection', e => showFatal(e.reason));
addEventListener('error', e => showFatal((e as ErrorEvent).error ?? (e as ErrorEvent).message));

drawFly($('#loadFly'), 'nap');
labels(); render();
boot().catch(showFatal);
