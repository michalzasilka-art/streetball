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
  const behind = (i) => isBehind(P[i * 3 + 2], B.Hips.z, Hh);
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
        const jj = j % SEG, a = -Math.PI + (j + 0.5) / SEG * 2 * Math.PI, r = R[k][jj] + margin * Hh;
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
      const W = SEG + 1;
      for (let k = 0; k < t.rings; k++) for (let j = 0; j < SEG; j++) {
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
  const shirtTube = tube(trunk, waist - 0.03 * Hh, armY - 0.012 * Hh, 9, 0.012, 0.86, (i, y) => y > armY - 0.06 * Hh && Math.abs(P[i * 3] - B.Spine01.x) > Math.abs(B.LeftArm.x - B.Spine01.x) * 0.92);
  const waistTube = tube(trunk, crotch - 0.01 * Hh, waist + 0.03 * Hh, 4, 0.016, 0.86);
  const lTube = tube(legL, thigh, crotch + 0.02 * Hh, 4, 0.016, 0.82);
  const rTube = tube(legR, thigh, crotch + 0.02 * Hh, 4, 0.016, 0.82);
  SRC.shell = {
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
  const draw = () => {
    const g = shirtCv.getContext('2d');
    g.fillStyle = hx(K.jersey); g.fillRect(0, 0, W, H);
    const sh = g.createLinearGradient(0, 0, 0, H); sh.addColorStop(0, 'rgba(255,255,255,.10)'); sh.addColorStop(1, 'rgba(120,60,0,.10)'); g.fillStyle = sh; g.fillRect(0, 0, W, H);
    // side panels (his sides are u = 0.25 and 0.75), hem and collar
    g.fillStyle = hx(K.trim); for (const u of [0.25, 0.75]) g.fillRect(u * W - 22, 0, 44, H);
    g.fillStyle = hx(K.accent); for (const u of [0.25, 0.75]) { g.fillRect(u * W - 30, 0, 8, H); g.fillRect(u * W + 22, 0, 8, H); }
    g.fillStyle = hx(K.trim); g.fillRect(0, H - 34, W, 34); g.fillRect(0, 0, W, 26);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    const font = (px) => `${px}px "Lilita One", "Arial Black", sans-serif`;
    // front (u = 0.5): the number on the chest
    g.font = font(170); g.lineWidth = 14; g.strokeStyle = hx(K.light ?? 0xffffff); g.strokeText(String(K.number), W * 0.5, H * 0.45);
    g.fillStyle = hx(K.trim); g.fillText(String(K.number), W * 0.5, H * 0.45);
    // back (u = 0 and 1, drawn on both edges): name and a big number
    for (const x of [0, W]) {
      g.font = font(K.name.length > 7 ? 54 : 66); g.lineWidth = 10; g.strokeStyle = hx(K.light ?? 0xffffff); g.strokeText(K.name, x, H * 0.24); g.fillStyle = hx(K.trim); g.fillText(K.name, x, H * 0.24);
      g.font = font(230); g.lineWidth = 22; g.strokeStyle = hx(K.accent); g.strokeText(String(K.number), x, H * 0.6);
      g.lineWidth = 10; g.strokeStyle = hx(K.light ?? 0xffffff); g.strokeText(String(K.number), x, H * 0.6); g.fillStyle = hx(K.trim); g.fillText(String(K.number), x, H * 0.6);
    }
    const p = pantsCv.getContext('2d');
    p.fillStyle = hx(K.shorts); p.fillRect(0, 0, 512, 256);
    p.fillStyle = hx(K.trim); p.fillRect(0, 0, 512, 34); for (const u of [0.25, 0.75]) p.fillRect(u * 512 - 9, 0, 18, 256);
    p.fillStyle = 'rgba(0,0,0,.12)'; p.fillRect(0, 230, 512, 26);
  };
  draw();
  const mk = (cv) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const out = { shirt: mk(shirtCv), pants: mk(pantsCv) };
  if (document.fonts && document.fonts.load) document.fonts.load('66px "Lilita One"').then(() => { draw(); out.shirt.needsUpdate = true; }).catch(() => {});
  SRC.maps.set(key, out);
  return out;
}

// ---------- the retargeting ----------
const LIMBS = [   // [Meshy bone, its child, puppet joint, puppet point at the end of the limb (in that joint's frame or a joint name)]
  ['LeftArm', 'LeftForeArm', 'armL', 'elbowL'], ['LeftForeArm', 'LeftHand', 'elbowL', [0, -0.15, 0]],
  ['RightArm', 'RightForeArm', 'armR', 'elbowR'], ['RightForeArm', 'RightHand', 'elbowR', [0, -0.15, 0]],
  ['LeftUpLeg', 'LeftLeg', 'legL', 'kneeL'], ['LeftLeg', 'LeftFoot', 'kneeL', 'ankleL'], ['LeftFoot', 'LeftToeBase', 'ankleL', [0, -0.045, 0.11]],
  ['RightUpLeg', 'RightLeg', 'legR', 'kneeR'], ['RightLeg', 'RightFoot', 'kneeR', 'ankleR'], ['RightFoot', 'RightToeBase', 'ankleR', [0, -0.045, 0.11]],
];
const TURN = [['Hips', 'hips'], ['Spine02', 'spine'], ['neck', 'neck'], ['Head', 'head']];
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _p2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _s = new THREE.Vector3(), _d = new THREE.Vector3();

export function makeFoxino3D(opt = {}) {
  if (!SRC) throw new Error('loadFoxino3D() first');
  const fox = makeFoxino(opt);   // the puppet
  const root = fox.root;
  root.traverse((o) => { if (o.isMesh) o.visible = false; });
  // puppet size and its rest pose (all in root space)
  const rootInv = new THREE.Matrix4();
  const rs = (obj, outP, outQ) => { _m.multiplyMatrices(rootInv, obj.matrixWorld).decompose(outP, outQ, _s); };
  fox.apply(blankPose(), Infinity, 0); root.updateMatrixWorld(true); rootInv.copy(root.matrixWorld).invert();
  const pupRest = {};
  for (const [, j] of TURN) { const q = new THREE.Quaternion(); rs(fox.J[j], _p, q); pupRest[j] = q; }
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
  model.traverse((o) => { if (o.isBone) bones[o.name] = o; if (o.isSkinnedMesh) { skin = o; o.frustumCulled = false; } });
  const rest = {};
  for (const name in bones) { const p = new THREE.Vector3(), q = new THREE.Quaternion(); rs(bones[name], p, q); rest[name] = { p, q, lq: bones[name].quaternion.clone(), lp: bones[name].position.clone() }; }
  const restDir = {};
  for (const [b, c] of LIMBS) restDir[b] = rest[c].p.clone().sub(rest[b].p).normalize();
  const legRatio = (rest.Hips.p.y) / Math.max(0.05, pupHip.y - pupAnkle.y + 0.08);
  // skin: Foxino's own texture or a recoloured fur
  const mat = skin.material.clone();
  const fm = furMap(opt.fur); if (fm) mat.map = fm;
  skin.material = mat;
  // the kit
  const K = Object.assign({}, KITS.foxino, opt.kit || {});
  if (opt.kit !== false) {
    const sh = buildShells(), tx = kitTextures(K);
    for (const [g, map] of [[sh.shirt, tx.shirt], [sh.pants, tx.pants]]) {
      const m = new THREE.SkinnedMesh(g, new THREE.MeshStandardMaterial({ map, roughness: 0.72, metalness: 0, side: THREE.DoubleSide }));
      m.frustumCulled = false;
      skin.parent.add(m); m.position.copy(skin.position); m.quaternion.copy(skin.quaternion); m.scale.copy(skin.scale);
      m.bind(skin.skeleton, skin.bindMatrix);
    }
  }
  const pupPt = new THREE.Vector3();
  function retarget() {
    root.updateMatrixWorld(true); rootInv.copy(root.matrixWorld).invert();
    // turn the trunk and head by the puppet's rotation from its rest pose
    for (const [b, j] of TURN) {
      const bone = bones[b]; if (!bone) continue;
      rs(fox.J[j], _p, _q);
      _q.multiply(_q2.copy(pupRest[j]).invert()).multiply(rest[b].q);   // desired, root space
      rs(bone.parent, _p, _q2);
      bone.quaternion.copy(_q2.invert().multiply(_q));
      if (b === 'Hips') {   // the body bobs and crouches
        _d.set(0, fox.pose.y * legRatio * 0.9, 0);
        _m.multiplyMatrices(rootInv, bone.parent.matrixWorld).decompose(_p, _q2, _s);
        bone.position.copy(rest[b].lp).add(_d.applyQuaternion(_q2.invert()).divide(_s));
      }
      bone.updateMatrixWorld(true);
    }
    // point every limb the way the puppet's limb points
    for (const [b, , j, end] of LIMBS) {
      const bone = bones[b]; if (!bone) continue;
      rs(fox.J[j], _p, _q);
      if (typeof end === 'string') rs(fox.J[end], pupPt, _q2);
      else { pupPt.set(end[0], end[1], end[2]); fox.J[j].localToWorld(pupPt); pupPt.applyMatrix4(rootInv); }
      _d.subVectors(pupPt, _p).normalize();
      _q.setFromUnitVectors(restDir[b], _d).multiply(rest[b].q);
      rs(bone.parent, _p2, _q2);
      bone.quaternion.copy(_q2.invert().multiply(_q));
      bone.updateMatrixWorld(true);
    }
  }
  const baseUpdate = fox.update;
  fox.update = (dt, t) => { baseUpdate(dt, t); retarget(); };
  fox.model = model; fox.bones = bones; fox.skin = skin; fox.retarget = retarget;
  fox.face = () => {};   // the Meshy face has no expressions
  // the paw positions on the real model (for holding a ball)
  fox.hand = (side, out) => bones[side < 0 ? 'RightHand' : 'LeftHand'].getWorldPosition(out);
  retarget();
  return fox;
}
