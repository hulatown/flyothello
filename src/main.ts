import './style.css';
import { T, type Lang } from './ui/i18n';
import { drawFly, type FlyState } from './ui/fly';
import { BrainView } from './ui/brainview';
import { DARK, LIGHT, startBoard, legalMoves, applyMove, flips, score, type Board } from './game/othello';

const $ = <E extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as E;

let lang: Lang = 'en', N = 8, hints = true;
let human = DARK, board: Board = startBoard(8), turn = DARK, busy = false;
let hist: { b: Board; turn: number }[] = [];
let pendingN: number | null = null, started = false;
let idleTimer: number | null = null, idlePool: string[] = [];
let brainView: BrainView | null = null;
let brainBase: Uint8Array | null = null;
let worker: Worker, ready = false;
let seedCounter = 1;

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
    if (k === 'meta') out[k] = await r.json();
    else if (url.endsWith('.gz')) {
      // Inflated here rather than by the CDN: application/octet-stream is not on
      // Vercel's compression allowlist, so it would otherwise travel uncompressed.
      if (typeof DecompressionStream === 'undefined')
        throw new Error('This browser lacks DecompressionStream (Safari 16.4+ / Chrome 80+).');
      const ds = new DecompressionStream('gzip');
      out[k] = await new Response(r.body!.pipeThrough(ds)).arrayBuffer();
    } else out[k] = await r.arrayBuffer();
    done += weights[i];
    $('#loadBar').style.width = `${Math.round(done * 100)}%`;
  }
  worker = new Worker(new URL('./fly/worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = onWorker;
  worker.postMessage({
    type: 'init', meta: out.meta, connectome: out.connectome, positions: out.positions,
    inject: { 6: out.inject6, 8: out.inject8 },
    readout: { 6: out.readout6, 8: out.readout8 },
  }, [out.connectome as ArrayBuffer, out.positions as ArrayBuffer,
      out.inject6 as ArrayBuffer, out.inject8 as ArrayBuffer,
      out.readout6 as ArrayBuffer, out.readout8 as ArrayBuffer]);
}

function onWorker(e: MessageEvent) {
  const m = e.data;
  if (m.type === 'ready') {
    ready = true;
    if (m.base) brainBase = new Uint8Array(m.base);
    brainView = new BrainView($('#brain') as HTMLCanvasElement, brainBase);
    $('#loading').classList.add('gone');
    setTimeout(() => $('#loading').remove(), 500);
    askColor();
  } else if (m.type === 'tick') {
    brainView?.push(m.grid);
  } else if (m.type === 'done') {
    $('#sciMs').textContent = `${Math.round(m.ms)} ms`;
    applyFlyMove(m.move, m.degenerate);
  }
}

/* ---------------- game flow ---------------- */
function askColor(targetN?: number) {
  pendingN = targetN ?? N;
  $('#chSub').textContent = `${pendingN}×${pendingN} · ${T[lang].chSub}`;
  ($('#chCancel') as HTMLElement).style.display = started ? '' : 'none';
  $('#veil').classList.add('show'); clearIdle();
}
function cancelChoose() {
  if (!started) return;
  $('#veil').classList.remove('show'); pendingN = null;
  if (turn === human && !busy) { sayTurn(); armIdle(); }
}
function start(who: number) {
  if (pendingN !== null && pendingN !== N) { N = pendingN; labels(); }
  pendingN = null; started = true; human = who;
  $('#veil').classList.remove('show');
  board = startBoard(N); turn = DARK; hist = []; busy = false;
  brainView?.clear();
  setFly('idle'); render();
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
function setFly(s: FlyState) { drawFly($('#flyStage'), s); }

function armIdle() {
  clearIdle();
  idleTimer = window.setTimeout(function tick() {
    if (busy || turn !== human) return;
    if (!idlePool.length) idlePool = [...T[lang].idle].sort(() => Math.random() - 0.5);
    say(idlePool.pop()!); setFly(Math.random() < 0.4 ? 'nap' : 'idle');
    idleTimer = window.setTimeout(tick, 9000);
  }, 12000);
}
function clearIdle() { if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; } }

function play(s: number) {
  if (busy || turn !== human || !ready) return;
  if (!flips(board, human, s, N).length) return;
  clearIdle(); setFly('idle');
  hist.push({ b: board.slice(), turn });
  board = applyMove(board, human, s, N);
  turn = 3 - human; render(); step();
}

function step() {
  const me = legalMoves(board, turn, N), other = legalMoves(board, 3 - turn, N);
  if (!me.length && !other.length) return finish();
  if (!me.length) {
    banner(turn === human ? T[lang].noMove : T[lang].flyPass);
    if (turn !== human) setFly('shrug');
    turn = 3 - turn; render();
    if (turn !== human) return step();
    sayTurn(); armIdle(); return;
  }
  if (turn !== human) flyThink();
  else { sayTurn(); setFly('idle'); render(); armIdle(); }
}

function flyThink() {
  busy = true; setFly('think');
  const th = T[lang].think; say(th[(Math.random() * th.length) | 0]);
  render();
  worker.postMessage({
    type: 'think', board: board.slice().buffer, n: N, player: 3 - human,
    seed: (seedCounter++ * 2654435761) >>> 0, temp: 0, viz: true,
  });
}

function applyFlyMove(move: number, degenerate: boolean) {
  busy = false;
  if (move < 0) { turn = human; render(); step(); return; }
  hist.push({ b: board.slice(), turn });
  board = applyMove(board, 3 - human, move, N);
  turn = human;
  setFly('happy');
  if (degenerate) say(T[lang].shrugMsg);
  render(); step();
}

function finish() {
  clearIdle();
  const [d, l] = score(board);
  const mine = human === DARK ? d : l, his = human === DARK ? l : d;
  const t = mine > his ? T[lang].win : mine < his ? T[lang].lose : T[lang].draw;
  banner(t); say(t); setFly(mine > his ? 'sad' : 'happy'); render();
}

/* ---------------- controls ---------------- */
function labels() {
  const t = T[lang];
  $('#bSize').textContent = N === 8 ? t.size6 : t.size8;
  $('#bUndo').textContent = t.undo; $('#bNew').textContent = t.nw;
  $('#bLang').textContent = t.lang; $('#note').textContent = t.note;
  $('#chTitle').textContent = t.chTitle; $('#chCancel').textContent = t.cancel;
  $('#chSub').textContent = `${pendingN ?? N}×${pendingN ?? N} · ${t.chSub}`;
  $('#pdT').textContent = t.pdT; $('#pdS').textContent = t.pdS;
  $('#plT').textContent = t.plT; $('#plS').textContent = t.plS;
  $('#sciTitle').textContent = t.sciTitle;
  $('#brandSub').textContent = t.brandSub;
  $('#loadTxt').textContent = t.loading; $('#loadSub').textContent = t.loadSub;
}

$('#bSize').onclick = () => askColor(N === 8 ? 6 : 8);
$('#bNew').onclick = () => askColor();
$('#pickD').onclick = () => start(DARK);
$('#pickL').onclick = () => start(LIGHT);
$('#chCancel').onclick = cancelChoose;
$('#veil').onclick = e => { if (e.target === $('#veil')) cancelChoose(); };
addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Escape') cancelChoose(); });
$('#bHint').onclick = () => {
  hints = !hints; document.body.classList.toggle('nohint', !hints);
  $('#bHint').classList.toggle('on', hints);
  if (turn === human && !busy) sayTurn();
};
$('#bUndo').onclick = () => {
  if (busy) return;
  clearIdle();
  while (hist.length) { const h = hist.pop()!; if (h.turn === human) { board = h.b; turn = human; break; } }
  setFly('idle'); render(); sayTurn(); armIdle();
};
$('#bLang').onclick = () => { lang = lang === 'en' ? 'zh' : 'en'; idlePool = []; labels(); if (turn === human && !busy) sayTurn(); };

drawFly($('#loadFly'), 'nap');
setFly('idle'); labels(); render();
boot();
