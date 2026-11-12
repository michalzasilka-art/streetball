// Streetball (Foxino Olympics): 1-on-1 basketball against Blaze, first to 3 baskets. Every play stops in slow motion
// for an English question (tap the right bubble, as in Penalty Star):
//  ATTACK  – Q1 right: Foxino crosses over and gets past Blaze (wrong: Blaze steals the ball);
//            Q2 right: the shot goes in (wrong: it rims out). Then defence.
//  DEFENCE – "where do you move?": the three bubbles are also LEFT / MIDDLE / RIGHT; the right one is the lane Blaze
//            drives into. Right: Foxino is there and takes the ball. Wrong: Blaze drives past and shoots; one more
//            question: right AND quick (inside the JUMP! zone) = Foxino blocks it. Otherwise the shot still misses 30%.
//            Then attack again.
import * as THREE from '../olympics/common/lib/three.module.min.js';
import { RoomEnvironment } from '../olympics/common/lib/RoomEnvironment.js';
import { makeFoxino, POSES, FURS } from '../olympics/common/foxino.js';
import { makeBlob, makeConfetti, makeSparks } from '../olympics/common/props.js';
import { sfx, unlock, crowd as crowdSound, setMuted, isMuted } from '../olympics/common/sound.js';
import { clamp, lerp, smooth, easeOut, easeInOut, damp } from '../olympics/common/mat.js';
import { makeDeck, timeFor, packFor, choosePacks, packSummary } from '../olympics/common/quiz.js';
import { createQuiz } from '../olympics/common/quizui.js';
import { Players, mountProfile } from '../olympics/common/players.js';
import { makeCourt, makeBasketball, RIM, BALL_R } from './court.js';
import { BPOSES } from './poses.js';

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const V3 = THREE.Vector3;
const WIN = 3;
const TOP_Z = 6.5, DEF_Z = 4.85, LANES = [-1.35, 0, 1.35];
const SLOW = 0.015;           // game speed while a question is open (almost frozen)
const QUICK = 0.55;           // the JUMP! zone of the block question
const MISS_CHANCE = 0.3;      // an unblocked shot by Blaze still misses this often
const ABORT = Symbol('abort');

// ---------- renderer / scene ----------
const canvas = $('gl');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  $('loadText').textContent = 'Sorry, this device cannot show 3D graphics (WebGL).';
  throw e;
}
canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
canvas.addEventListener('webglcontextrestored', () => location.reload());
let pr = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(pr);
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 700);
scene.add(camera);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;
scene.add(new THREE.HemisphereLight(0xffeedd, 0x6a5a8a, 1.3));
const sun = new THREE.DirectionalLight(0xffd7a6, 2.4); sun.position.set(-10, 14, 12); scene.add(sun);
const back = new THREE.DirectionalLight(0xb8d4ff, 0.9); back.position.set(8, 8, -14); scene.add(back);

const court = makeCourt(scene);
const ball = makeBasketball(); scene.add(ball);
const confetti = makeConfetti(); scene.add(confetti.mesh);
const sparks = makeSparks(); scene.add(sparks.points);

// Foxino in his basketball kit; Blaze, a red fox in blue
const foxKit = { sleeveless: true, jersey: 0xffcd1c, trim: 0x5b2bb0, accent: 0xff7d22, light: 0xfff6d0, shorts: 0x5b2bb0, sock: 0xffffff, sockBand: 0xff7d22, boot: 0xffffff, sole: 0xff7d22, name: 'FOXINO', number: 10 };
const blazeKit = { sleeveless: true, jersey: 0x2a8ad6, trim: 0xffffff, accent: 0x13396e, light: 0xffffff, shorts: 0x13396e, sock: 0xffffff, sockBand: 0x2a8ad6, boot: 0x1d1d2a, sole: 0x2a8ad6, name: 'BLAZE', number: 7 };
function actor(fox, name) {
  scene.add(fox.root);
  const blob = makeBlob(0.95); scene.add(blob);
  return { fox, name, blob, pos: new V3(), yaw: 0, yawT: 0, faceMove: false, tw: null, mode: 'stand', mt: 0, mdur: 1, side: -1, stride: 0, moving: 0 };
}
const me = actor(makeFoxino({ kit: foxKit, studs: false }), 'me');
const him = actor(makeFoxino({ colors: FURS.blaze, kit: blazeKit, studs: false }), 'him');
const ballBlob = makeBlob(0.36, 0.5); scene.add(ballBlob);

// ---------- state ----------
const S = {
  phase: 'loading', step: '', time: 0, slow: 1, slowT: 1, timeScale: 1, paused: false,
  me: 0, him: 0, poss: 'att', run: 0, qn: 0, missed: [], level: 1, packIds: [], deck: null, log: [],
  cheer: 0.15, shake: 0, endWin: null, qTime: 1,
};
const waits = [];
const wait = (s) => new Promise((r) => waits.push({ at: S.time + s, r }));
const realWait = (ms) => new Promise((r) => setTimeout(r, ms / Math.max(0.05, S.timeScale)));

// ---------- the ball ----------
const B = { mode: 'held', owner: me, ph: 0, lastCos: 1, fly: null, v: new V3(), held: 'dribble' };
const _v = new V3(), _v2 = new V3(), _v3 = new V3(), _h1 = new V3(), _h2 = new V3();
function hand(a, side, out) { return a.fox.J[side < 0 ? 'elbowR' : 'elbowL'].localToWorld(out.set(0, -0.16, 0.02)); }
function give(a, how = 'dribble') { B.mode = 'held'; B.owner = a; B.held = how; B.fly = null; }
// a flight from p0 to p1 over dur (seconds of game time) with an arc `h` metres above the straight line
function flyTo(p1, dur, h, then = null, extra = {}) {
  B.mode = 'fly'; B.fly = { p0: ball.position.clone(), p1: p1.clone(), t0: S.time, dur, h, then, ...extra };
}
function updateBall(dt) {
  if (B.mode === 'held') {
    const a = B.owner, m = a.mode;
    if (m === 'dribble' || m === 'drive') {
      B.ph += dt * (m === 'drive' ? 13 : 9.5);
      const c = Math.cos(B.ph), b = Math.abs(c);
      if (Math.sign(c) !== Math.sign(B.lastCos)) { if (S.slow > 0.5) sfx.bounce(); }
      B.lastCos = c;
      hand(a, a.side, _h1);
      const fwd = _v.set(Math.sin(a.yaw), 0, Math.cos(a.yaw));
      ball.position.set(_h1.x + fwd.x * 0.05, lerp(BALL_R, Math.max(BALL_R, _h1.y - BALL_R * 0.9), b), _h1.z + fwd.z * 0.05);
      a.ballB = b;
    } else if (m === 'crossover') {
      const u = clamp((S.time - a.mt) / a.mdur, 0, 1);
      hand(a, -1, _h1); hand(a, 1, _h2);
      const k = smooth(u), y = lerp(_h1.y, _h2.y, k) - 0.9 * Math.sin(Math.PI * u) * (lerp(_h1.y, _h2.y, k) - BALL_R);
      ball.position.set(lerp(_h1.x, _h2.x, k), Math.max(BALL_R, y - 0.1), lerp(_h1.z, _h2.z, k));
      if (u > 0.45 && u < 0.6 && !a.crossBounced) { a.crossBounced = true; sfx.bounce(); }
    } else {
      // in both paws, in front of the chest (and above the head for a shot)
      hand(a, -1, _h1); hand(a, 1, _h2);
      const fwd = _v.set(Math.sin(a.yaw), 0, Math.cos(a.yaw));
      ball.position.addVectors(_h1, _h2).multiplyScalar(0.5).addScaledVector(fwd, m === 'shoot' ? 0.06 : 0.1);
      ball.position.y += m === 'shoot' ? 0.1 : 0.02;
    }
    ball.rotation.x += dt * 4;
  } else if (B.mode === 'fly') {
    const f = B.fly, s = clamp((S.time - f.t0) / f.dur, 0, 1);
    ball.position.lerpVectors(f.p0, f.p1, s); ball.position.y += 4 * f.h * s * (1 - s);
    ball.rotation.x -= dt * 9;
    if (f.blockAt != null && s >= f.blockAt) {
      // swatted away
      B.mode = 'free'; B.v.set(f.blockDir * 2.6, 1.2, 3.4); sfx.block(); S.shake = 1;
      sparks.emit(ball.position, ['#ffffff', '#ffcd1c', '#ff7d22'], 40, 2.2, 0.15);
      return;
    }
    if (s >= 1) { const then = f.then; B.fly = null; B.mode = 'free'; B.v.set(0, 0, 0); if (then) then(); }
  } else if (B.mode === 'free') {
    B.v.y -= 9.8 * dt;
    ball.position.addScaledVector(B.v, dt);
    if (ball.position.y < BALL_R) {
      ball.position.y = BALL_R;
      if (Math.abs(B.v.y) > 0.7) { if (S.slow > 0.5) sfx.bounce(); }
      B.v.y = Math.abs(B.v.y) * 0.62; B.v.x *= 0.85; B.v.z *= 0.85;
      if (B.v.y < 0.3) B.v.y = 0;
    }
    B.v.x *= Math.exp(-0.4 * dt); B.v.z *= Math.exp(-0.4 * dt);
    ball.position.x = clamp(ball.position.x, -9.5, 9.5); ball.position.z = clamp(ball.position.z, -2.6, 15);
    ball.rotation.x += B.v.z * dt * 6; ball.rotation.z -= B.v.x * dt * 6;
  }
}

// ---------- the players ----------
function setMode(a, mode, o = {}) { a.mode = mode; a.mt = S.time; a.mdur = o.dur || 1; if (o.side) a.side = o.side; a.crossBounced = false; }
function face(a, yaw) { a.yawT = yaw; a.faceMove = false; }
const faceTo = (a, x, z) => face(a, Math.atan2(x - a.pos.x, z - a.pos.z));
function moveTo(a, x, z, dur, ease = easeInOut, faceMove = false) {
  a.tw = { from: a.pos.clone(), to: new V3(x, 0, z), t0: S.time, dur, ease };
  a.faceMove = faceMove;
  return wait(dur);
}
function place(a, x, z, yaw) { a.pos.set(x, 0, z); a.tw = null; a.yaw = a.yawT = yaw; }
function updateActor(a, dt) {
  let moved = 0;
  if (a.tw) {
    const u = clamp((S.time - a.tw.t0) / a.tw.dur, 0, 1);
    _v.lerpVectors(a.tw.from, a.tw.to, a.tw.ease(u));
    moved = _v.distanceTo(a.pos);
    if (a.faceMove && moved > 1e-4) a.yawT = Math.atan2(_v.x - a.pos.x, _v.z - a.pos.z);
    a.pos.copy(_v);
    if (u >= 1) a.tw = null;
  }
  a.moving = dt > 0 ? damp(a.moving, clamp(moved / dt / 3, 0, 1), 10, dt) : a.moving;
  a.stride += moved * 6.2;
  let d = a.yawT - a.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
  a.yaw += d * (1 - Math.exp(-10 * dt));
  const t = S.time, u = clamp((t - a.mt) / a.mdur, 0, 1);
  let P;
  switch (a.mode) {
    case 'dribble': P = BPOSES.dribble(t, a.ballB ?? 0.5, a.side); break;
    case 'drive': P = BPOSES.drive(a.stride, a.ballB ?? 0.5, a.side); break;
    case 'run': P = POSES.run(a.stride, 1); break;
    case 'crossover': P = BPOSES.crossover(u, t); break;
    case 'shoot': P = BPOSES.shoot(u); break;
    case 'stance': P = BPOSES.stance(t, a.moving > 0.15 ? 1 : 0); break;
    case 'steal': P = BPOSES.steal(u, t); break;
    case 'block': P = BPOSES.block(u); break;
    case 'stumble': P = BPOSES.stumble(u, t); break;
    case 'celebrate': P = POSES.celebrate(t - a.mt); break;
    case 'sad': P = POSES.sad(t - a.mt); break;
    case 'hold': P = BPOSES.hold(t); break;
    case 'ready': P = POSES.ready(t); break;
    default: P = POSES.stand(t);
  }
  a.fox.apply(P, a.mode === 'shoot' || a.mode === 'block' || a.mode === 'crossover' ? 26 : 14, dt);
  a.fox.update(dt, t);
  a.fox.root.position.copy(a.pos);
  a.fox.root.rotation.y = a.yaw;
  a.fox.root.updateMatrixWorld(true);
  a.blob.position.set(a.pos.x, 0.012, a.pos.z);
  a.blob.scale.setScalar(1 - clamp(a.fox.pose.y, 0, 0.45));
}

// ---------- UI ----------
const qz = createQuiz();
const ui = { banner: $('banner'), score: $('score'), tag: $('scTag'), slowmo: $('slowmo'), start: $('start'), end: $('end'), loading: $('loading') };
let bannerTimer = 0;
function banner(text, cls = '') {
  ui.banner.innerHTML = `<span class="word ${cls}">${text}</span>`;
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { ui.banner.innerHTML = ''; }, 1900);
}
function renderScore(pop) {
  $('scMe').textContent = S.me; $('scHim').textContent = S.him;
  const dots = (n, who) => Array.from({ length: WIN }, (_, i) => `<i class="${i < n ? 'on' : ''}${pop === who && i === n - 1 ? ' pop' : ''}"></i>`).join('');
  $('dotsMe').innerHTML = dots(S.me, 'me'); $('dotsHim').innerHTML = dots(S.him, 'him');
}
function setTag(att) {
  ui.tag.textContent = att ? 'YOUR BALL · ATTACK' : 'BLAZE’S BALL · DEFENCE';
  ui.tag.classList.toggle('def', !att);
}
function setSlow(on) { S.slowT = on ? SLOW : 1; ui.slowmo.classList.toggle('on', on); if (on) sfx.slowmo(); }

const LV_COL = { A0: '#7fe0a0', A1: '#4fb4ff', A2: '#b57bff' };
async function renderPack() {
  const btn = $('packBtn');
  const sum = S.packIds.length ? await packSummary(S.packIds).catch(() => null) : null;
  if (sum) btn.innerHTML = `<span class="lv" style="background:${LV_COL[sum.level] || '#8f52d9'}">${esc(sum.level)}</span><span><b>${esc(sum.title)}</b><small>${esc(sum.sub)}</small></span><span class="chg">CHANGE</span><span class="x" data-clear="1" aria-label="Back to the Foxino mix">✕</span>`;
  else btn.innerHTML = `<span class="lv">${S.level === 2 ? 'A2' : 'A1'}</span><span><b>Foxino mix</b><small>Words, gaps and replies with Czech help · or choose school topics</small></span><span class="chg">TOPICS</span>`;
}
function renderLevel() { document.querySelectorAll('#levelSeg button').forEach((b) => b.classList.toggle('on', +b.dataset.lv === S.level)); }
function renderRecord() {
  const d = Players.data('ball'), p = Players.current();
  const html = d.games ? `${esc(p.name)}: <b class="w">${d.wins || 0} won</b> · <b class="l">${d.losses || 0} lost</b>${d.best ? ` · best <b>${d.best}</b>` : ''}` : `${esc(p.name)}: your first game!`;
  $('record').innerHTML = html; $('endRecord').innerHTML = html;
}
function loadPrefs() {
  const pf = Players.prefs();
  S.level = pf.level === 2 ? 2 : 1;
  S.packIds = Array.isArray(pf.packs) ? pf.packs : [];
  renderLevel(); renderPack(); renderRecord();
}
mountProfile($('profileBtn'), () => loadPrefs());
$('levelSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  unlock(); sfx.click(); S.level = +b.dataset.lv; Players.prefs().level = S.level; Players.save(); renderLevel(); renderPack();
});
$('packBtn').addEventListener('click', async (e) => {
  unlock(); sfx.click();
  if (e.target.closest('[data-clear]')) { S.packIds = []; Players.prefs().packs = []; Players.save(); renderPack(); return; }
  const ids = await choosePacks(S.packIds).catch(() => null);
  if (ids && ids.length) { S.packIds = ids; Players.prefs().packs = ids; Players.save(); renderPack(); }
});
$('leaveBtn').onclick = () => {
  sfx.click();
  // mid-game: back to the start screen; otherwise back to the Olympics hub (or tell the fugio.co library frame)
  if (S.phase === 'play' || S.phase === 'end') { toMenu(); return; }
  let hub = false; try { hub = sessionStorage.getItem('olympics-hub') === '1'; } catch (e) { /* ignore */ }
  if (hub || window.parent === window) location.href = '/olympics/'; else window.parent.postMessage({ fugio: 'leave' }, '*');
};
const muteBtn = $('muteBtn');
muteBtn.classList.toggle('muted', isMuted());
muteBtn.onclick = () => { unlock(); setMuted(!isMuted()); muteBtn.classList.toggle('muted', isMuted()); if (!isMuted()) sfx.click(); };
$('playBtn').onclick = () => { unlock(); sfx.click(); startGame(); };
$('againBtn').onclick = () => { unlock(); sfx.click(); startGame(); };
$('menuBtn').onclick = () => { unlock(); sfx.click(); toMenu(); };

// ---------- a question (the game slows down meanwhile) ----------
const PRAISE = ['Great!', 'Super!', 'Yes!', 'Well done!', 'Brilliant!'];
async function ask(tok, o) {
  const q = S.deck.next(); S.qn++;
  setSlow(true);
  await realWait(250);
  if (tok !== S.run) throw ABORT;
  const time = timeFor(q, o.base || 6) * S.qTime;
  S.step = o.step;
  const r = await qz.ask(q, { time, kicker: o.kicker, help: o.help, quick: o.quick, quickLabel: o.quickLabel, dirs: o.dirs, extra: `${S.me} : ${S.him}` });
  if (tok !== S.run) throw ABORT;
  const quickOk = !o.quick || r.frac <= o.quick;
  qz.reveal(r, r.ok ? (quickOk ? pick(PRAISE) + ' ✓' : 'Right, but too slow!') : null);
  if (r.ok) sfx.right(); else { sfx.wrong(); S.deck.miss(q); if (!S.missed.some((m) => m.full === q.full)) S.missed.push({ full: q.full, answer: q.answer, kind: q.kind }); }
  S.log.push({ step: o.step, ok: r.ok, frac: +r.frac.toFixed(2), timeout: r.timeout });
  await realWait(r.ok && quickOk ? 750 : 1700);
  if (tok !== S.run) throw ABORT;
  qz.hide(); setSlow(false);
  return r;
}

// ---------- the plays ----------
const HOOPZ = RIM.z;
async function checkBall(tok, att) {
  // both players jog to their spots; the ball is passed to the attacker
  const A = att ? me : him, D = att ? him : me;
  S.poss = att ? 'att' : 'def'; setTag(att);
  setMode(A, 'run'); setMode(D, 'run');
  moveTo(A, 0, TOP_Z, 1.1, easeInOut, true);
  await moveTo(D, 0, DEF_Z, 1.1, easeInOut, true);
  if (tok !== S.run) throw ABORT;
  face(A, Math.PI); face(D, 0);
  setMode(A, 'hold'); setMode(D, 'stance');
  if (B.owner !== A || B.mode !== 'held') {
    hand(A, -1, _h1); hand(A, 1, _h2); _v3.addVectors(_h1, _h2).multiplyScalar(0.5);
    flyTo(_v3, 0.5, 0.35, () => { give(A, 'hold'); });
    await wait(0.55);
  } else give(A, 'hold');
  if (tok !== S.run) throw ABORT;
  banner(att ? 'YOUR BALL!' : 'DEFENCE!', 'small' + (att ? '' : ' bad'));
  await wait(0.5);
  setMode(A, 'dribble', { side: -1 }); give(A, 'dribble');
}

async function attack(tok) {
  await checkBall(tok, true);
  const w = async (s) => { await wait(s); if (tok !== S.run) throw ABORT; };
  // a little probing dribble
  moveTo(me, 0.35, TOP_Z - 0.4, 0.9); await w(0.9);
  const r1 = await ask(tok, { step: 'move', kicker: 'ATTACK · BEAT BLAZE', help: 'Right answer = a move past Blaze!' });
  if (!r1.ok) {
    // Blaze pokes the ball away
    setMode(him, 'steal', { dur: 0.6 }); moveTo(him, me.pos.x - 0.1, me.pos.z - 0.55, 0.3);
    await w(0.25);
    sfx.block(); setMode(me, 'stumble', { dur: 0.9 });
    hand(him, -1, _h1); flyTo(_h1, 0.3, 0.15, () => give(him, 'hold'));
    banner('STOLEN!', 'bad'); sfx.aww(); S.cheer = 0.2;
    await w(0.5); setMode(him, 'hold'); setMode(me, 'sad'); await w(1.1);
    return;
  }
  // the crossover and the drive past him
  const dir = -1;     // he jabbed to world +x (his right); the crossover takes the ball to his left paw and he drives to world -x
  setMode(me, 'crossover', { dur: 0.42 });
  setMode(him, 'stumble', { dur: 1.0 }); moveTo(him, him.pos.x - dir * 0.45, him.pos.z + 0.15, 0.4);
  face(him, -dir * 0.9);
  sfx.squeak();
  await w(0.42);
  const paw = 1;      // the left paw
  setMode(me, 'drive', { side: paw }); give(me, 'dribble');
  const sx = dir * 1.15, sz = 2.55;
  moveTo(me, sx, sz, 0.95, (u) => u, true);
  banner('NICE MOVE!', 'small'); S.cheer = 0.6; sfx.cheer();
  await w(0.3);
  setMode(him, 'run'); moveTo(him, dir * 0.15, 3.6, 0.9, easeInOut, true);
  await w(0.65);
  // up for the shot: slow motion in the gather
  faceTo(me, RIM.x, RIM.z); setMode(me, 'shoot', { dur: 1.1 }); give(me, 'shoot');
  await w(0.22);
  setMode(him, 'stance'); faceTo(him, me.pos.x, me.pos.z);
  const r2 = await ask(tok, { step: 'shot', kicker: 'SHOOT!', help: 'Right answer = the ball goes in!' });
  await w(Math.max(0, 0.6 - (S.time - me.mt)));
  await shot(tok, me, r2.ok ? 'swish' : 'rimout');
  if (r2.ok) {
    S.me++; renderScore('me');
    banner('SWISH!'); sfx.cheer(); S.cheer = 1; confetti.burst(new V3(RIM.x, RIM.y, RIM.z + 1.2), 5, 2);
    setMode(me, 'celebrate'); face(me, 0); setMode(him, 'sad');
  } else {
    banner('MISSED!', 'bad'); sfx.aww(); S.cheer = 0.2;
    setMode(me, 'sad'); setMode(him, 'run');
    await w(0.5); moveTo(him, ball.position.x, ball.position.z, 0.6, easeInOut, true);
    await w(0.6);
    B.mode = 'held'; give(him, 'hold'); setMode(him, 'hold');
  }
  await w(1.6);
}

// a shot from `a` with an outcome: 'swish', 'rimout' or 'block' (then o.blockDir)
async function shot(tok, a, outcome, o = {}) {
  const from = ball.position.clone();
  const far = Math.hypot(from.x - RIM.x, from.z - RIM.z);
  const dur = 0.7 + far * 0.08;
  B.mode = 'fly';
  if (outcome === 'swish') {
    flyTo(new V3(RIM.x, RIM.y + 0.03, RIM.z), dur, 0.9 + far * 0.08, () => {
      court.swish(); sfx.swish(); B.v.set(0, -2.2, 0.25); ball.position.set(RIM.x, RIM.y - 0.05, RIM.z);
    });
  } else if (outcome === 'rimout') {
    const sx = Math.random() < 0.5 ? -1 : 1;
    flyTo(new V3(RIM.x + sx * 0.08, RIM.y + 0.1, RIM.z + 0.2), dur, 0.9 + far * 0.08, () => {
      court.rimHit(); sfx.rim(); B.v.set(sx * 1.4, 2.4, 2.6);
    });
  } else {
    flyTo(new V3(RIM.x, RIM.y + 0.03, RIM.z), dur, 0.9 + far * 0.08, null, { blockAt: o.blockAt ?? 0.22, blockDir: o.blockDir || 1 });
  }
  await wait(dur + 0.15);
  if (tok !== S.run) throw ABORT;
}

async function defence(tok) {
  await checkBall(tok, false);
  const w = async (s) => { await wait(s); if (tok !== S.run) throw ABORT; };
  // Blaze probes with a jab step
  moveTo(him, -0.25, TOP_Z - 0.35, 0.8); await w(0.8);
  const r = await ask(tok, { step: 'guard', dirs: true, kicker: 'DEFENCE · WHERE DO YOU MOVE?', help: 'The right answer is where Blaze drives. Move there to stop him!' });
  const lane = r.q.opts.findIndex((op) => op.right);
  const goX = r.index >= 0 ? LANES[r.index] : me.pos.x;
  // Foxino slides; Blaze drives into his lane
  setMode(me, 'stance'); moveTo(me, goX, DEF_Z - 0.35, 0.32);
  sfx.squeak();
  const paw = LANES[lane] > 0 ? 1 : -1;   // Blaze faces -z: his left paw is on world -x… keep the ball on the outside
  setMode(him, 'drive', { side: -paw || -1 });
  if (r.ok) {
    await moveTo(him, LANES[lane], DEF_Z + 0.45, 0.45, easeOut, true);
    // stopped: Foxino pokes the ball away and takes it
    setMode(me, 'steal', { dur: 0.6 }); setMode(him, 'stumble', { dur: 0.9 });
    sfx.block(); S.shake = 0.6;
    hand(me, -1, _h1); flyTo(_h1, 0.3, 0.2, () => give(me, 'hold'));
    banner('STOPPED!'); sfx.cheer(); S.cheer = 0.9;
    await w(0.55); setMode(me, 'celebrate'); face(me, Math.PI * 0.85); setMode(him, 'sad');
    await w(1.4);
    return;
  }
  // he gets past
  const ex = LANES[lane] * 0.55, ez = 2.25;
  moveTo(him, LANES[lane], DEF_Z - 0.3, 0.42, easeOut, true);
  await w(0.25);
  setMode(me, 'stumble', { dur: 0.8 }); faceTo(me, LANES[lane], DEF_Z);
  banner('HE’S PAST YOU!', 'small bad');
  await w(0.17);
  moveTo(him, ex, ez, 0.8, (u) => u, true);
  await w(0.35);
  // Foxino chases to stand between him and the hoop
  const gx = ex + (ex > 0 ? -0.3 : 0.3), gz = ez - 0.85;
  setMode(me, 'run'); moveTo(me, gx, gz, 0.75, easeOut, true);
  await w(0.45);
  // Blaze rises for the shot: slow motion
  faceTo(him, RIM.x, RIM.z); setMode(him, 'shoot', { dur: 1.1 }); give(him, 'shoot');
  await w(0.22);
  setMode(me, 'stance'); faceTo(me, him.pos.x, him.pos.z);
  const rb = await ask(tok, { step: 'block', kicker: 'BLOCK IT! ANSWER FAST', help: 'Right and fast = you jump and block!', quick: QUICK, quickLabel: 'JUMP!', base: 5 });
  const blocked = rb.ok && rb.frac <= QUICK;
  await w(Math.max(0, 0.6 - (S.time - him.mt)));
  if (blocked) {
    setMode(me, 'block', { dur: 0.9 }); sfx.squeak();
    const shotP = shot(tok, him, 'block', { blockDir: me.pos.x >= him.pos.x ? 1 : -1, blockAt: 0.2 });
    await w(0.3);
    banner('BLOCKED!'); sfx.cheer(); S.cheer = 1; confetti.burst(new V3(me.pos.x, 1.5, me.pos.z), 4, 1.5);
    await shotP;
    setMode(me, 'celebrate'); face(me, 0); setMode(him, 'sad');
    await w(1.5);
    return;
  }
  // not blocked: a late jump (right but slow) or none; the shot still misses sometimes
  if (rb.ok) { setTimeout(() => { if (tok === S.run) setMode(me, 'block', { dur: 0.9 }); }, 120); banner('TOO LATE!', 'small bad'); }
  const miss = forced != null ? forced === 'miss' : Math.random() < MISS_CHANCE;
  forced = null;
  await shot(tok, him, miss ? 'rimout' : 'swish');
  if (miss) {
    banner('MISSED! PHEW!', 'small'); sfx.cheer(); S.cheer = 0.7;
    setMode(me, 'run'); await w(0.4); moveTo(me, ball.position.x, ball.position.z, 0.6, easeInOut, true);
    await w(0.6); give(me, 'hold'); setMode(me, 'hold');
  } else {
    S.him++; renderScore('him');
    banner('BLAZE SCORES', 'bad'); sfx.aww(); S.cheer = 0.25;
    setMode(him, 'celebrate'); face(him, 0); setMode(me, 'sad');
  }
  await w(1.5);
}
let forced = null;

// ---------- the game ----------
async function startGame() {
  const tok = ++S.run;
  const pack = S.packIds.length ? await packFor(S.packIds).catch(() => null) : null;
  if (tok !== S.run) return;
  S.deck = makeDeck({ level: S.level, pack });
  S.me = 0; S.him = 0; S.qn = 0; S.missed = []; S.log = []; S.endWin = null;
  renderScore();
  ui.start.classList.add('hidden'); ui.end.classList.add('hidden'); ui.score.classList.remove('hidden');
  document.body.classList.add('playing');
  qz.hide(); setSlow(false);
  S.phase = 'play'; S.cheer = 0.3;
  sfx.whistle();
  place(me, 0, 8.4, Math.PI); place(him, 0, DEF_Z, 0);
  give(me, 'hold'); setMode(me, 'hold');
  try {
    let att = true;
    while (S.me < WIN && S.him < WIN) {
      if (att) await attack(tok); else await defence(tok);
      att = !att;
    }
    endGame(tok);
  } catch (e) {
    if (e !== ABORT) throw e;
  }
}

function endGame(tok) {
  if (tok !== S.run) return;
  const won = S.me > S.him;
  S.phase = 'end'; S.endWin = won; S.step = '';
  ui.score.classList.add('hidden'); document.body.classList.remove('playing');
  const d = Players.data('ball');
  d.games = (d.games || 0) + 1;
  if (won) { d.wins = (d.wins || 0) + 1; const m = `${S.me} : ${S.him}`; if (!d.best || (S.me - S.him) > (d.bestMargin || 0)) { d.best = m; d.bestMargin = S.me - S.him; } }
  else d.losses = (d.losses || 0) + 1;
  d.last = Date.now(); Players.save();
  renderRecord();
  $('endTitle').textContent = won ? (S.him === 0 ? 'Perfect game!' : 'You win!') : 'Blaze wins!';
  $('endTitle').classList.toggle('lost', !won);
  $('endMe').textContent = S.me; $('endHim').textContent = S.him;
  const ms = $('missed');
  ms.classList.toggle('hidden', !S.missed.length);
  $('missedList').innerHTML = S.missed.slice(0, 8).map((m) => m.kind === 'gap' ? `<li>${esc(m.full).replace(esc(m.answer), `<b>${esc(m.answer)}</b>`)}</li>` : `<li>${esc(m.full.split(' — ')[0])} <span>→</span> <b>${esc(m.answer)}</b></li>`).join('');
  const W = won ? me : him, L = won ? him : me;
  setMode(W, 'celebrate'); face(W, 0); setMode(L, 'sad'); face(L, 0);
  place(W, -0.7, 5.6, 0); place(L, 0.9, 4.6, 0.3);
  B.mode = 'free'; ball.position.set(1.6, BALL_R, 5.4); B.v.set(0, 0, 0);
  if (won) { sfx.fanfare(); confetti.burst(new V3(-0.7, 1.6, 5.6), 5, 3); S.cheer = 1; } else { sfx.aww(); S.cheer = 0.2; }
  camSnap = true;
  setTimeout(() => { if (S.phase === 'end') ui.end.classList.remove('hidden'); }, 1300);
}

function toMenu() {
  S.run++;
  S.phase = 'menu'; S.step = '';
  qz.hide(); setSlow(false);
  ui.end.classList.add('hidden'); ui.score.classList.add('hidden'); ui.start.classList.remove('hidden');
  document.body.classList.remove('playing');
  place(me, -0.5, 6.0, 0.25); setMode(me, 'dribble', { side: -1 }); give(me, 'dribble');
  place(him, 1.1, 4.4, 0.2); setMode(him, 'stance');
  S.cheer = 0.15; camSnap = true;
  loadPrefs();
}

// ---------- camera ----------
// In play the camera sits behind the action looking at the hoop; its field of view and a view offset are fitted so
// the hoop and both players fit between the question card and the answer bubbles (the space is kept free all game).
const CAM = { pos: new V3(), look: new V3(), fov: 40, fx: 0.5, fy: 0.5 };
const TGT = { pos: new V3(), look: new V3(), fov: 40, fx: 0.5, fy: 0.5 };
const UP = new V3(0, 1, 0);
const RES = { top: 0, bot: 0, measured: false };
function measureReserve() {
  const H = innerHeight;
  const card = document.querySelector('.qz-card'), opts = [...document.querySelectorAll('.qz-b')].filter((b) => !b.hidden);
  if (qz.open && card && opts.length) {
    const cr = card.getBoundingClientRect();
    const top = Math.min(...opts.map((b) => b.getBoundingClientRect().top));
    if (cr.height > 20 && top > 0) { RES.top = cr.bottom / H; RES.bot = top / H; RES.measured = true; }
  }
  if (!RES.measured) {
    const land = H <= 500;
    RES.top = land ? 150 / H : (62 + (innerWidth < innerHeight ? 170 : 150)) / H;
    RES.bot = 1 - (land ? 82 : Math.min(150, Math.max(78, H * 0.15)) + 40) / H;
  }
}
function fitPts(out, pts, safe) {
  const a = innerWidth / innerHeight;
  const f = _v.subVectors(out.look, out.pos).normalize();
  const r = _v2.crossVectors(f, UP).normalize();
  const u = _v3.crossVectors(r, f);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const p of pts) {
    const dx = p.x - out.pos.x, dy = p.y - out.pos.y, dz = p.z - out.pos.z;
    const z = dx * f.x + dy * f.y + dz * f.z;
    const tx = (dx * r.x + dy * r.y + dz * r.z) / z, ty = (dx * u.x + dy * u.y + dz * u.z) / z;
    x0 = Math.min(x0, tx); x1 = Math.max(x1, tx); y0 = Math.min(y0, ty); y1 = Math.max(y1, ty);
  }
  const wf = safe.r - safe.l, hf = safe.b - safe.t;
  let T = Math.max((y1 - y0) / (2 * hf), (x1 - x0) / (2 * a * wf)) * 1.08;
  T = clamp(T, Math.tan(THREE.MathUtils.degToRad(9)), Math.tan(THREE.MathUtils.degToRad(42)));
  out.fov = THREE.MathUtils.radToDeg(2 * Math.atan(T));
  out.fx = (safe.l + safe.r) / 2 - ((x0 + x1) / 2) / (2 * T * a);
  out.fy = (safe.t + safe.b) / 2 + ((y0 + y1) / 2) / (2 * T);
}
let camSide = 1;
const PTS = Array.from({ length: 14 }, () => new V3());
function rigPlay(out) {
  const a = innerWidth / innerHeight;
  const zMax = Math.max(me.pos.z, him.pos.z), cx = (me.pos.x + him.pos.x) * 0.25;
  const W = innerWidth, H = innerHeight;
  // how wide the free strip between the card and the bubbles is: a wide, short strip (a phone on its side) gets a
  // lower, flatter camera so the hoop and the players line up instead of stacking
  const sa = (W * 0.95) / Math.max(60, (RES.bot - RES.top) * H);
  const flat = clamp((sa - 2.2) / 2.5, 0, 1);
  // a little from the side, so the defender is never hidden behind the attacker
  const A = S.poss === 'att' ? me : him;
  // (attack: on Foxino's side when he drives; defence: across from Blaze, so Foxino's face shows)
  const want = S.poss === 'att' ? (A.pos.x < -0.4 ? -1 : 1) : (A.pos.x > 0.4 ? -1 : 1);
  camSide = damp(camSide, want, 2.5, 1 / 60);
  out.pos.set(cx + camSide * (a < 0.8 ? 1.3 : lerp(2.0, 2.6, flat)), a < 0.8 ? 4.4 : lerp(3.5, 2.0, flat), zMax + (a < 0.8 ? 6.8 : lerp(5.6, 4.6, flat)));
  out.look.set(cx * 0.6, lerp(1.2, 1.45, flat), 2.2);
  let i = 0;
  PTS[i++].set(RIM.x - 0.4, RIM.y, RIM.z); PTS[i++].set(RIM.x + 0.4, RIM.y, RIM.z); PTS[i++].set(0, flat > 0.5 ? 2.4 : 3.12, 0.6);
  for (const p of [me, him]) {
    const jy = Math.max(0, p.fox.pose.y);
    PTS[i++].set(p.pos.x - 0.38, 0, p.pos.z); PTS[i++].set(p.pos.x + 0.38, 0, p.pos.z); PTS[i++].set(p.pos.x, 1.42 + jy, p.pos.z);
  }
  const safe = { l: 12 / W, r: 1 - 12 / W, t: clamp(RES.top + 8 / H, 0.06, 0.55), b: clamp(RES.bot - 10 / H, 0.4, 0.98) };
  fitPts(out, PTS.slice(0, i), safe);
}
function rigShow(out, a0) {
  // menu / end: an orbit close to Foxino (or the winner), who stays clear of the panel
  const a = innerWidth / innerHeight;
  const W = S.phase === 'end' ? (S.endWin ? me : him) : me;
  const th = a0 + 0.2 * Math.sin(S.time * 0.25);
  const d = a < 0.8 ? 5.0 : 3.9;
  out.pos.set(W.pos.x + Math.sin(th) * d, 1.35, W.pos.z + Math.cos(th) * d);
  out.look.set(W.pos.x + 0.2, 0.85, W.pos.z);
  out.fov = a < 0.8 ? 42 : 38;
  out.fx = a < 1.25 ? 0.5 : 0.28;
  out.fy = a < 0.8 ? (S.phase === 'end' ? 0.25 : 0.47) : a < 1.25 ? 0.42 : 0.5;
}
let camSnap = true;
function rigPoster(out) {
  const a = innerWidth / innerHeight;
  out.pos.set(0.7, 1.3, 8.6); out.look.set(0.15, 1.6, 2.8);
  out.fov = a < 0.8 ? 44 : 34; out.fx = 0.5; out.fy = 0.5;
}
function updateCamera(dt) {
  if (S.phase === 'poster') rigPoster(TGT);
  else if (S.phase === 'play') rigPlay(TGT); else rigShow(TGT, S.phase === 'end' ? -0.3 : 0.35);
  const k = camSnap ? 1 : 1 - Math.exp(-3.2 * dt);
  camSnap = false;
  CAM.pos.lerp(TGT.pos, k); CAM.look.lerp(TGT.look, k);
  CAM.fov = lerp(CAM.fov, TGT.fov, k); CAM.fx = lerp(CAM.fx, TGT.fx, k); CAM.fy = lerp(CAM.fy, TGT.fy, k);
  camera.position.copy(CAM.pos);
  if (S.shake > 0.001) camera.position.add(_v.set(Math.random() - 0.5, Math.random() - 0.5, 0).multiplyScalar(S.shake * 0.08));
  camera.lookAt(CAM.look);
  if (Math.abs(camera.fov - CAM.fov) > 0.001) { camera.fov = CAM.fov; camera.updateProjectionMatrix(); }
  const w = innerWidth, h = innerHeight;
  const ox = (0.5 - CAM.fx) * w, oy = (0.5 - CAM.fy) * h;
  if (Math.abs(ox) > 0.5 || Math.abs(oy) > 0.5) camera.setViewOffset(w, h, ox, oy, w, h);
  else if (camera.view && camera.view.enabled) camera.clearViewOffset();
  camera.updateMatrixWorld();
  court.sky.position.copy(camera.position);
  // the banner floats over the middle of the free play area
  if (S.phase === 'play') ui.banner.style.top = (((RES.top + RES.bot) / 2) * 100).toFixed(1) + '%';
  else ui.banner.style.top = '';
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  RES.measured = false; measureReserve();
  sparks.uniforms.uScale.value = 300 * pr * (h / 800);
}
addEventListener('resize', () => { resize(); camSnap = true; });

// ---------- main loop ----------
let last = performance.now(), slowFrames = 0, frames = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const rdt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  const sdt = S.paused ? 0 : rdt * S.timeScale;
  S.slow = S.slowT < S.slow ? damp(S.slow, S.slowT, 9, sdt) : damp(S.slow, S.slowT, 6, sdt);
  if (Math.abs(S.slow - S.slowT) < 0.002) S.slow = S.slowT;
  const dt = sdt * S.slow;
  S.time += dt;
  if (S.posterAt && S.time >= S.posterAt) { S.posterAt = 0; S.timeScale = 0; window.SB.posterReady = true; }
  for (let i = waits.length - 1; i >= 0; i--) if (waits[i].at <= S.time) { const r = waits[i].r; waits.splice(i, 1); r(); }
  updateActor(me, dt); updateActor(him, dt);
  updateBall(dt);
  ballBlob.position.set(ball.position.x, 0.014, ball.position.z);
  ballBlob.scale.setScalar(1 - clamp((ball.position.y - BALL_R) / 3, 0, 0.7));
  if (qz.open) measureReserve();
  updateCamera(sdt);
  court.update(dt, S.time);
  const cu = court.crowd.uniforms;
  cu.uCheer.value = damp(cu.uCheer.value, S.cheer > 0.5 ? S.cheer : 0, 5, sdt);
  cu.uWave.value = damp(cu.uWave.value, S.phase !== 'play' ? 1 : 0, 1.5, sdt);
  S.cheer = Math.max(0.15, S.cheer - sdt * 0.25);
  crowdSound(document.hidden ? 0 : S.cheer * 0.6);
  confetti.update(dt);
  sparks.update(dt);
  S.shake = Math.max(0, S.shake - rdt * 2.4);
  renderer.render(scene, camera);
  if (rdt > 0 && !S.paused) { frames++; if (rdt > 1 / 38) slowFrames++; }
  if (frames >= 90) {
    if (slowFrames > 45 && pr > 1) { pr = Math.max(1, pr - 0.25); resize(); }
    frames = 0; slowFrames = 0;
  }
}

// ---------- start ----------
// ?demo=poster: a frozen action frame with no UI (for the library poster)
function posterScene() {
  S.phase = 'poster'; document.body.classList.add('poster');
  ui.start.classList.add('hidden');
  S.posterAt = S.time + 1.4;
  // Foxino has just scored: he jumps for joy facing us, the ball drops through the swishing net, Blaze is gutted
  place(me, -0.3, 4.75, 0.25); setMode(me, 'celebrate'); me.mt = S.posterAt - 0.2;
  place(him, 0.95, 3.3, -0.1); setMode(him, 'sad'); him.mt = S.posterAt - 0.9;
  B.mode = 'poster'; ball.position.set(RIM.x, RIM.y - 0.2, RIM.z);
  setTimeout(() => court.swish(), 900);
  S.cheer = 1; camSnap = true;
  confetti.burst(new V3(0, 2.6, 3.6), 6, 1.4);
}
function init() {
  resize();
  toMenu();
  if (new URLSearchParams(location.search).get('demo') === 'poster') posterScene();
  $('loadFill').style.width = '100%';
  requestAnimationFrame(frame);
  ui.loading.classList.add('done'); setTimeout(() => { window.SB.ready = true; }, 450);
}

// ---------- test hooks ----------
window.SB = {
  ready: false,
  state: () => ({
    phase: S.phase, step: S.step, poss: S.poss, me: S.me, him: S.him, qOpen: qz.open, qn: S.qn, time: +S.time.toFixed(2), slow: +S.slow.toFixed(3),
    question: qz.open ? { kicker: document.querySelector('.qz-kick').textContent, options: qz.question.opts.map((o) => o.t), correct: qz.question.opts.findIndex((o) => o.right) } : null,
    ball: B.mode, owner: B.owner && B.owner.name, meMode: me.mode, himMode: him.mode, fov: +camera.fov.toFixed(1), log: S.log.slice(), endWin: S.endWin, missed: S.missed.length,
    level: S.level, packs: S.packIds.slice(),
  }),
  start: () => { unlock(); startGame(); return true; },
  answer: (right = true, frac = 0.1) => qz.cheat(right, frac),
  timeScale: (k) => { S.timeScale = k; },
  pause: (b) => { S.paused = !!b; },
  force: (o) => { forced = o; },
  questionTime: (k) => { S.qTime = k; },   // tests on slow software rendering give the questions more time          // 'miss' or 'score' for Blaze's next unblocked shot
  info: () => ({ triangles: renderer.info.render.triangles, calls: renderer.info.render.calls, programs: renderer.info.programs.length, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }),
  reserve: () => ({ ...RES }),
};

$('loadFill').style.width = '60%';
init();
