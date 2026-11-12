// Foxino as the rigged Meshy model (models/foxino.glb, made 2026-11-12), with a jersey and shorts, driven by the
// same poses as the code-built Foxino. makeFoxino3D(opt) returns the code rig's object (root, J, pose, apply, update,
// face, foot …) so a game can swap it in without changing its animation code: the code rig stays as an invisible
// "puppet", and every update() copies its joints onto the Meshy skeleton:
//   hips, spine, neck, head: the same rotation away from the rest pose;  arms, forearms, thighs, shins, feet: point
//   the bone the same way as the puppet's limb (the Meshy rest pose is an A-pose, the puppet's arms hang down).
// The jersey and shorts are "shells": the model's own triangles of the chest/belly (and hips/thighs), chosen by their
// skin weights, pushed out a little and given a kit texture; they share the skeleton, so they bend with him.
// Rivals: the fur texture is recoloured (purple → fur, orange → accent).   Call `await loadFoxino3D()` first.
import * as THREE from './lib/three.module.min.js';
import { GLTFLoader } from './lib/GLTFLoader.js';
import { makeFoxino, KITS, FURS, blankPose, POSES } from './foxino.js';

const URL_DEFAULT = '/olympics/common/models/foxino.glb?v=1';
let SRC = null;

export async function loadFoxino3D(url = URL_DEFAULT, onProgress) {
  if (SRC) return SRC;
  const g = await new GLTFLoader().loadAsync(url, onProgress);
  let mesh = null;
  g.scene.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
  g.scene.updateMatrixWorld(true);
  SRC = { scene: g.scene, mesh, shell: null, maps: new Map() };
  fixTail();
  return SRC;
}
export const foxino3DReady = () => !!SRC;

// Meshy bound the big tail to the right thigh and the right arm, so it swung with them. Every vertex behind the body
// (further back than the hips, beyond the thighs and arms) is moved onto the Hips bone: the tail moves with his body.
const isBehind = (z, hipsZ, H) => z < hipsZ - 0.09 * H;
function fixTail() {
  const mesh = SRC.mesh, geo = mesh.geometry, pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const names = mesh.skeleton.bones.map((b) => b.name), hips = names.indexOf('Hips');
  const keep = new Set(['Head', 'neck', 'head_end', 'headfront']);
  const hz = mesh.skeleton.bones[hips].getWorldPosition(new THREE.Vector3()).z;
  const v = new THREE.Vector3();
  let y0 = 1e9, y1 = -1e9;
  const P = [];
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); mesh.applyBoneTransform(i, v); v.applyMatrix4(mesh.matrixWorld); P.push(v.y, v.z); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
  let n = 0;
  for (let i = 0; i < pos.count; i++) {
    let b = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; b = si.getComponent(i, k); } }
    if (keep.has(names[b]) || !isBehind(P[i * 2 + 1], hz, y1 - y0)) continue;
    si.setXYZW(i, hips, 0, 0, 0); sw.setXYZW(i, 1, 0, 0, 0); n++;
  }
  si.needsUpdate = sw.needsUpdate = true;
  SRC.tailVerts = n;
}

// a deep copy whose skinned mesh uses the copy's own bones
function cloneSkinned(src) {
  const c = src.clone(true);
  const bones = {};
  c.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  c.traverse((o) => {
    if (o.isSkinnedMesh) {
      const sk = o.skeleton;
      o.bind(new THREE.Skeleton(sk.bones.map((b) => bones[b.name]), sk.boneInverses.map((m) => m.clone())), o.bindMatrix.clone());
    }
  });
  return c;
}

// ---------- the fur recolour for the rivals ----------
const _c = new THREE.Color();
function hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 1e-6) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h /= 6; if (h < 0) h += 1; }
  return [h, mx ? d / mx : 0, mx];
}
function rgb(h, s, v) { _c.setHSL(0, 0, 0); const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s); return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][((i % 6) + 6) % 6]; }
function furMap(key) {
  if (!key || key === 'foxino') return null;
  if (SRC.maps.has(key)) return SRC.maps.get(key);
  const base = SRC.mesh.material.map, img = base.image, W = img.width, H = img.height;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
  const id = g.getImageData(0, 0, W, H), d = id.data;
  const F = FURS[key], fur = hsv(...new THREE.Color(F.fur).toArray()), acc = hsv(...new THREE.Color(F.orange).toArray());
  // Foxino's own purple and orange (sRGB, measured on the texture)
  const P = [0.78, 0.6, 0.6], O = [0.07, 0.8, 0.95];
  for (let i = 0; i < d.length; i += 4) {
    const [h, s, v] = hsv(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255);
    let T = null, R = null;
    if (s > 0.18 && h > 0.68 && h < 0.92) { T = fur; R = P; }
    else if (s > 0.3 && (h < 0.13 || h > 0.97)) { T = acc; R = O; }
    if (!T) continue;
    const nv = Math.min(1, v * T[2] / R[2]), ns = Math.min(1, s * T[1] / R[1]);
    const [r, gg, b] = rgb(T[0], ns, nv);
    d[i] = r * 255; d[i + 1] = gg * 255; d[i + 2] = b * 255;
  }
  g.putImageData(id, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.flipY = base.flipY; t.colorSpace = base.colorSpace; t.wrapS = base.wrapS; t.wrapT = base.wrapT; t.anisotropy = 4; t.channel = base.channel;
  SRC.maps.set(key, t);
  return t;
}

// ---------- the kit (built once from the source mesh) ----------
// Clean cloth tubes fitted round the body: for each height ring and each angle, the radius is a high percentile of the
// body's own vertices in that slice (so fur tips stay inside), plus a margin. Every cloth vertex copies the skin weights
// of the nearest body vertex, so the cloth bends with him. Jersey = one tube (waist → armpits); shorts = a waist tube
// and a tube round each thigh.
function buildShells() {
  if (SRC.shell) return SRC.shell;
  const mesh = SRC.mesh, geo = mesh.geometry, pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const names = mesh.skeleton.bones.map((b) => b.name);
  const n = pos.count, P = new Float32Array(n * 3), dom = new Array(n), v = new THREE.Vector3();
  let y0 = 1e9, y1 = -1e9;
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i); mesh.applyBoneTransform(i, v); v.applyMatrix4(mesh.matrixWorld);
    P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z; y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
    let best = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; best = si.getComponent(i, k); } }
    dom[i] = names[best];
  }
  const Hh = y1 - y0, B = {};
  for (const b of mesh.skeleton.bones) B[b.name] = b.getWorldPosition(new THREE.Vector3());
  const hipY = B.Hips.y, armY = (B.LeftArm.y + B.RightArm.y) / 2, kneeY = (B.LeftLeg.y + B.RightLeg.y) / 2;
  const TRUNK = new Set(['Hips', 'Spine02', 'Spine01', 'Spine', 'LeftShoulder', 'RightShoulder', 'LeftUpLeg', 'RightUpLeg']);
  const ARMS = new Set(['LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand']);
  // the tail (for the kit): well behind the hips; his bottom stays part of the body so the shorts cover it
  const behind = (i) => P[i * 3 + 2] < B.Hips.z - 0.15 * Hh;
  const trunk = [], legL = [], legR = [];
  for (let i = 0; i < n; i++) {
    if (behind(i) || ARMS.has(dom[i]) || !TRUNK.has(dom[i])) continue;
    trunk.push(i);
    if (dom[i] === 'LeftUpLeg') legL.push(i); else if (dom[i] === 'RightUpLeg') legR.push(i);
  }
  const waist = hipY + (armY - hipY) * 0.12, crotch = hipY - 0.045 * Hh, thigh = kneeY + (hipY - kneeY) * 0.45;
  const SEG = 32;
  // one tube: verts = candidate body vertices, rings from yA to yB; centre per ring = middle of that slice
  function tube(verts, yA, yB, rings, margin, pct, exclude) {
    const slab = (yB - yA) / rings;
    const R = [], C = [];
    for (let k = 0; k <= rings; k++) {
      const y = yA + (yB - yA) * (k / rings);
      const sl = verts.filter((i) => Math.abs(P[i * 3 + 1] - y) < slab * 0.75 && !(exclude && exclude(i, y)));
      let cx = 0, cz = 0; for (const i of sl) { cx += P[i * 3]; cz += P[i * 3 + 2]; }
      cx = sl.length ? cx / sl.length : (C[k - 1] ? C[k - 1][0] : 0); cz = sl.length ? cz / sl.length : (C[k - 1] ? C[k - 1][1] : 0);
      // the slice's outline: per angle sector, a high percentile of the distance
      const sect = Array.from({ length: SEG }, () => []);
      for (const i of sl) { const dx = P[i * 3] - cx, dz = P[i * 3 + 2] - cz; const a = Math.atan2(dx, dz); sect[Math.floor(((a + Math.PI) / (2 * Math.PI)) * SEG) % SEG].push(Math.hypot(dx, dz)); }
      const r = sect.map((d) => { if (!d.length) return NaN; d.sort((p, q) => p - q); return d[Math.min(d.length - 1, Math.floor(d.length * pct))]; });
      R.push(r); C.push([cx, cz]);
    }
    // fill empty sectors and smooth (round the ring, then between rings)
    for (const r of R) { const ok = r.filter((x) => !isNaN(x)); const avg = ok.length ? ok.reduce((p, q) => p + q, 0) / ok.length : 0.1 * Hh; for (let j = 0; j < SEG; j++) if (isNaN(r[j])) r[j] = avg; }
    for (let pass = 0; pass < 3; pass++) for (const r of R) { const c = r.slice(); for (let j = 0; j < SEG; j++) r[j] = Math.max(c[j], (c[(j + SEG - 1) % SEG] + 2 * c[j] + c[(j + 1) % SEG]) / 4 * 0.98); }
    for (let pass = 0; pass < 2; pass++) for (let k = 1; k < R.length - 1; k++) for (let j = 0; j < SEG; j++) R[k][j] = Math.max(R[k][j], (R[k - 1][j] + R[k + 1][j]) / 2 * 0.97);
    const out = [], uv = [], ring = [];
    for (let k = 0; k <= rings; k++) {
      const y = yA + (yB - yA) * (k / rings);
      for (let j = 0; j <= SEG; j++) {
        const jj = j % SEG, a = -Math.PI + (j + 0.5) / SEG * 2 * Math.PI, r = R[k][jj] + (typeof margin === 'function' ? margin(k / rings) : margin) * Hh;
        out.push(C[k][0] + Math.sin(a) * r, y, C[k][1] + Math.cos(a) * r);
        uv.push(j / SEG, k / rings);
      }
    }
    return { out, uv, rings };
  }
  // nearest body vertex (for the skin weights)
  const pool = trunk;
  function weightsFor(x, y, z, prefer) {
    let best = -1, bd = 1e9;
    for (const i of prefer || pool) { const dx = P[i * 3] - x, dy = P[i * 3 + 1] - y, dz = P[i * 3 + 2] - z, d = dx * dx + dy * dy * 1.5 + dz * dz; if (d < bd) { bd = d; best = i; } }
    return best;
  }
  function geometryOf(parts) {
    const posA = [], uvA = [], siA = [], swA = [], idxA = [];
    for (const { t, prefer, uvShift } of parts) {
      const base = posA.length / 3;
      for (let i = 0; i < t.out.length / 3; i++) {
        const x = t.out[i * 3], y = t.out[i * 3 + 1], z = t.out[i * 3 + 2];
        posA.push(x, y, z); uvA.push(t.uv[i * 2] + (uvShift || 0), t.uv[i * 2 + 1]);
        const b = weightsFor(x, y, z, prefer);
        siA.push(si.getX(b), si.getY(b), si.getZ(b), si.getW(b)); swA.push(sw.getX(b), sw.getY(b), sw.getZ(b), sw.getW(b));
      }
      const COLS = t.cols || SEG, W = COLS + 1;
      for (let k = 0; k < t.rings; k++) for (let j = 0; j < COLS; j++) {
        const a = base + k * W + j, b = a + 1, c = a + W, d = c + 1;
        idxA.push(a, c, b, b, c, d);
      }
    }
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute('position', new THREE.Float32BufferAttribute(posA, 3));
    g2.setAttribute('uv', new THREE.Float32BufferAttribute(uvA, 2));
    g2.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(siA, 4));
    g2.setAttribute('skinWeight', new THREE.Float32BufferAttribute(swA, 4));
    g2.setIndex(idxA); g2.computeVertexNormals();
    return g2;
  }
  // the jersey stops below the armpits at the sides and goes a bit higher in front and back (straps feel)
  const shirtTube = tube(trunk, waist - 0.035 * Hh, armY - 0.012 * Hh, 9, (f) => 0.008 + 0.014 * Math.pow(1 - f, 2), 0.94, (i, y) => y > armY - 0.06 * Hh && Math.abs(P[i * 3] - B.Spine01.x) > Math.abs(B.LeftArm.x - B.Spine01.x) * 0.92);
  const waistTube = tube(trunk, crotch - 0.01 * Hh, waist + 0.005 * Hh, 4, 0.005, 0.94);
  const lTube = tube(legL, thigh, crotch + 0.02 * Hh, 4, 0.007, 0.93);
  const rTube = tube(legR, thigh, crotch + 0.02 * Hh, 4, 0.007, 0.93);
  // which body vertices the kit covers (no fur strands grow there)
  const cm = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (behind(i) || ARMS.has(dom[i])) continue;
    const y = P[i * 3 + 1];
    if ((TRUNK.has(dom[i]) && y > thigh + 0.02 * Hh && y < armY - 0.035 * Hh) || ((dom[i] === 'LeftUpLeg' || dom[i] === 'RightUpLeg') && y > thigh + 0.02 * Hh)) cm[i] = 1;
  }
  geo.setAttribute('clothM', new THREE.BufferAttribute(cm, 1));
  // shoulder straps: a band from the jersey's top in front, over the shoulder, to its top at the back. The band follows
  // the body: for each angle round a centre at the jersey's top, the distance to the body's surface in that direction.
  const NECKSET = new Set([...TRUNK, 'neck']);
  function strap(side) {
    const xs = B.Spine01.x + side * Math.abs(B.LeftArm.x - B.Spine01.x) * 0.52, yc = armY - 0.012 * Hh, half = 0.026 * Hh;
    const cand = [];
    for (let i = 0; i < n; i++) if (!behind(i) && NECKSET.has(dom[i]) && Math.abs(P[i * 3] - xs) < half * 1.4 && P[i * 3 + 1] > yc - 0.09 * Hh) cand.push(i);
    let cz = 0, cn = 0; for (const i of cand) if (Math.abs(P[i * 3 + 1] - yc) < 0.04 * Hh) { cz += P[i * 3 + 2]; cn++; }
    cz = cn ? cz / cn : B.Spine01.z;
    const STEPS = 16, a0 = -0.3, a1 = Math.PI + 0.3, R = [];   // (radius: 92nd percentile + a small margin)
    for (let k = 0; k <= STEPS; k++) {
      const a = a0 + (a1 - a0) * (k / STEPS), da = (a1 - a0) / STEPS;
      const d = [];
      for (const i of cand) { const dy = P[i * 3 + 1] - yc, dz = P[i * 3 + 2] - cz; let ang = Math.atan2(dy, dz); if (ang < -Math.PI / 2) ang += 2 * Math.PI; if (Math.abs(ang - a) < da * 0.8) d.push(Math.hypot(dy, dz)); }
      d.sort((p, q) => p - q); R.push(d.length ? d[Math.floor(d.length * 0.92)] : NaN);
    }
    const ok = R.filter((x) => !isNaN(x)), avg = ok.length ? ok.reduce((p, q) => p + q, 0) / ok.length : 0.08 * Hh;
    for (let k = 0; k <= STEPS; k++) if (isNaN(R[k])) R[k] = avg;
    for (let pass = 0; pass < 2; pass++) { const c = R.slice(); for (let k = 1; k < STEPS; k++) R[k] = Math.max(c[k], (c[k - 1] + 2 * c[k] + c[k + 1]) / 4); }
    const out = [], uv = [];
    for (let k = 0; k <= STEPS; k++) {
      const a = a0 + (a1 - a0) * (k / STEPS), r = R[k] + 0.009 * Hh;
      for (const e of [-1, 1]) { out.push(xs + e * half, yc + Math.sin(a) * r, cz + Math.cos(a) * r); uv.push((e + 1) / 2, k / STEPS); }
    }
    return { t: { out, uv, rings: STEPS, cols: 1 }, prefer: cand.length ? cand : undefined };
  }
  const sL = strap(1), sR = strap(-1);
  SRC.shell = {
    straps: geometryOf([sL, sR]),
    shirt: geometryOf([{ t: shirtTube }]),
    pants: geometryOf([{ t: waistTube }, { t: lTube, prefer: legL }, { t: rTube, prefer: legR }]),
    height: Hh,
  };
  return SRC.shell;
}

const hx = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
function kitTextures(K) {
  const key = JSON.stringify(K);
  if (SRC.maps.has(key)) return SRC.maps.get(key);
  const W = 1024, H = 512;
  const shirtCv = document.createElement('canvas'); shirtCv.width = W; shirtCv.height = H;
  const pantsCv = document.createElement('canvas'); pantsCv.width = 512; pantsCv.height = 256;
  const strapCv = document.createElement('canvas'); strapCv.width = 64; strapCv.height = 256;
  // a breathable sports mesh: tiny dots, soft vertical folds
  const fabric = (g, w, h, seed = 1) => {
    g.fillStyle = 'rgba(0,0,0,.07)';
    for (let y = 3; y < h; y += 7) for (let x = (y / 7) % 2 ? 3 : 6.5; x < w; x += 7) { g.beginPath(); g.arc(x, y, 1.3, 0, 7); g.fill(); }
    let r = seed * 9301 + 49297;
    const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < w / 40; i++) {
      const x = rnd() * w, ww = 18 + rnd() * 40, gr = g.createLinearGradient(x - ww, 0, x + ww, 0);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.45, `rgba(255,255,255,${0.05 + rnd() * 0.05})`); gr.addColorStop(0.55, `rgba(0,0,0,${0.05 + rnd() * 0.06})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - ww, 0, ww * 2, h);
    }
  };
  const draw = () => {
    const g = shirtCv.getContext('2d');
    g.fillStyle = hx(K.jersey); g.fillRect(0, 0, W, H);
    const sh = g.createLinearGradient(0, 0, 0, H); sh.addColorStop(0, 'rgba(255,255,255,.12)'); sh.addColorStop(0.7, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(90,40,0,.14)'); g.fillStyle = sh; g.fillRect(0, 0, W, H);
    fabric(g, W, H, 3);
    // side panels (his sides are u = 0.25 and 0.75) with piping
    for (const u of [0.25, 0.75]) {
      g.fillStyle = hx(K.trim); g.fillRect(u * W - 26, 0, 52, H);
      g.fillStyle = hx(K.accent); g.fillRect(u * W - 33, 0, 7, H); g.fillRect(u * W + 26, 0, 7, H);
      g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(u * W - 26, 0, 3, H);
    }
    // the neckline / armhole trim at the top and the hem, each with a thin accent line
    g.fillStyle = hx(K.trim); g.fillRect(0, 0, W, 30); g.fillRect(0, H - 36, W, 36);
    g.fillStyle = hx(K.accent); g.fillRect(0, 30, W, 6); g.fillRect(0, H - 42, W, 6);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    const font = (px) => `${px}px "Lilita One", "Arial Black", sans-serif`;
    const L = hx(K.light ?? 0xffffff);
    // front (u = 0.5): the number, and a small crest on his left chest
    g.font = font(180); g.lineWidth = 22; g.strokeStyle = hx(K.accent); g.strokeText(String(K.number), W * 0.5, H * 0.52);
    g.lineWidth = 11; g.strokeStyle = L; g.strokeText(String(K.number), W * 0.5, H * 0.52);
    g.fillStyle = hx(K.trim); g.fillText(String(K.number), W * 0.5, H * 0.52);
    const cx = W * 0.585, cy = H * 0.22;
    g.fillStyle = hx(K.trim); g.beginPath(); g.arc(cx, cy, 30, 0, 7); g.fill();
    g.fillStyle = hx(K.accent); g.beginPath(); g.arc(cx, cy, 22, 0, 7); g.fill();
    g.font = font(30); g.fillStyle = L; g.fillText(K.name[0], cx, cy + 2);
    // back (u = 0 and 1, drawn on both edges): name and a big number
    for (const x of [0, W]) {
      g.font = font(K.name.length > 7 ? 56 : 68); g.lineWidth = 10; g.strokeStyle = L; g.strokeText(K.name, x, H * 0.22); g.fillStyle = hx(K.trim); g.fillText(K.name, x, H * 0.22);
      g.font = font(230); g.lineWidth = 24; g.strokeStyle = hx(K.accent); g.strokeText(String(K.number), x, H * 0.6);
      g.lineWidth = 11; g.strokeStyle = L; g.strokeText(String(K.number), x, H * 0.6); g.fillStyle = hx(K.trim); g.fillText(String(K.number), x, H * 0.6);
    }
    // straps: jersey colour with trim on both edges
    const st = strapCv.getContext('2d');
    st.fillStyle = hx(K.jersey); st.fillRect(0, 0, 64, 256); fabric(st, 64, 256, 7);
    st.fillStyle = hx(K.trim); st.fillRect(0, 0, 13, 256); st.fillRect(51, 0, 13, 256);
    st.fillStyle = hx(K.accent); st.fillRect(13, 0, 3, 256); st.fillRect(48, 0, 3, 256);
    // shorts: mesh, waistband with a drawstring, side stripes, hem trim
    const p = pantsCv.getContext('2d');
    p.fillStyle = hx(K.shorts); p.fillRect(0, 0, 512, 256);
    const ps = p.createLinearGradient(0, 0, 0, 256); ps.addColorStop(0, 'rgba(255,255,255,.08)'); ps.addColorStop(1, 'rgba(0,0,0,.14)'); p.fillStyle = ps; p.fillRect(0, 0, 512, 256);
    fabric(p, 512, 256, 5);
    p.fillStyle = hx(K.trim); p.fillRect(0, 0, 512, 34); for (const u of [0.25, 0.75]) p.fillRect(u * 512 - 11, 0, 22, 256);
    p.fillStyle = hx(K.accent); for (const u of [0.25, 0.75]) { p.fillRect(u * 512 - 15, 0, 4, 256); p.fillRect(u * 512 + 11, 0, 4, 256); }
    p.fillStyle = L; p.fillRect(250, 34, 4, 26); p.fillRect(258, 34, 4, 30);
    p.fillStyle = hx(K.trim); p.fillRect(0, 232, 512, 24);
  };
  draw();
  const mk = (cv) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const out = { shirt: mk(shirtCv), pants: mk(pantsCv), straps: mk(strapCv) };
  if (document.fonts && document.fonts.load) document.fonts.load('66px "Lilita One"').then(() => { draw(); out.shirt.needsUpdate = true; }).catch(() => {});
  SRC.maps.set(key, out);
  return out;
}

// ---------- eyes: blink and look around (a shader on the painted eyes) ----------
// Measured on the texture (models/foxino.glb, uv = image x/W, y/H): each eye's white is an ellipse (centre, semi-axes,
// angle), the iris a circle. The shader erases the painted iris, draws it again moved by the gaze, and lowers a lid of
// fur colour from the top of the eye. Which way is "up" and "his left" on each eye's patch of the texture is found from
// the mesh (the texture is a patchwork, each patch turned its own way).
const EYES = [
  { iris: [0.17017, 0.41483], ir: 0.014451, c: [0.17867, 0.40838], a: 0.025605, b: 0.019595, ang: -0.78697 },
  { iris: [0.36325, 0.88338], ir: 0.013096, c: [0.37190, 0.88781], a: 0.022152, b: 0.018603, ang: 0.62241 },
];
function buildEyes() {
  if (SRC.eyes) return SRC.eyes;
  const mesh = SRC.mesh, geo = mesh.geometry, uv = geo.attributes.uv, pos = geo.attributes.position, idx = geo.index;
  const P = (i, out) => { out.fromBufferAttribute(pos, i); mesh.applyBoneTransform(i, out); return out.applyMatrix4(mesh.matrixWorld); };
  const out = EYES.map((e) => {
    const [px, py] = e.iris;
    let best = null;
    for (let t = 0; t < idx.count && !best; t += 3) {
      const i0 = idx.getX(t), i1 = idx.getX(t + 1), i2 = idx.getX(t + 2);
      const u0 = uv.getX(i0), v0 = uv.getY(i0), u1 = uv.getX(i1) - u0, v1 = uv.getY(i1) - v0, u2 = uv.getX(i2) - u0, v2 = uv.getY(i2) - v0;
      const det = u1 * v2 - u2 * v1; if (Math.abs(det) < 1e-12) continue;
      const qx = px - u0, qy = py - v0, b1 = (qx * v2 - u2 * qy) / det, b2 = (u1 * qy - qx * v1) / det;
      if (b1 < -0.01 || b2 < -0.01 || b1 + b2 > 1.01) continue;
      best = { i0, i1, i2, u1, v1, u2, v2, det };
    }
    const r = { up: [0, -1], right: [1, 0] };
    if (best) {
      const A = P(best.i0, new THREE.Vector3()), E1 = P(best.i1, new THREE.Vector3()).sub(A), E2 = P(best.i2, new THREE.Vector3()).sub(A);
      // J = E * inv(T): d(position)/d(uv)
      const it = [best.v2 / best.det, -best.u2 / best.det, -best.v1 / best.det, best.u1 / best.det];   // inv of [[u1,u2],[v1,v2]]
      const Ju = E1.clone().multiplyScalar(it[0]).addScaledVector(E2, it[2]), Jv = E1.clone().multiplyScalar(it[1]).addScaledVector(E2, it[3]);
      const solve = (X) => {   // least squares: J w = X
        const a = Ju.dot(Ju), b = Ju.dot(Jv), c = Jv.dot(Jv), x = Ju.dot(X), y = Jv.dot(X), d = a * c - b * b;
        const w = [(c * x - b * y) / d, (a * y - b * x) / d], l = Math.hypot(w[0], w[1]) || 1; return [w[0] / l, w[1] / l];
      };
      r.up = solve(new THREE.Vector3(0, 1, 0)); r.right = solve(new THREE.Vector3(1, 0, 0));
    }
    // half-height of the eye's white along "up"
    const ca = Math.cos(e.ang), sa = Math.sin(e.ang);
    const h = Math.hypot(e.a * (ca * r.up[0] + sa * r.up[1]), e.b * (-sa * r.up[0] + ca * r.up[1]));
    return { ...e, ...r, h };
  });
  SRC.eyes = out;
  return out;
}
// the lid colour: around the eyes, the texture samples closest to the fox's fur colour (sRGB 0–1), averaged
function lidColor(tex, fur) {
  const img = tex.image, W = img.width, H = img.height;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
  const S = [];
  for (const e of buildEyes()) for (let i = 0; i < 48; i++) for (const rr of [1.3, 1.5, 1.75]) {
    const a = (i / 48) * Math.PI * 2, ca = Math.cos(e.ang), sa = Math.sin(e.ang), x = Math.cos(a) * e.a * rr, y = Math.sin(a) * e.b * rr;
    const u = e.c[0] + ca * x - sa * y, v = e.c[1] + sa * x + ca * y;
    const d = g.getImageData(Math.floor(u * W), Math.floor(v * H), 1, 1).data;
    S.push([d[0] / 255, d[1] / 255, d[2] / 255]);
  }
  S.sort((p, q) => Math.hypot(p[0] - fur[0], p[1] - fur[1], p[2] - fur[2]) - Math.hypot(q[0] - fur[0], q[1] - fur[1], q[2] - fur[2]));
  const top = S.slice(0, 12), m = [0, 1, 2].map((k) => top.reduce((s, c) => s + c[k], 0) / top.length);
  return new THREE.Color().setRGB(m[0] * 0.92, m[1] * 0.92, m[2] * 0.92, THREE.SRGBColorSpace);
}
const EYE_GLSL = `
uniform vec2 uEyeC[2]; uniform vec2 uEyeAB[2]; uniform float uEyeAng[2]; uniform vec2 uIrisC[2]; uniform float uIrisR[2];
uniform vec2 uUpUV[2]; uniform vec2 uRightUV[2]; uniform float uEyeH[2];
float eyeR(int k, vec2 uv) {
  vec2 d = uv - uEyeC[k]; float ca = cos(uEyeAng[k]), sa = sin(uEyeAng[k]);
  return length(vec2((ca * d.x + sa * d.y) / uEyeAB[k].x, (-sa * d.x + ca * d.y) / uEyeAB[k].y));
}`;
const EYE_FRAG = `
#ifdef USE_MAP
for (int k = 0; k < 2; k++) {
  float r = eyeR(k, vMapUv);
  if (r < 1.14) {
    float inside = 1.0 - smoothstep(0.9, 1.04, r);
    vec3 col = diffuseColor.rgb;
    float ir = uIrisR[k];
    col = mix(col, uWhite, (1.0 - smoothstep(ir * 1.04, ir * 1.2, length(vMapUv - uIrisC[k]))) * inside);
    vec2 src = vMapUv - (uGaze.x * uRightUV[k] + uGaze.y * uUpUV[k]) * ir * 0.62;
    float m = (1.0 - smoothstep(ir * 0.98, ir * 1.1, length(src - uIrisC[k]))) * inside;
    col = mix(col, texture2D(map, src).rgb, m);
    float up = dot(vMapUv - uEyeC[k], uUpUV[k]) / uEyeH[k];
    float edge = mix(1.12, -1.3, uBlink);
    float near = 1.0 - smoothstep(mix(1.0, 1.1, uBlink), mix(1.14, 1.24, uBlink), r);
    float lidM = smoothstep(edge - 0.05, edge + 0.03, up) * near;
    col = mix(col, uLid * mix(0.78, 1.0, smoothstep(edge, edge + 0.6, up)), lidM);
    float lashY = max(edge, -0.62);
    col = mix(col, uLid * 0.25, (1.0 - smoothstep(0.0, 0.1, abs(up - lashY))) * step(0.03, uBlink) * near * 0.9);
    diffuseColor.rgb = col;
  }
}
#endif`;
function eyeUniforms() {
  const E = buildEyes();
  return {
    uEyeC: { value: E.map((e) => new THREE.Vector2(...e.c)) }, uEyeAB: { value: E.map((e) => new THREE.Vector2(e.a, e.b)) },
    uEyeAng: { value: E.map((e) => e.ang) }, uIrisC: { value: E.map((e) => new THREE.Vector2(...e.iris)) }, uIrisR: { value: E.map((e) => e.ir) },
    uUpUV: { value: E.map((e) => new THREE.Vector2(...e.up)) }, uRightUV: { value: E.map((e) => new THREE.Vector2(...e.right)) }, uEyeH: { value: E.map((e) => e.h) },
  };
}

// ---------- fur: soft rim light on the body, and short strand shells ----------
// smooth "fur direction" normals (Meshy's own normals follow the spiky fur triangles): vertices at the same place share
// one normal, then two smoothing passes over the triangle neighbours
function furNormals() {
  if (SRC.furN) return SRC.furN;
  const geo = SRC.mesh.geometry, pos = geo.attributes.position, idx = geo.index, n = pos.count;
  const key = new Map(), grp = new Int32Array(n);
  for (let i = 0; i < n; i++) { const k = `${Math.round(pos.getX(i) * 2e3)},${Math.round(pos.getY(i) * 2e3)},${Math.round(pos.getZ(i) * 2e3)}`; if (!key.has(k)) key.set(k, key.size); grp[i] = key.get(k); }
  const G = key.size, N = new Float32Array(G * 3), nb = Array.from({ length: G }, () => new Set());
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < idx.count; t += 3) {
    const i0 = idx.getX(t), i1 = idx.getX(t + 1), i2 = idx.getX(t + 2);
    a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1).sub(a); c.fromBufferAttribute(pos, i2).sub(a);
    const f = b.cross(c);
    for (const i of [i0, i1, i2]) { const g = grp[i]; N[g * 3] += f.x; N[g * 3 + 1] += f.y; N[g * 3 + 2] += f.z; }
    const g0 = grp[i0], g1 = grp[i1], g2 = grp[i2]; nb[g0].add(g1).add(g2); nb[g1].add(g0).add(g2); nb[g2].add(g0).add(g1);
  }
  let cur = N;
  for (let pass = 0; pass < 2; pass++) {
    const nx = new Float32Array(G * 3);
    for (let g = 0; g < G; g++) { let x = cur[g * 3], y = cur[g * 3 + 1], z = cur[g * 3 + 2]; for (const o of nb[g]) { x += cur[o * 3] * 0.5; y += cur[o * 3 + 1] * 0.5; z += cur[o * 3 + 2] * 0.5; } nx[g * 3] = x; nx[g * 3 + 1] = y; nx[g * 3 + 2] = z; }
    cur = nx;
  }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const g = grp[i]; const l = Math.hypot(cur[g * 3], cur[g * 3 + 1], cur[g * 3 + 2]) || 1; out[i * 3] = cur[g * 3] / l; out[i * 3 + 1] = cur[g * 3 + 1] / l; out[i * 3 + 2] = cur[g * 3 + 2] / l; }
  geo.setAttribute('furN', new THREE.BufferAttribute(out, 3));
  // the model's height in its own units (fur length is a share of it)
  geo.computeBoundingBox(); SRC.rawH = geo.boundingBox.max.y - geo.boundingBox.min.y;
  SRC.furN = true;
  return true;
}
const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
export const FUR_LAYERS = touch ? 2 : 4;
// how many fur layers are drawn (all foxes); a game lowers it when the frame rate drops
const FUR_SETS = []; let furShown = 99;
function applyFur(set) { const n = Math.min(set.length, furShown); set.forEach((m, i) => { m.visible = n > 0 && (n >= set.length ? true : i % Math.ceil(set.length / n) === Math.ceil(set.length / n) - 1); }); }
export function setFurLayers(n) { furShown = n; FUR_SETS.forEach(applyFur); }
export const furLayers = () => Math.min(furShown, FUR_LAYERS);
if (typeof window !== 'undefined') window.FOXINO3D = { setFurLayers, furLayers };

function skinMaterial(src, map, eyeU, state, dressed) {
  const m = src.clone();
  if (map) m.map = map;
  m.metalness = 0; m.roughness = 1; m.envMapIntensity = 0.85;
  const uDressed = { value: dressed ? 1 : 0 };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, eyeU, state, { uDressed });
    // the body under the kit is not drawn (its fur would poke through the cloth)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float clothM; uniform float uDressed; varying float vCloth;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCloth = clothM * uDressed;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vCloth; uniform vec2 uGaze; uniform float uBlink; uniform vec3 uWhite; uniform vec3 uLid; uniform float uRimK;' + EYE_GLSL)
      .replace('#include <map_fragment>', 'if (vCloth > 0.5) discard;\n#include <map_fragment>' + EYE_FRAG)
      .replace('#include <opaque_fragment>', `{
        // a soft furry glow on the edges (light caught in the fur tips)
        float fr = 1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);
        outgoingLight += diffuseColor.rgb * uRimK * (0.35 * pow(fr, 1.5) + 0.65 * pow(fr, 4.0));
      }
      #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'foxino3d-skin';
  return m;
}
// the kit's cloth: soft fabric sheen; the hems flutter a little
function clothMaterial(map, timeU) {
  const m = new THREE.MeshPhysicalMaterial({ map, roughness: 0.74, metalness: 0, sheen: 0.3, sheenRoughness: 0.5, sheenColor: new THREE.Color(0x999999), side: THREE.DoubleSide, envMapIntensity: 0.85 });
  const amp = { value: 0.0035 * (SRC.rawH || 1.6) };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = timeU; sh.uniforms.uAmp = amp;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uAmp;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
float hem = pow(1.0 - clamp(uv.y, 0.0, 1.0), 3.0);
transformed += normal * hem * uAmp * sin(uTime * 11.0 + position.x * 60.0 + position.z * 45.0);`);
  };
  m.customProgramCacheKey = () => 'foxino3d-cloth';
  return m;
}
function shellMaterial(src, map, eyeU, layer, dressed) {
  const m = new THREE.MeshStandardMaterial({ map: map || src.map, roughness: 1, metalness: 0, envMapIntensity: 0.8 });
  const uDressed = { value: dressed ? 1 : 0 }, uLayer = { value: layer }, uLen = { value: 0.0085 * (SRC.rawH || 1.6) }, uDen = { value: 230 / (SRC.rawH || 1.6) };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, eyeU, { uLayer, uLen, uDen, uDressed });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 furN; attribute float clothM; uniform float uLayer; uniform float uLen; uniform float uDressed; varying vec3 vFurP; varying float vCloth;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFurP = position; vCloth = clothM * uDressed;\ntransformed += normalize(furN) * uLen * uLayer;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uLayer; uniform float uDen; varying vec3 vFurP; varying float vCloth;${EYE_GLSL}
vec3 hash33(vec3 p) { p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
#ifdef USE_MAP
if (eyeR(0, vMapUv) < 1.25 || eyeR(1, vMapUv) < 1.25) discard;
#endif
if (vCloth > 0.3) discard;
{
  vec3 q = vFurP * uDen; vec3 c = floor(q); vec3 f = fract(q);
  vec3 h = hash33(c);
  float rad = 0.46 * (1.0 - uLayer * 0.8) * (0.75 + 0.5 * h.z);
  if (length(f - (0.22 + 0.56 * h)) > rad) discard;
  if (dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)) < 0.05) discard;   // no fur on the nose, mouth, pupils
  diffuseColor.rgb *= mix(0.72, 1.12, uLayer);
}`);
  };
  m.customProgramCacheKey = () => 'foxino3d-fur';
  return m;
}

// ---------- the retargeting ----------
// Every Meshy bone takes the puppet joint's rotation away from the puppet's rest pose. For the limbs, the Meshy rest
// pose is first turned to match the puppet's (A-pose arms → hanging), so twist, bend plane and foot roll all follow.
const MAP = [   // [Meshy bone, puppet joint, Meshy child (limbs), puppet end point: a joint or a point in the joint's frame]
  ['Hips', 'hips'], ['Spine02', 'spine'], ['neck', 'neck'], ['Head', 'head'],
  ['LeftArm', 'armL', 'LeftForeArm', 'elbowL'], ['LeftForeArm', 'elbowL', 'LeftHand', [0, -0.15, 0]],
  ['RightArm', 'armR', 'RightForeArm', 'elbowR'], ['RightForeArm', 'elbowR', 'RightHand', [0, -0.15, 0]],
  ['LeftUpLeg', 'legL', 'LeftLeg', 'kneeL'], ['LeftLeg', 'kneeL', 'LeftFoot', 'ankleL'], ['LeftFoot', 'ankleL', 'LeftToeBase', [0, -0.045, 0.11]],
  ['RightUpLeg', 'legR', 'RightLeg', 'kneeR'], ['RightLeg', 'kneeR', 'RightFoot', 'ankleR'], ['RightFoot', 'ankleR', 'RightToeBase', [0, -0.045, 0.11]],
];
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _p2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _s = new THREE.Vector3(), _d = new THREE.Vector3();
const _ax = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _t = new THREE.Vector3(), _yAx = new THREE.Vector3(0, 1, 0), _xAx = new THREE.Vector3(1, 0, 0), _zAx = new THREE.Vector3(0, 0, 1);

export function makeFoxino3D(opt = {}) {
  if (!SRC) throw new Error('loadFoxino3D() first');
  const fox = makeFoxino(opt);   // the puppet
  const root = fox.root;
  root.traverse((o) => { if (o.isMesh) o.visible = false; });
  const rootInv = new THREE.Matrix4();
  const rs = (obj, outP, outQ) => { _m.multiplyMatrices(rootInv, obj.matrixWorld).decompose(outP, outQ, _s); };
  const endPoint = (j, end, out) => { if (typeof end === 'string') return fox.J[end].getWorldPosition(out).applyMatrix4(rootInv); out.set(end[0], end[1], end[2]); return fox.J[j].localToWorld(out).applyMatrix4(rootInv); };
  // the puppet's rest pose (root space)
  fox.apply(blankPose(), Infinity, 0); root.updateMatrixWorld(true); rootInv.copy(root.matrixWorld).invert();
  const pupRest = {}, pupDir = {};
  for (const [b, j, , end] of MAP) {
    const q = new THREE.Quaternion(), p = new THREE.Vector3(); rs(fox.J[j], p, q); pupRest[j] = q;
    if (end) pupDir[b] = endPoint(j, end, new THREE.Vector3()).sub(p).normalize();
  }
  const pupHip = new THREE.Vector3(); rs(fox.J.hips, pupHip, _q);
  const pupAnkle = new THREE.Vector3(); rs(fox.J.ankleL, pupAnkle, _q);
  fox.apply(POSES.stand(0), Infinity, 0);
  // the Meshy model, scaled to the puppet's height and standing on the ground
  const model = cloneSkinned(SRC.scene); model.name = 'foxino3d';
  const box = new THREE.Box3().setFromObject(SRC.scene);
  const H = opt.height || 1.42, k = H / (box.max.y - box.min.y);
  model.scale.setScalar(k); model.position.set(-(box.min.x + box.max.x) / 2 * k, -box.min.y * k, -(box.min.z + box.max.z) / 2 * k);
  root.add(model); root.updateMatrixWorld(true); rootInv.copy(root.matrixWorld).invert();
  const bones = {}; let skin = null;
  model.traverse((o) => { if (o.isBone) bones[o.name] = o; if (o.isSkinnedMesh && !skin) { skin = o; o.frustumCulled = false; } });
  const rest = {};
  for (const name in bones) { const p = new THREE.Vector3(), q = new THREE.Quaternion(); rs(bones[name], p, q); rest[name] = { p, q, lq: bones[name].quaternion.clone(), lp: bones[name].position.clone() }; }
  // the Meshy rest pose turned onto the puppet's (limbs only)
  const base = {};
  for (const [b, , c] of MAP) {
    if (!bones[b]) continue;
    if (!c) { base[b] = rest[b].q.clone(); continue; }
    const d = rest[c].p.clone().sub(rest[b].p).normalize();
    // his body is rounder than the puppet's: the arms hang a little further out, clear of the belly and the jersey
    const want = pupDir[b].clone();
    if (/Arm$/.test(b) || /ForeArm$/.test(b)) want.applyAxisAngle(_zAx, (b.startsWith('Left') ? 1 : -1) * (opt.armOut ?? 0.3)).normalize();
    base[b] = new THREE.Quaternion().setFromUnitVectors(d, want).multiply(rest[b].q);
  }
  const restPitch = {};
  for (const [f, t] of [['LeftFoot', 'LeftToeBase'], ['RightFoot', 'RightToeBase']]) { const d = rest[t].p.clone().sub(rest[f].p).normalize(); restPitch[f] = Math.asin(-d.y); }
  const legRatio = (rest.Hips.p.y) / Math.max(0.05, pupHip.y - pupAnkle.y + 0.08);
  // skin with blinking, looking eyes and a furry rim; fur shells over it
  furNormals();
  const eyeU = eyeUniforms(), E = SRC.eyes;
  const fm = furMap(opt.fur);
  const mapNow = fm || SRC.mesh.material.map;
  const furRGB = opt.fur && FURS[opt.fur] && FURS[opt.fur].fur !== undefined ? new THREE.Color(FURS[opt.fur].fur).convertLinearToSRGB().toArray() : [0.5, 0.25, 0.65];
  const state = { uGaze: { value: new THREE.Vector2() }, uBlink: { value: 0 }, uWhite: { value: new THREE.Color().setRGB(235 / 255, 232 / 255, 229 / 255, THREE.SRGBColorSpace) }, uLid: { value: lidColor(mapNow, furRGB) }, uRimK: { value: 0.55 } };
  if (opt.kit !== false) buildShells();   // also marks which vertices the kit covers
  else if (!SRC.mesh.geometry.attributes.clothM) SRC.mesh.geometry.setAttribute('clothM', new THREE.BufferAttribute(new Float32Array(SRC.mesh.geometry.attributes.position.count), 1));
  skin.material = skinMaterial(SRC.mesh.material, fm, eyeU, state, opt.kit !== false);
  const layers = opt.fur === false ? 0 : (opt.furLayers ?? FUR_LAYERS);
  const attach = (m) => { m.frustumCulled = false; skin.parent.add(m); m.position.copy(skin.position); m.quaternion.copy(skin.quaternion); m.scale.copy(skin.scale); m.bind(skin.skeleton, skin.bindMatrix); return m; };
  const fur = [];
  for (let l = 1; l <= layers; l++) { const m = attach(new THREE.SkinnedMesh(skin.geometry, shellMaterial(SRC.mesh.material, fm, eyeU, l / layers, opt.kit !== false))); fur.push(m); }
  FUR_SETS.push(fur); applyFur(fur);
  // the kit
  const clothTime = { value: 0 }, clothAmp = { value: 0 };
  const K = Object.assign({}, KITS.foxino, opt.kit || {});
  if (opt.kit !== false) {
    const sh = buildShells(), tx = kitTextures(K);
    for (const [g, map] of [[sh.shirt, tx.shirt], [sh.straps, tx.straps], [sh.pants, tx.pants]]) attach(new THREE.SkinnedMesh(g, clothMaterial(map, clothTime)));
  }
  // ---- eyes: where he looks, and blinking
  const eye = { target: null, gaze: new THREE.Vector2(), want: new THREE.Vector2(), jit: new THREE.Vector2(), nextJit: 0.5, blink: 0, nextBlink: 1 + Math.random() * 3, dbl: false };
  const _hl = new THREE.Vector3();
  function updateEyes(dt) {
    // where to look: the target (in the head's frame) plus small quick glances
    eye.nextJit -= dt;
    if (eye.nextJit < 0) { eye.nextJit = 0.6 + Math.random() * 2.2; eye.jit.set((Math.random() - 0.5) * (eye.target ? 0.25 : 0.9), (Math.random() - 0.5) * (eye.target ? 0.15 : 0.45)); }
    if (eye.target) {
      fox.J.head.worldToLocal(_hl.copy(eye.target));
      const yaw = Math.atan2(_hl.x, Math.max(0.05, _hl.z)), pitch = Math.atan2(_hl.y + 0.05, Math.hypot(_hl.x, _hl.z));
      eye.want.set(THREE.MathUtils.clamp(yaw / 0.85, -1, 1), THREE.MathUtils.clamp(pitch / 0.7, -0.8, 0.8));
    } else eye.want.set(0, 0);
    eye.want.add(eye.jit); if (eye.want.length() > 1) eye.want.normalize();
    eye.gaze.lerp(eye.want, 1 - Math.exp(-22 * dt));   // eyes jump quickly (saccades)
    // blinking: every 2–5 s, now and then twice
    eye.nextBlink -= dt;
    if (eye.nextBlink < 0) { eye.blink = 0.16; eye.nextBlink = eye.dbl ? 0.22 : 2 + Math.random() * 3.2; eye.dbl = !eye.dbl && Math.random() < 0.2; }
    eye.blink = Math.max(0, eye.blink - dt);
    const bl = eye.blink > 0 ? Math.sin(Math.PI * (1 - eye.blink / 0.16)) : 0;
    state.uGaze.value.copy(eye.gaze); state.uBlink.value = eye.hold >= 0 ? eye.hold : bl;
  }
  function retarget() {
    root.updateMatrixWorld(true); rootInv.copy(root.matrixWorld).invert();
    for (const [b, j] of MAP) {
      const bone = bones[b]; if (!bone) continue;
      rs(fox.J[j], _p, _q);
      _q.multiply(_q2.copy(pupRest[j]).invert()).multiply(base[b]);   // desired (root space)
      rs(bone.parent, _p2, _q2);
      bone.quaternion.copy(_q2.invert().multiply(_q));
      if (b === 'Hips') {   // the body bobs and crouches
        _d.set(0, fox.pose.y * legRatio * 0.9, 0);
        _m.multiplyMatrices(rootInv, bone.parent.matrixWorld).decompose(_p, _q2, _s);
        bone.position.copy(rest[b].lp).add(_d.applyQuaternion(_q2.invert()).divide(_s));
      }
      bone.updateMatrixWorld(true);
    }
    // the wrists roll in, so the palms face his body (Meshy's A-pose palms face down)
    for (const [h, sd] of [['LeftHand', 1], ['RightHand', -1]]) {
      const hand = bones[h]; if (!hand) continue;
      hand.quaternion.copy(rest[h].lq).multiply(_q.setFromAxisAngle(_yAx, fox.handTwist * sd));
      if (fox.handCurl) hand.quaternion.multiply(_q.setFromAxisAngle(_xAx, fox.handCurl));
      hand.updateMatrixWorld(true);
    }
    // toes roll up when the foot points down (pushing off the ground)
    for (const [f, t] of [['LeftFoot', 'LeftToeBase'], ['RightFoot', 'RightToeBase']]) {
      const foot = bones[f], toe = bones[t]; if (!foot || !toe) continue;
      toe.quaternion.copy(rest[t].lq); toe.updateMatrixWorld(true);
      rs(foot, _p, _q); rs(toe, _p2, _q2);
      _d.subVectors(_p2, _p).normalize();
      const pitch = Math.asin(THREE.MathUtils.clamp(-_d.y, -1, 1));   // + = toes pointing down
      const bend = THREE.MathUtils.clamp((pitch - restPitch[f] - 0.2) * 1.1, 0, 0.75);
      if (bend > 0.001) {
        _ax.crossVectors(_d, _up).normalize();
        _q.setFromAxisAngle(_ax, bend).multiply(_q2);
        rs(toe.parent, _t, _q2); toe.quaternion.copy(_q2.invert().multiply(_q)); toe.updateMatrixWorld(true);
      }
    }
  }
  fox.handTwist = opt.handTwist ?? 1.3; fox.handCurl = opt.handCurl ?? 0;
  const baseUpdate = fox.update;
  fox.update = (dt, t) => { baseUpdate(dt, t); retarget(); updateEyes(dt); clothTime.value = t; };
  fox.model = model; fox.bones = bones; fox.skin = skin; fox.retarget = retarget;
  fox.face = () => {};   // the Meshy face has no expressions
  // look at a point in the world (null: look ahead and around); blink now
  fox.lookAt = (v) => { eye.target = v ? (eye.target || new THREE.Vector3()).copy(v) : null; };
  fox.blink = () => { eye.blink = 0.16; };
  fox.eyes = eye; fox.eyeState = state;
  eye.hold = -1;   // tests: a fixed blink amount (0–1), -1 = live
  // the paw positions on the real model (for holding a ball)
  fox.hand = (side, out) => bones[side < 0 ? 'RightHand' : 'LeftHand'].getWorldPosition(out);
  retarget();
  return fox;
}
