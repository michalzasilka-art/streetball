// The street court: painted asphalt half-court (purple key, orange arcs), one hoop with a glass-look backboard and a
// net that swishes, chain-link fences, a graffiti wall in Foxino colours, city blocks, two little bleachers with a
// cheering crowd, street lamps and trees, a warm afternoon sky. Also the basketball. No shadows (blob shadows instead).
// World: the baseline is z = 0, the court runs toward +z (half-court line z = 14), the rim centre is RIM (x 0).
import * as THREE from '../olympics/common/lib/three.module.min.js';
import { toon, add, group } from '../olympics/common/mat.js';
import { makeCrowd, standGeometry } from '../olympics/common/crowd.js';

export const RIM = new THREE.Vector3(0, 2.1, 0.95);
export const RIM_R = 0.24, BALL_R = 0.12, BOARD_Z = 0.6;

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const tex = (cv, o = {}) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = o.aniso || 8; if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(o.repeat[0], o.repeat[1]); } return t; };
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------- sky: a warm afternoon gradient with a soft sun ----------
function makeSky() {
  const cv = canvas(16, 512), g = cv.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#4f8fe0'); gr.addColorStop(0.35, '#86bdf2'); gr.addColorStop(0.47, '#ffd9a8'); gr.addColorStop(0.5, '#ffc98a'); gr.addColorStop(1, '#f2b27a');
  g.fillStyle = gr; g.fillRect(0, 0, 16, 512);
  const m = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), new THREE.MeshBasicMaterial({ map: tex(cv), side: THREE.BackSide, depthWrite: false, fog: false }));
  m.renderOrder = -10;
  // clouds: soft sprites
  const cc = canvas(256, 128), cg = cc.getContext('2d');
  for (let i = 0; i < 14; i++) {
    const x = rnd(50, 206), y = rnd(55, 85), r = rnd(22, 44);
    const rg = cg.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, 'rgba(255,255,255,.95)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    cg.fillStyle = rg; cg.beginPath(); cg.arc(x, y, r, 0, 7); cg.fill();
  }
  const cm = new THREE.SpriteMaterial({ map: tex(cc), transparent: true, depthWrite: false, fog: false, color: 0xfff4ea });
  for (const [x, y, z, s] of [[-120, 70, -220, 70], [60, 85, -240, 90], [190, 60, -150, 60], [-210, 55, -60, 60], [10, 110, -260, 70]]) {
    const sp = new THREE.Sprite(cm); sp.position.set(x, y, z); sp.scale.set(s, s / 2, 1); m.add(sp);
  }
  return m;
}

// ---------- the court paint (one big canvas over x -12..12, z -4..20) ----------
const GX0 = -12, GZ0 = -4, GS = 24, GP = 2048;
function courtTexture() {
  const cv = canvas(GP, GP), g = cv.getContext('2d');
  const P = (x) => (x - GX0) / GS * GP, Q = (z) => (z - GZ0) / GS * GP, M = (m) => m / GS * GP;
  // sidewalk: light warm concrete slabs
  g.fillStyle = '#c9c0b8'; g.fillRect(0, 0, GP, GP);
  g.strokeStyle = 'rgba(90,80,80,.25)'; g.lineWidth = 3;
  for (let v = 0; v <= GP; v += M(2)) { g.beginPath(); g.moveTo(v, 0); g.lineTo(v, GP); g.stroke(); g.beginPath(); g.moveTo(0, v); g.lineTo(GP, v); g.stroke(); }
  // asphalt
  const x0 = P(-9.2), x1 = P(9.2), z0 = Q(-2.6), z1 = Q(16.5);
  g.fillStyle = '#39365e'; g.fillRect(x0, z0, x1 - x0, z1 - z0);
  // speckles
  for (let i = 0; i < 26000; i++) {
    const x = rnd(x0, x1), z = rnd(z0, z1);
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.12)';
    g.fillRect(x, z, rnd(1, 3), rnd(1, 3));
  }
  // court colour: a deep blue-purple playing area with an orange edge band
  g.fillStyle = '#3d3f8f'; g.fillRect(P(-7.5), Q(0), M(15), M(14));
  g.fillStyle = 'rgba(255,125,34,.85)';
  g.fillRect(P(-8.1), Q(-0.6), M(0.6), M(15.2)); g.fillRect(P(7.5), Q(-0.6), M(0.6), M(15.2)); g.fillRect(P(-8.1), Q(-0.6), M(16.2), M(0.6));
  // key (paint): purple with a lighter inside
  g.fillStyle = '#5b2bb0'; g.fillRect(P(-1.8), Q(0), M(3.6), M(4.6));
  g.fillStyle = 'rgba(143,82,217,.35)'; g.fillRect(P(-1.5), Q(0.3), M(3.0), M(4.0));
  // the big centre logo: a gold ring with a fox face
  const cx = P(0), cz = Q(10.6);
  g.fillStyle = 'rgba(255,205,28,.92)'; g.beginPath(); g.arc(cx, cz, M(1.55), 0, 7); g.fill();
  g.fillStyle = '#3d3f8f'; g.beginPath(); g.arc(cx, cz, M(1.25), 0, 7); g.fill();
  g.save(); g.translate(cx, cz); g.scale(M(1) / 40, M(1) / 40);
  g.fillStyle = '#ff7d22';
  g.beginPath(); g.moveTo(-34, -30); g.lineTo(-14, -12); g.lineTo(14, -12); g.lineTo(34, -30); g.lineTo(32, 6); g.quadraticCurveTo(28, 34, 0, 38); g.quadraticCurveTo(-28, 34, -32, 6); g.closePath(); g.fill();
  g.fillStyle = '#fff1df'; g.beginPath(); g.moveTo(-24, 8); g.quadraticCurveTo(0, 16, 24, 8); g.quadraticCurveTo(18, 34, 0, 36); g.quadraticCurveTo(-18, 34, -24, 8); g.fill();
  g.fillStyle = '#1d1640'; g.beginPath(); g.arc(-11, 2, 4.5, 0, 7); g.arc(11, 2, 4.5, 0, 7); g.fill();
  g.beginPath(); g.ellipse(0, 16, 5, 3.5, 0, 0, 7); g.fill();
  g.restore();
  // lines
  const line = (w = 0.07, col = '#ffffff') => { g.strokeStyle = col; g.lineWidth = M(w); g.lineCap = 'round'; };
  line(); g.strokeRect(P(-7.5), Q(0), M(15), M(14));
  g.beginPath(); g.moveTo(P(-7.5), Q(14)); g.lineTo(P(7.5), Q(14)); g.stroke();
  g.beginPath(); g.arc(P(0), Q(14), M(1.8), Math.PI, 0); g.stroke();
  // key outline + free-throw circle
  line(0.07); g.strokeRect(P(-1.8), Q(0), M(3.6), M(4.6));
  line(0.07, '#ff9a3a'); g.beginPath(); g.arc(P(0), Q(4.6), M(1.8), 0, Math.PI); g.stroke();
  g.setLineDash([M(0.35), M(0.3)]); g.beginPath(); g.arc(P(0), Q(4.6), M(1.8), Math.PI, 0); g.stroke(); g.setLineDash([]);
  // the three-point arc (orange), radius 5.2 round the rim spot, straight down to the baseline at x ±4.9
  line(0.08, '#ff9a3a');
  const R3 = 5.2, rz = RIM.z, a = Math.acos(4.9 / R3), zc = rz + Math.sin(a) * R3;
  g.beginPath(); g.moveTo(P(-4.9), Q(0)); g.lineTo(P(-4.9), Q(zc)); g.arc(P(0), Q(rz), M(R3), Math.PI - a, a, true); g.lineTo(P(4.9), Q(0)); g.stroke();
  // restricted arc
  line(0.05); g.beginPath(); g.arc(P(0), Q(rz), M(1.0), Math.PI, 0, true); g.stroke();
  // little stars sprayed on the asphalt
  const star = (x, z, r, col) => { g.fillStyle = col; g.beginPath(); for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.45 : r, an = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(P(x) + Math.cos(an) * M(rr), Q(z) + Math.sin(an) * M(rr)); } g.closePath(); g.fill(); };
  star(-6.4, 12.6, 0.45, 'rgba(255,205,28,.8)'); star(6.5, 12.9, 0.35, 'rgba(255,125,34,.8)'); star(-6.6, 1.2, 0.3, 'rgba(255,205,28,.7)'); star(6.4, 2.2, 0.42, 'rgba(143,82,217,.9)');
  return cv;
}

// ---------- chain-link fence ----------
function fenceTexture() {
  const S = 64, cv = canvas(S, S), g = cv.getContext('2d');
  g.strokeStyle = 'rgba(205,210,225,1)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(S, S); g.moveTo(S, 0); g.lineTo(0, S); g.stroke();
  g.strokeStyle = 'rgba(120,125,145,1)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(0, 2); g.lineTo(S - 2, S); g.moveTo(S, 2); g.lineTo(2, S); g.stroke();
  return cv;
}

// ---------- graffiti wall ----------
function graffitiTexture() {
  const W = 2048, H = 384, cv = canvas(W, H), g = cv.getContext('2d');
  const draw = () => {
    g.fillStyle = '#b5654b'; g.fillRect(0, 0, W, H);
    // bricks
    for (let y = 0; y < H; y += 24) for (let x = (y / 24) % 2 ? -30 : 0; x < W; x += 60) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '90,30,20' : '255,220,200'},${rnd(0.05, 0.14)})`; g.fillRect(x + 2, y + 2, 56, 20);
    }
    // colour splashes
    const blob = (x, y, r, col) => { g.fillStyle = col; g.beginPath(); for (let i = 0; i < 18; i++) { const an = i / 18 * Math.PI * 2, rr = r * rnd(0.75, 1.15); g.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr * 0.7); } g.closePath(); g.fill(); };
    blob(300, 200, 190, '#8f52d9'); blob(1050, 190, 300, '#ffcd1c'); blob(1750, 210, 210, '#3cc6ef'); blob(620, 120, 90, '#ff4f9a'); blob(1450, 280, 110, '#5bd66b');
    // the big tag
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.font = '200px "Lilita One", "Arial Black", sans-serif';
    g.save(); g.translate(1050, 200); g.rotate(-0.04);
    g.lineWidth = 34; g.strokeStyle = '#1d1640'; g.strokeText('FOXINO', 0, 0);
    g.lineWidth = 16; g.strokeStyle = '#fff6d0'; g.strokeText('FOXINO', 0, 0);
    const tg = g.createLinearGradient(0, -90, 0, 90); tg.addColorStop(0, '#ffb347'); tg.addColorStop(1, '#ff6a1a');
    g.fillStyle = tg; g.fillText('FOXINO', 0, 0);
    g.restore();
    g.font = '96px "Lilita One", "Arial Black", sans-serif';
    g.save(); g.translate(300, 200); g.rotate(0.08); g.lineWidth = 18; g.strokeStyle = '#1d1640'; g.strokeText('1 ON 1', 0, 0); g.fillStyle = '#ffffff'; g.fillText('1 ON 1', 0, 0); g.restore();
    g.save(); g.translate(1750, 210); g.rotate(-0.07); g.lineWidth = 18; g.strokeStyle = '#1d1640'; g.strokeText('fugio', 0, 0); g.fillStyle = '#ffcd1c'; g.fillText('fugio', 0, 0); g.restore();
    // stars and drips
    for (const [x, y, r, c] of [[560, 300, 34, '#ffcd1c'], [1360, 70, 30, '#ffffff'], [1960, 90, 26, '#ff7d22'], [80, 90, 28, '#ffcd1c']]) {
      g.fillStyle = c; g.beginPath(); for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.45 : r, an = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); } g.closePath(); g.fill();
    }
    for (let i = 0; i < 30; i++) { g.fillStyle = ['#8f52d9', '#ffcd1c', '#3cc6ef', '#ff7d22'][i % 4]; const x = rnd(0, W), y = rnd(250, 330); g.fillRect(x, y, 6, rnd(20, 60)); }
  };
  draw();
  const t = tex(cv);
  if (document.fonts && document.fonts.load) document.fonts.load('200px "Lilita One"').then(() => { draw(); t.needsUpdate = true; }).catch(() => {});
  return t;
}

// ---------- building facade: a window grid ----------
function facadeTexture(base, win) {
  const W = 256, H = 512, cv = canvas(W, H), g = cv.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  for (let y = 24; y < H - 20; y += 52) for (let x = 20; x < W - 30; x += 56) {
    g.fillStyle = Math.random() < 0.3 ? '#ffe6a6' : win; g.fillRect(x, y, 34, 34);
    g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(x, y, 34, 5);
  }
  return tex(cv);
}

// ---------- the net: an open cone with a diamond mesh ----------
function netTexture() {
  const W = 256, H = 128, cv = canvas(W, H), g = cv.getContext('2d');
  g.strokeStyle = '#ffffff'; g.lineWidth = 5;
  const n = 12;
  for (let i = -n; i <= n * 2; i++) {
    g.beginPath(); g.moveTo(i * W / n, 0); g.lineTo(i * W / n + W / n * 3, H); g.stroke();
    g.beginPath(); g.moveTo(i * W / n, 0); g.lineTo(i * W / n - W / n * 3, H); g.stroke();
  }
  return tex(cv);
}

// ---------- the basketball: orange pebbled leather with black seams ----------
export function makeBasketball() {
  const W = 512, H = 256, cv = canvas(W, H), g = cv.getContext('2d');
  g.fillStyle = '#f06a1c'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 9000; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(120,40,0,.18)' : 'rgba(255,190,120,.16)'; g.fillRect(rnd(0, W), rnd(0, H), 2, 2); }
  g.strokeStyle = '#1b1210'; g.lineWidth = 7;
  g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();                 // equator
  for (const u of [0, 0.5, 1]) { g.beginPath(); g.moveTo(u * W, 0); g.lineTo(u * W, H); g.stroke(); } // one meridian circle
  for (const u0 of [0.25, 0.75]) {                                                    // the two curved seams
    g.beginPath();
    for (let y = 0; y <= H; y += 4) { const t = y / H; g.lineTo(u0 * W + Math.sin(t * Math.PI) * W * 0.12 * (u0 < 0.5 ? 1 : -1) * Math.cos((t - 0.5) * Math.PI) * 1.6, y); }
    g.stroke();
  }
  const m = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 28, 18), toon(0xffffff, { rough: 0.7, rim: 0.3, map: tex(cv) }));
  m.name = 'ball';
  return m;
}

export function makeCourt(scene) {
  const root = group(scene, [0, 0, 0], 'court');
  const sky = makeSky(); scene.add(sky);
  scene.fog = new THREE.Fog(0xf3cfa8, 45, 140);

  // ground
  const gt = tex(courtTexture(), { aniso: 16 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GS, GS), new THREE.MeshStandardMaterial({ map: gt, roughness: 0.92 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(GX0 + GS / 2, 0, GZ0 + GS / 2); root.add(ground);
  const far = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x8f8a92, roughness: 1 }));
  far.rotation.x = -Math.PI / 2; far.position.y = -0.02; root.add(far);

  // ---------- the hoop ----------
  const dark = toon(0x2c2650, { rough: 0.45, rim: 0.2 }), orangeM = toon(0xff6a1a, { rough: 0.35, rim: 0.3 });
  const hoop = group(root, [0, 0, 0], 'hoop');
  add(hoop, new THREE.CylinderGeometry(0.11, 0.14, 3.1, 14), dark, [0, 1.55, -1.1]);
  add(hoop, new THREE.BoxGeometry(0.12, 0.14, 1.6), dark, [0, 2.95, -0.3], null, [0.35, 0, 0]);
  add(hoop, new THREE.BoxGeometry(0.7, 0.9, 0.06), dark, [0, 2.55, BOARD_Z - 0.06]);
  add(hoop, new THREE.BoxGeometry(0.9, 0.5, 0.5), toon(0xffcd1c, { rough: 0.6 }), [0, 0.25, -1.1]); // the base weight
  const bc = canvas(512, 300), bg = bc.getContext('2d');
  bg.fillStyle = '#f4f7ff'; bg.fillRect(0, 0, 512, 300);
  const sh = bg.createLinearGradient(0, 0, 512, 300); sh.addColorStop(0, 'rgba(160,210,255,.35)'); sh.addColorStop(0.5, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(160,210,255,.25)');
  bg.fillStyle = sh; bg.fillRect(0, 0, 512, 300);
  bg.strokeStyle = '#ff6a1a'; bg.lineWidth = 16; bg.strokeRect(8, 8, 496, 284);
  bg.lineWidth = 12; bg.strokeRect(176, 130, 160, 120);
  bg.fillStyle = '#5b2bb0'; bg.font = '40px "Lilita One", "Arial Black", sans-serif'; bg.textAlign = 'center'; bg.fillText('fugio', 256, 75);
  const boardTex = tex(bc);
  if (document.fonts && document.fonts.load) document.fonts.load('40px "Lilita One"').then(() => { bg.fillStyle = '#f4f7ff'; bg.fillRect(180, 40, 152, 50); bg.fillStyle = '#5b2bb0'; bg.fillText('fugio', 256, 75); boardTex.needsUpdate = true; }).catch(() => {});
  const boardFront = new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.25, metalness: 0.05 });
  const edge = toon(0xdfe4f0, { rough: 0.4, rim: 0.2 });
  add(hoop, new THREE.BoxGeometry(1.8, 1.05, 0.05), [edge, edge, edge, edge, boardFront, edge], [0, 2.55, BOARD_Z]);
  // rim + bracket
  const rim = add(hoop, new THREE.TorusGeometry(RIM_R, 0.02, 10, 40), orangeM, [RIM.x, RIM.y, RIM.z], null, [Math.PI / 2, 0, 0]);
  add(hoop, new THREE.BoxGeometry(0.16, 0.04, RIM.z - RIM_R - BOARD_Z), orangeM, [0, RIM.y - 0.01, (BOARD_Z + RIM.z - RIM_R) / 2 + 0.02]);
  // net
  const netGeo = new THREE.CylinderGeometry(RIM_R * 0.98, RIM_R * 0.6, 0.42, 24, 6, true); netGeo.translate(0, -0.21, 0);
  const netBase = netGeo.attributes.position.array.slice();
  const net = new THREE.Mesh(netGeo, new THREE.MeshStandardMaterial({ map: netTexture(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8, color: 0xffffff }));
  net.material.map.colorSpace = THREE.NoColorSpace;
  // white lines on a transparent canvas: use the texture as alpha
  net.material.alphaMap = net.material.map; net.material.map = null;
  net.position.set(RIM.x, RIM.y - 0.005, RIM.z); hoop.add(net);
  const netState = { swish: 0, rim: 0 };

  // ---------- fences ----------
  const ft = tex(fenceTexture(), { repeat: [1, 1] });
  const fenceMat = (w, h) => { const t = ft.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(w / 0.22, h / 0.22); t.needsUpdate = true; return new THREE.MeshStandardMaterial({ alphaMap: t, color: 0xc9cfdd, transparent: true, alphaTest: 0.45, side: THREE.DoubleSide, metalness: 0.4, roughness: 0.5 }); };
  const postM = toon(0x9aa0b4, { rough: 0.4, rim: 0.1 });
  const fence = (x0, z0, x1, z1, h) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, h), fenceMat(len, h));
    m.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2); m.rotation.y = -Math.atan2(z1 - z0, x1 - x0); root.add(m);
    const n = Math.ceil(len / 3);
    for (let i = 0; i <= n; i++) { const t = i / n; add(root, new THREE.CylinderGeometry(0.05, 0.05, h + 0.1, 8), postM, [x0 + (x1 - x0) * t, (h + 0.1) / 2, z0 + (z1 - z0) * t]); }
    add(root, new THREE.CylinderGeometry(0.035, 0.035, len, 8), postM, [(x0 + x1) / 2, h, (z0 + z1) / 2], null, [0, -Math.atan2(z1 - z0, x1 - x0), Math.PI / 2]);
  };
  fence(-11, -3, 11, -3, 3.6);
  fence(-11, -3, -11, 17, 3.0);
  fence(11, -3, 11, 17, 3.0);

  // ---------- graffiti wall + city ----------
  const wallM = toon(0xffffff, { rough: 0.9, rim: 0.05, map: graffitiTexture() });
  const brick = toon(0xa35a42, { rough: 0.9, rim: 0.05 });
  add(root, new THREE.BoxGeometry(26, 4.6, 0.6), [brick, brick, brick, brick, wallM, brick], [0, 2.3, -5.2]);
  const cols = [['#6a4bb8', '#2b2160'], ['#e8894a', '#5a2a18'], ['#3a9bc4', '#163a55'], ['#e6c04a', '#5a4a14'], ['#c4567a', '#4a1830'], ['#8a8fa8', '#2a2c3a']];
  const blds = [[-22, -14, 9, 14], [-12, -16, 10, 22], [-1, -18, 11, 17], [11, -15, 9, 25], [21, -14, 10, 12], [-30, -6, 8, 10], [30, -4, 8, 16], [-28, 10, 9, 13], [29, 12, 9, 11]];
  blds.forEach(([x, z, w, h], i) => {
    const [b, wcol] = cols[i % cols.length];
    const ftx = facadeTexture(b, wcol); ftx.wrapS = ftx.wrapT = THREE.RepeatWrapping; ftx.repeat.set(Math.round(w / 4), Math.round(h / 8));
    const fm = toon(0xffffff, { rough: 0.85, rim: 0.12, map: ftx });
    const roof = toon(new THREE.Color(b).multiplyScalar(0.6).getHex(), { rough: 0.9, rim: 0 });
    add(root, new THREE.BoxGeometry(w, h, w * 0.9), [fm, fm, roof, roof, fm, fm], [x, h / 2, z]);
    // a water tower or an antenna on some roofs
    if (i % 3 === 0) { add(root, new THREE.CylinderGeometry(1, 1, 1.6, 12), toon(0x8a5a3a, { rough: 0.9 }), [x + 1, h + 1.6, z]); add(root, new THREE.ConeGeometry(1.15, 0.8, 12), toon(0x5a3a2a, { rough: 0.9 }), [x + 1, h + 2.8, z]); }
  });

  // ---------- trees and lamps ----------
  const trunk = toon(0x6b4a32, { rough: 0.9 }), leaf = toon(0x4caf50, { rough: 0.85, rim: 0.3 }), leaf2 = toon(0x7ccf4a, { rough: 0.85, rim: 0.3 });
  for (const [x, z] of [[-13.5, 2], [13.5, 4], [-13.5, 11], [13.8, 13], [-9.5, -4.2], [9.5, -4.2]]) {
    add(root, new THREE.CylinderGeometry(0.16, 0.22, 2.4, 8), trunk, [x, 1.2, z]);
    add(root, new THREE.SphereGeometry(1.3, 14, 10), leaf, [x, 3.0, z]);
    add(root, new THREE.SphereGeometry(0.95, 12, 8), leaf2, [x + 0.5, 3.7, z - 0.3]);
  }
  const lampM = new THREE.MeshBasicMaterial({ color: 0xfff1c8 });
  for (const [x, z] of [[-10.3, 6], [10.3, 6]]) {
    add(root, new THREE.CylinderGeometry(0.07, 0.1, 5, 8), dark, [x, 2.5, z]);
    add(root, new THREE.BoxGeometry(0.9, 0.12, 0.3), dark, [x - Math.sign(x) * 0.4, 5.0, z]);
    add(root, new THREE.BoxGeometry(0.5, 0.08, 0.22), lampM, [x - Math.sign(x) * 0.6, 4.93, z]);
  }

  // ---------- bleachers with a crowd ----------
  const metal = toon(0xb8bdd0, { rough: 0.4, rim: 0.1 }), seatM = toon(0xff7d22, { rough: 0.6 });
  const seats = [];
  const bleach = (cx, cz, rot, width, rows, density) => {
    const g2 = group(root, [cx, 0, cz]); g2.rotation.y = rot;
    g2.add(new THREE.Mesh(standGeometry(width, rows, 0.3), [metal, seatM]));
    const c = Math.cos(rot), s = Math.sin(rot);
    for (let i = 0; i < rows; i++) {
      const y = 0.3 + i * 0.42, back = -(i + 0.55) * 0.85;
      for (let x = -width / 2 + 0.5; x < width / 2 - 0.4; x += 0.7) {
        if (Math.random() > density) continue;
        const lx = x + (Math.random() - 0.5) * 0.12, lz = back;
        seats.push({ x: cx + c * lx + s * lz, y: y + 0.02, z: cz - s * lx + c * lz, rot });
      }
    }
  };
  bleach(-9.4, 7, Math.PI / 2, 8, 3, 0.8);
  bleach(9.4, 7, -Math.PI / 2, 8, 3, 0.8);
  // a few fans standing behind the baseline fence and by the wall
  for (let x = -8; x <= 8; x += 1.1) if (Math.abs(x) > 2.2 && Math.random() < 0.65) seats.push({ x: x + rnd(-0.2, 0.2), y: 0, z: -4.2 + rnd(-0.3, 0.3), rot: 0 });
  const crowd = makeCrowd(seats, [0, 6]);
  crowd.mesh.scale.set(1, 1, 1);
  root.add(crowd.mesh);

  // ---------- update: the net swishes, the crowd moves ----------
  const pos = netGeo.attributes.position;
  function update(dt, t) {
    crowd.uniforms.uTime.value = t;
    netState.swish = Math.max(0, netState.swish - dt * 1.6);
    netState.rim = Math.max(0, netState.rim - dt * 2.5);
    const sw = netState.swish, rr = netState.rim;
    for (let i = 0; i < pos.count; i++) {
      const bx = netBase[i * 3], by = netBase[i * 3 + 1], bz = netBase[i * 3 + 2];
      const d = -by / 0.42; // 0 at the rim, 1 at the bottom
      const k = 1 + sw * 0.35 * Math.sin(d * Math.PI) * Math.sin(t * 22 - d * 6) + sw * 0.25 * d;
      const sway = (0.02 * Math.sin(t * 1.3 + d * 2) + rr * 0.06 * Math.sin(t * 30)) * d;
      pos.setXYZ(i, bx * (1 + sw * 0.15 * d) + sway, by * k, bz * (1 + sw * 0.15 * d) + sway * 0.6);
    }
    pos.needsUpdate = true;
    rim.position.y = RIM.y + rr * 0.015 * Math.sin(t * 40);
  }
  return { root, sky, crowd, net, update, swish: () => { netState.swish = 1; }, rimHit: () => { netState.rim = 1; } };
}
