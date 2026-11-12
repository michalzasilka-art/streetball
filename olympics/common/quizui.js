// The question card and the three answer bubbles (the Penalty Star idea: tap the bubble with the right answer).
// The timer runs on real time (the 3D game may be in slow motion meanwhile) and stops while the page is hidden.
//   const qz = createQuiz();
//   const r = await qz.ask(q, { time, kicker, extra, quick, dirs });  → { ok, index, opt, frac, timeout }
//     frac = the part of the time that was used (0 = at once, 1 = the last moment); quick = the fast zone (0..1) drawn on the bar
//     dirs: show ◀ ▲ ▶ under the bubbles (Streetball defence: the bubble is also where you move)
//   qz.reveal(r, note?) colours the bubbles and shows the Czech help after a mistake; qz.hide() puts it away.
// Keys 1/2/3 (or A/B/C, or ←/↑/→) answer too, for a classroom board with a keyboard.
import { whyFor } from './quiz.js';

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const DIRS = ['◀', '▲', '▶'];

export function createQuiz(parent = document.body) {
  const el = document.createElement('div');
  el.className = 'qz hidden';
  el.innerHTML = `<div class="qz-card"><div class="qz-top"><span class="qz-kick"></span><span class="qz-extra"></span></div>
    <div class="qz-prompt"></div><div class="qz-timer"><b class="qz-zone"></b><i></i></div><div class="qz-note"></div></div>
    <div class="qz-opts">${[0, 1, 2].map((i) => `<button type="button" class="qz-b" data-i="${i}"><span class="qz-t"></span><em class="qz-dir">${DIRS[i]}</em></button>`).join('')}</div>`;
  parent.appendChild(el);
  const $ = (s) => el.querySelector(s);
  const card = $('.qz-card'), kick = $('.qz-kick'), extra = $('.qz-extra'), prompt = $('.qz-prompt'), bar = $('.qz-timer i'), zone = $('.qz-zone'), note = $('.qz-note');
  const btns = [...el.querySelectorAll('.qz-b')];
  let cur = null;   // { q, time, t0, used, resolve, done }
  let hiddenAt = 0;

  const now = () => performance.now() / 1000;
  const elapsed = () => (cur ? (cur.used + (hiddenAt ? 0 : now() - cur.t0)) : 0);
  document.addEventListener('visibilitychange', () => {
    if (!cur || cur.done) return;
    if (document.hidden) { cur.used += now() - cur.t0; hiddenAt = 1; } else { cur.t0 = now(); hiddenAt = 0; }
  });

  function finish(index, timeout = false) {
    if (!cur || cur.done) return;
    cur.done = true;
    const frac = Math.min(1, elapsed() / cur.time);
    const opt = index >= 0 ? cur.q.opts[index] : null;
    const r = { ok: !!(opt && opt.right), index, opt, frac, timeout, q: cur.q };
    btns.forEach((b) => (b.disabled = true));
    if (index >= 0) btns[index].classList.add('picked');
    cur.resolve(r);
  }
  btns.forEach((b) => b.addEventListener('pointerdown', (e) => { e.preventDefault(); finish(+b.dataset.i); }));
  btns.forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); finish(+b.dataset.i); }));
  addEventListener('keydown', (e) => {
    if (!cur || cur.done) return;
    const k = { 1: 0, 2: 1, 3: 2, a: 0, b: 1, c: 2, ArrowLeft: 0, ArrowUp: 1, ArrowRight: 2 }[e.key];
    if (k !== undefined) { e.preventDefault(); finish(k); }
  });

  function tick() {
    if (!cur || cur.done) return;
    const f = Math.min(1, elapsed() / cur.time);
    bar.style.transform = `scaleX(${(1 - f).toFixed(4)})`;
    el.classList.toggle('late', f > 0.7);
    if (f >= 1) finish(-1, true);
  }
  (function loop() { tick(); requestAnimationFrame(loop); })();

  return {
    get open() { return !!cur && !cur.done; },
    get question() { return cur && cur.q; },
    ask(q, o = {}) {
      return new Promise((resolve) => {
        cur = { q, time: o.time || 7, t0: now(), used: 0, resolve, done: false };
        hiddenAt = document.hidden ? 1 : 0;
        kick.textContent = o.kicker || q.kicker || 'QUESTION';
        extra.innerHTML = o.extra || '';
        prompt.innerHTML = q.prompt;
        prompt.className = 'qz-prompt k-' + q.kind;
        note.className = 'qz-note'; note.innerHTML = o.help || (q.kind === 'gap' ? 'Tap the word that fits.' : q.kind === 'reply' ? 'Tap the best answer.' : q.kind === 'word' ? 'Tap the picture.' : 'Tap the word.');
        zone.style.width = o.quick ? `${(o.quick * 100).toFixed(1)}%` : '0';
        zone.textContent = o.quickLabel || '';
        el.classList.toggle('dirs', !!o.dirs);
        el.classList.remove('hidden', 'late', 'shown', 'answered');
        btns.forEach((b, i) => {
          const op = q.opts[i];
          b.hidden = !op; b.disabled = false; b.className = 'qz-b' + (op && op.emoji ? ' emoji' : '') + (op && String(op.t).length > 14 ? ' long' : '');
          b.querySelector('.qz-t').textContent = op ? op.t : '';
          b.style.setProperty('--d', `${i * 0.06}s`);
        });
        bar.style.transform = 'scaleX(1)';
        void el.offsetWidth; el.classList.add('shown');
      });
    },
    // show what was right; a mistake shows the Czech help
    reveal(r, text) {
      if (!cur) return;
      el.classList.add('answered');
      const q = cur.q;
      btns.forEach((b, i) => { const op = q.opts[i]; if (!op) return; if (op.right) b.classList.add('right'); else if (i === r.index) b.classList.add('wrong'); else b.classList.add('dim'); });
      if (r.ok) { note.className = 'qz-note good'; note.innerHTML = text || 'Correct!'; }
      else {
        const why = whyFor(q, r.opt);
        note.className = 'qz-note bad';
        note.innerHTML = (r.timeout ? '<b class="tl">Time!</b> ' : '') + (why ? `<span class="cz">CZ</span> ${esc(why)}` : `Right: <b>${esc(q.answer)}</b>`);
      }
      if (q.kind === 'gap') { const g = prompt.querySelector('.gap'); if (g) { g.textContent = q.answer; g.classList.add('ok'); } }
    },
    hide() { el.classList.add('hidden'); el.classList.remove('shown'); if (cur) cur.done = true; },
    // test hook: answer right or wrong after `frac` of the time
    cheat(right = true, frac = 0.1) {
      if (!cur || cur.done) return false;
      cur.used = frac * cur.time; cur.t0 = now(); hiddenAt = 0;
      const i = cur.q.opts.findIndex((o) => !!o.right === !!right);
      finish(i);
      return true;
    },
    timeout() { if (cur && !cur.done) { cur.used = cur.time; finish(-1, true); } },
  };
}
