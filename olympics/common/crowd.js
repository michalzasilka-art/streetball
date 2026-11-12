// A colourful crowd (one instanced draw call, cheering and doing the wave in the shader) and stepped stands.
// From Penalty Star's stadium.js. makeCrowd(seats [{x,y,z,rot}], centre [x,z] of the wave) → { mesh, uniforms }
import * as THREE from './lib/three.module.min.js';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// ---------- crowd ----------
// an atlas of little supporters: 4 looks x (arms down, arms up). Pure white pixels are the shirt (tinted per person).
function crowdAtlas() {
  const CW = 64, CH = 96, cv = canvas(CW * 4, CH * 2), g = cv.getContext('2d');
  const skins = ['#f2c7a5', '#c98d63', '#8a5a3c', '#f6d7bd'], hairs = ['#3b2414', '#1c1410', '#e0b050', '#7a3a1a'];
  for (let v = 0; v < 4; v++) {
    for (let up = 0; up < 2; up++) {
      const ox = v * CW, oy = up * CH, cx = ox + CW / 2;
      // body (shirt, white = tinted)
      g.fillStyle = '#ffffff';
      g.beginPath(); g.ellipse(cx, oy + CH * 0.86, CW * 0.36, CH * 0.36, 0, Math.PI, 0); g.fill();
      g.fillRect(cx - CW * 0.36, oy + CH * 0.84, CW * 0.72, CH * 0.16);
      // arms
      g.strokeStyle = '#ffffff'; g.lineCap = 'round'; g.lineWidth = 11;
      if (up) {
        g.beginPath(); g.moveTo(cx - 17, oy + CH * 0.62); g.lineTo(cx - 25, oy + CH * 0.18); g.moveTo(cx + 17, oy + CH * 0.62); g.lineTo(cx + 25, oy + CH * 0.18); g.stroke();
        g.fillStyle = skins[v]; g.beginPath(); g.arc(cx - 25, oy + CH * 0.15, 6, 0, 7); g.arc(cx + 25, oy + CH * 0.15, 6, 0, 7); g.fill();
      }
      // head
      g.fillStyle = skins[v]; g.beginPath(); g.arc(cx, oy + CH * 0.42, 14, 0, Math.PI * 2); g.fill();
      g.fillStyle = hairs[v];
      g.beginPath(); g.arc(cx, oy + CH * 0.39, 14.5, Math.PI * 1.02, Math.PI * 1.98); g.fill();
      if (v === 2) { g.beginPath(); g.arc(cx - 12, oy + CH * 0.46, 6, 0, 7); g.arc(cx + 12, oy + CH * 0.46, 6, 0, 7); g.fill(); }
      if (v === 1) { g.fillStyle = '#ff7d22'; g.fillRect(cx - 15, oy + CH * 0.31, 30, 7); } // a cap/headband
    }
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function makeCrowd(seats, center = [0, 0]) {
  const N = seats.length;
  const geo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(0.62, 0.92); quad.translate(0, 0.46, 0);
  geo.index = quad.index; geo.attributes.position = quad.attributes.position; geo.attributes.uv = quad.attributes.uv;
  const off = new Float32Array(N * 4), col = new Float32Array(N * 3), rnd = new Float32Array(N * 4);
  const palette = [0xffcd1c, 0x8f52d9, 0xff7d22, 0x3cc6ef, 0xffffff, 0xff4f9a, 0x5bd66b, 0x2c5fd6, 0xe23c3c, 0xffcd1c, 0x8f52d9, 0xff7d22];
  const c = new THREE.Color();
  seats.forEach((s, i) => {
    off.set([s.x, s.y, s.z, s.rot], i * 4);
    c.setHex(palette[Math.floor(Math.random() * palette.length)]).convertSRGBToLinear();
    const k = 0.8 + Math.random() * 0.25; col.set([c.r * k, c.g * k, c.b * k], i * 3);
    rnd.set([Math.random(), Math.floor(Math.random() * 4), Math.random(), Math.random()], i * 4);
  });
  geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
  geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(col, 3));
  geo.setAttribute('aRnd', new THREE.InstancedBufferAttribute(rnd, 4));
  geo.instanceCount = N;
  const uniforms = { uTime: { value: 0 }, uCheer: { value: 0 }, uWave: { value: 1 }, uMap: { value: crowdAtlas() }, uSad: { value: 0 }, uC: { value: new THREE.Vector2(center[0], center[1]) } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: false, side: THREE.DoubleSide,
    vertexShader: `
      attribute vec4 aOff; attribute vec3 aCol; attribute vec4 aRnd;
      uniform float uTime, uCheer, uWave, uSad; uniform vec2 uC;
      varying vec2 vUv; varying vec3 vCol; varying float vShade;
      void main(){
        float ph = aRnd.x * 6.2831;
        // a Mexican wave travelling round the stadium (angle around the pitch centre)
        float ang = atan(aOff.x - uC.x, aOff.z - uC.y);
        float wave = uWave * smoothstep(0.75, 1.0, sin(ang * 3.0 - uTime * 1.6));
        float jump = uCheer * 0.32 * abs(sin(uTime * (8.0 + aRnd.z * 3.0) + ph)) + 0.02 * sin(uTime * 2.0 + ph) + wave * 0.35;
        float up = max(step(aRnd.w, uCheer * 1.1), step(0.5, wave));
        up = max(up, step(0.985, fract(aRnd.w * 13.0 + uTime * 0.03)));
        vec3 p = position;
        p.y += jump - uSad * 0.08;
        float c = cos(aOff.w), s = sin(aOff.w);
        vec3 w = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z) + aOff.xyz;
        vUv = vec2((uv.x + aRnd.y) / 4.0, (uv.y + (1.0 - up)) / 2.0);
        vCol = aCol; vShade = 0.75 + 0.25 * uv.y;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D uMap; varying vec2 vUv; varying vec3 vCol; varying float vShade;
      void main(){
        vec4 t = texture2D(uMap, vUv);
        if (t.a < 0.5) discard;
        float shirt = step(0.97, min(t.r, min(t.g, t.b)));
        vec3 c = mix(t.rgb, vCol, shirt) * vShade;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  return { mesh: m, uniforms };
}

// ---------- stands ----------
// a stepped stand: `rows` rows, each 0.85 m deep and 0.42 m higher; it is built along +x facing +z, then placed
export function standGeometry(width, rows, base) {
  const s = new THREE.Shape();
  const D = 0.85, H = 0.42;
  s.moveTo(0, 0); s.lineTo(0, base);
  for (let i = 0; i < rows; i++) { s.lineTo(-(i + 1) * D, base + i * H); s.lineTo(-(i + 1) * D, base + (i + 1) * H); }
  s.lineTo(-rows * D - 0.5, base + rows * H + 1.6);
  s.lineTo(-rows * D - 1.2, base + rows * H + 1.6);
  s.lineTo(-rows * D - 1.2, 0);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: false, steps: 1 });
  // shape (x = depth, negative toward the back; y = height), extruded along +z: turn it so the extrusion runs along x
  // and the rows climb toward -z (the front faces +z)
  g.rotateY(-Math.PI / 2);
  g.translate(width / 2, 0, 0);
  return g;
}

