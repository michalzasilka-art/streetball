// Foxino Olympics questions. Two sources:
//  - the FoxKarts bank (bank.js): picture words, gap sentences and replies, A1 or A2, each with a Czech hint;
//  - the school topic packages the other Fugio games use (packages.js + /shared/pack-picker.js), chosen by a teacher.
// A question: { id, kind, kicker, prompt (HTML), pic, opts: [{ t, right, why }], answer, full, hint }
// `hint` is the Czech help shown after a wrong answer (for a gap: the hint for the option that was picked, see whyFor()).
import { WORDS, GAPS, REPLIES } from './bank.js';

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const GAP = '<span class="gap">&nbsp;</span>';

const WORD_ITEMS = WORDS.map(([w, e, cs, cat, lv]) => ({ id: 'w:' + w, kind: 'word', w, e, cs, cat, lv }));
const GAP_ITEMS = GAPS.map(([s, a, wrong, why, lv, track, e], i) => ({ id: 'g:' + i, kind: 'gap', s, a, wrong, why, lv, e }));
const REPLY_ITEMS = REPLIES.map(([q, a, wrong, cs, lv], i) => ({ id: 'r:' + i, kind: 'reply', q, a, wrong, cs, lv }));

// a gap sentence → HTML with the gap and the (hint) in italics
function gapHTML(s) {
  return esc(s).replace('___', GAP).replace(/\(([^)]*)\)/g, '<i>($1)</i>');
}

function build(it, level) {
  if (it.kind === 'word') {
    const pool = WORD_ITEMS.filter((x) => x.id !== it.id && x.e !== it.e && x.lv <= Math.max(1, level));
    const same = shuffle(pool.filter((x) => x.cat === it.cat)), other = shuffle(pool.filter((x) => x.cat !== it.cat));
    const others = (level >= 2 ? same.concat(other) : other.concat(same)).slice(0, 2);
    const picMode = Math.random() < 0.55;   // see the picture, pick the word (otherwise: read the word, pick the picture)
    const opts = shuffle([it, ...others]).map((o) => ({ t: picMode ? o.w : o.e, right: o === it, emoji: !picMode, why: `${o.w} = ${o.cs}` }));
    return picMode
      ? { id: it.id, kind: 'pic', kicker: 'WHAT IS IT?', prompt: `<span class="qpic">${it.e}</span>`, opts, answer: it.w, full: it.w, hint: `${it.e} = ${it.w} (${it.cs})` }
      : { id: it.id, kind: 'word', kicker: 'TAP THE PICTURE', prompt: `<b class="qword">${esc(it.w)}</b>`, opts, answer: it.e, full: it.w, hint: `${it.w} = ${it.cs}` };
  }
  if (it.kind === 'gap') {
    const opts = shuffle([it.a, ...it.wrong.slice(0, 2)]).map((t) => ({ t, right: t === it.a, why: it.why[t] || '' }));
    return { id: it.id, kind: 'gap', kicker: 'FILL THE GAP', prompt: (it.e ? `<span class="qe">${it.e}</span> ` : '') + gapHTML(it.s), opts, answer: it.a,
      full: it.s.replace('___', it.a).replace(/\s*\([^)]*\)/g, ''), hint: it.pack ? `Správně je „${it.a}“.` : `Správně je „${it.a}“.` };
  }
  const opts = shuffle([it.a, ...it.wrong.slice(0, 2)]).map((t) => ({ t, right: t === it.a, why: '' }));
  return { id: it.id, kind: 'reply', kicker: 'PICK THE ANSWER', prompt: `<b>${esc(it.q)}</b>`, opts, answer: it.a, full: `${it.q} — ${it.a}`, hint: it.cs };
}

// the Czech help for a wrong pick
export function whyFor(q, opt) {
  if (q.kind === 'gap' && opt && opt.why) return opt.why;
  return q.hint;
}

// package questions: "text [right|wrong|wrong] (hint) text"
function packItems(pack) {
  const out = [];
  (pack.rounds || []).flat().forEach((q, i) => {
    const m = /^(.*?)\[([^\]]+)\](.*)$/.exec(q); if (!m) return;
    const [a, ...wrong] = m[2].split('|'); if (!wrong.length) return;
    out.push({ id: `p:${pack.id}:${i}`, kind: 'gap', s: `${m[1]}___${m[3]}`, a, wrong: wrong.slice(0, 2), why: {}, lv: 1, pack: true });
  });
  return out;
}

// a deck deals questions with no repeats until the bag is empty; a missed one comes back 3 questions later
export function makeDeck({ level = 1, pack = null } = {}) {
  let bag = [], missed = [], n = 0;
  const fill = () => {
    if (pack) { bag = shuffle(packItems(pack)); return; }
    const words = WORD_ITEMS.filter((x) => x.lv <= Math.max(1, level));
    const gaps = GAP_ITEMS.filter((x) => (level >= 2 ? true : x.lv <= 1));
    const replies = REPLY_ITEMS.filter((x) => x.lv <= level);
    // the mix: A1 more words and gaps, A2 more gaps and replies
    const W = shuffle(words.slice()).slice(0, level >= 2 ? 14 : 22), G = shuffle(gaps.slice()).slice(0, level >= 2 ? 24 : 22), Rr = shuffle(replies.slice()).slice(0, level >= 2 ? 12 : 4);
    bag = shuffle([...W, ...G, ...Rr]);
  };
  return {
    next() {
      n++;
      const due = missed.find((m) => n - m.at >= 3);
      if (due) { missed = missed.filter((m) => m !== due); return build(due.it, level); }
      if (!bag.length) fill();
      if (!bag.length) fill();
      const it = bag.pop();
      const q = build(it, level); q._it = it; return q;
    },
    miss(q) { if (q && q._it && !missed.some((m) => m.it === q._it)) missed.push({ it: q._it, at: n }); },
  };
}

// a time limit that fits the question: longer sentences get more time
export function timeFor(q, base = 6) {
  const len = (q.full || '').length + q.opts.reduce((s, o) => s + String(o.t).length, 0);
  const t = base + Math.max(0, len - 18) * 0.09 + (q.kind === 'reply' ? 1.5 : 0);
  return Math.min(base + 6, Math.max(base, t));
}

// ---- the topic packages (loaded only when they are used) ----
let packsPromise = null;
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
export function loadPacks() {
  if (!packsPromise) packsPromise = Promise.all([
    window.GUMMY_PACKAGES ? null : loadScript('/olympics/common/packages.js?v=1'),
    window.FugioPacks ? null : loadScript('/shared/pack-picker.js?v=8'),
  ]).then(() => (window.FugioPacks ? FugioPacks.sort(window.GUMMY_PACKAGES || []) : (window.GUMMY_PACKAGES || [])));
  return packsPromise;
}
export async function packFor(ids) {
  if (!ids || !ids.length) return null;
  const packs = await loadPacks();
  return window.FugioPacks ? FugioPacks.merge(packs, ids) : packs.find((p) => p.id === ids[0]) || null;
}
export async function choosePacks(ids) {
  const packs = await loadPacks();
  if (!window.FugioPacks) return null;
  return FugioPacks.open(packs, ids || [], { theme: 'gummy', kicker: 'CHOOSE THE QUESTIONS' });
}
export async function packSummary(ids) {
  if (!ids || !ids.length) return null;
  const packs = await loadPacks();
  return window.FugioPacks ? FugioPacks.summary(packs, ids) : null;
}
