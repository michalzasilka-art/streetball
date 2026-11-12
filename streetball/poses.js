// Basketball poses for the code-built foxes (same joints as olympics/common/foxino.js).
// Frame: +Z his front, +X his left. Negative x on a leg/arm = forward; z on armL = out to his left (armR mirrored).
// `side` = the dribbling hand: -1 = his right hand (default), +1 = his left hand (the pose is mirrored).
import { blankPose, POSES } from '../olympics/common/foxino.js';
import { aimLimb, clamp, lerp, smooth } from '../olympics/common/mat.js';

const PAIRS = [['armL', 'armR'], ['elbowL', 'elbowR'], ['legL', 'legR'], ['kneeL', 'kneeR'], ['ankleL', 'ankleR']];
// swap left and right (a mirror image through his middle plane)
export function mirror(p) {
  const q = { ...p };
  for (const [a, b] of PAIRS) { q[a] = [p[b][0], -p[b][1], -p[b][2]]; q[b] = [p[a][0], -p[a][1], -p[a][2]]; }
  for (const j of ['hips', 'spine', 'neck', 'head']) q[j] = [p[j][0], -p[j][1], -p[j][2]];
  q.tail = -(p.tail || 0);
  return q;
}
const sided = (p, side) => (side > 0 ? mirror(p) : p);
const bump = (x) => Math.max(0, Math.sin(Math.PI * clamp(x, 0, 1)));

// limb aims (parent = spine frame)
const GUARD_L = aimLimb([0.45, -0.35, 0.55], [0.25, 0.25, 0.9]);          // the off arm up in front, protecting the ball
const HAND_UP = (y) => aimLimb([-0.42, -0.55, 0.5], [-0.2, -0.95 + y, 0.25]); // the dribbling arm, the paw following the ball
const SHOOT_R = (u) => aimLimb([-0.12, lerp(0.15, 0.95, u), lerp(0.75, 0.32, u)], [0.0, lerp(-0.2, 0.95, u), lerp(0.9, 0.3, u)]);
const SHOOT_L = (u) => aimLimb([0.3, lerp(0.15, 0.85, u), lerp(0.8, 0.45, u)], [-0.25, lerp(0.1, 0.75, u), 0.7]);

function crouch(p, k = 1, wide = 0.08) {
  p.y = -0.07 * k;
  p.legL = [-0.32 * k, 0, wide]; p.legR = [-0.32 * k, 0, -wide];
  p.kneeL = [0.62 * k, 0, 0]; p.kneeR = [0.62 * k, 0, 0];
  p.ankleL = [-0.28 * k, 0, 0]; p.ankleR = [-0.28 * k, 0, 0];
  return p;
}

export const BPOSES = {
  stand: POSES.stand, run: POSES.run, celebrate: POSES.celebrate, sad: POSES.sad, wave: POSES.wave,
  // a low dribble on the spot; b = the ball height 0 (floor) .. 1 (in the paw)
  dribble(t, b, side = -1) {
    const p = crouch(blankPose(), 1, 0.12);
    p.y += 0.012 * Math.sin(t * 9);
    p.spine = [0.32, -0.12, 0]; p.head = [-0.3, 0.1, 0];
    const R = HAND_UP(0.5 * b); p.armR = R.a; p.elbowR = R.b;
    p.armL = GUARD_L.a.slice(); p.elbowL = GUARD_L.b.slice();
    p.tail = Math.sin(t * 4) * 0.5;
    return sided(p, side);
  },
  // running with the ball (ph = stride phase)
  drive(ph, b, side = -1) {
    const p = POSES.run(ph, 1);
    const R = HAND_UP(0.5 * b); p.armR = R.a; p.elbowR = R.b;
    p.spine = [0.38, 0.06 * Math.sin(ph), 0]; p.head = [-0.35, 0, 0];
    return sided(p, side);
  },
  // the crossover: u 0 → 1, the ball goes from his right paw in front of him to his left paw; the body dips and swings
  crossover(u, t) {
    const p = crouch(blankPose(), 1.15, 0.16);
    const sw = smooth(u);
    p.spine = [0.4, lerp(-0.35, 0.35, sw), 0]; p.hips = [0, lerp(-0.25, 0.25, sw), 0]; p.head = [-0.3, lerp(0.2, -0.2, sw), 0];
    const R = HAND_UP(0.2), L = mirror({ ...blankPose(), armR: HAND_UP(0.2).a, elbowR: HAND_UP(0.2).b });
    p.armR = R.a.map((v, i) => lerp(v, GUARD_L.a[i] * (i ? -1 : 1), sw)); p.elbowR = R.b.map((v, i) => lerp(v, GUARD_L.b[i] * (i ? -1 : 1), sw));
    p.armL = GUARD_L.a.map((v, i) => lerp(v, L.armL[i], sw)); p.elbowL = GUARD_L.b.map((v, i) => lerp(v, L.elbowL[i], sw));
    p.legL = [lerp(-0.6, -0.1, sw), 0, 0.16]; p.legR = [lerp(-0.1, -0.6, sw), 0, -0.16];
    p.tail = lerp(-1, 1, sw);
    return p;
  },
  // jump shot: u 0 → 1 (gather 0-.3, rise .3-.55, release .55, hang and land)
  shoot(u) {
    const p = blankPose();
    const gather = smooth(u / 0.3), rise = smooth((u - 0.3) / 0.25), land = smooth((u - 0.8) / 0.2);
    const jump = bump((u - 0.3) / 0.55);
    p.y = -0.1 * gather * (1 - rise) + 0.42 * jump;
    const kb = 0.75 * gather * (1 - rise) + 0.25 * jump + 0.4 * land * (1 - smooth((u - 0.92) / 0.08));
    p.legL = [-0.35 * kb, 0, 0.06]; p.legR = [-0.35 * kb, 0, -0.06];
    p.kneeL = [0.75 * kb + 0.1, 0, 0]; p.kneeR = [0.75 * kb + 0.1, 0, 0];
    p.ankleL = [-0.3 * kb + 0.35 * jump, 0, 0]; p.ankleR = [-0.3 * kb + 0.35 * jump, 0, 0];
    const arm = clamp(rise + 0.15 * gather, 0, 1);
    const R = SHOOT_R(arm), L = SHOOT_L(arm * (1 - smooth((u - 0.6) / 0.2) * 0.6));
    p.armR = R.a; p.elbowR = R.b; p.armL = L.a; p.elbowL = L.b;
    p.spine = [0.18 * gather * (1 - rise) - 0.12 * jump, 0.05, 0]; p.head = [-0.35 * arm, 0, 0];
    p.tail = jump;
    return p;
  },
  // defensive stance: wide and low, arms out; slide = 0..1 shuffling, dir ±1 = which way
  stance(t, slide = 0) {
    const p = crouch(blankPose(), 1.1, 0.34);
    const bob = Math.abs(Math.sin(t * (slide ? 12 : 5)));
    p.y = -0.12 + 0.03 * bob;
    p.armL = [-0.35, 0, 1.15 + 0.1 * Math.sin(t * 3)]; p.armR = [-0.35, 0, -1.15 - 0.1 * Math.sin(t * 3)];
    p.elbowL = [-0.5, 0, 0]; p.elbowR = [-0.5, 0, 0];
    p.spine = [0.28, 0, 0]; p.head = [-0.28, 0, 0];
    if (slide) { const s = Math.sin(t * 14); p.legL[2] += 0.2 * s * slide; p.legR[2] += 0.2 * s * slide; }
    p.tail = Math.sin(t * 3) * 0.4;
    return p;
  },
  // a poke steal with the right paw (u 0 → 1)
  steal(u, t) {
    const p = BPOSES.stance(t, 0);
    const k = bump(u / 0.7), lunge = smooth(u / 0.4);
    const R = aimLimb([-0.2, -0.35, 0.9], [-0.1, -0.55, 0.85]);
    p.armR = p.armR.map((v, i) => lerp(v, R.a[i], k)); p.elbowR = p.elbowR.map((v, i) => lerp(v, R.b[i], k));
    p.spine = [0.28 + 0.3 * k, 0.25 * k, 0]; p.legL = [-0.7 * lunge, 0, 0.2];
    return p;
  },
  // a block: both arms straight up, a big jump (u 0 → 1)
  block(u) {
    const p = blankPose();
    const jump = bump(u / 0.85), tuck = smooth(u / 0.2);
    p.y = 0.55 * jump - 0.08 * (1 - tuck) * (u < 0.2 ? 1 : 0);
    p.legL = [-0.25 * jump, 0, 0.05]; p.legR = [0.15 * jump, 0, -0.05];
    p.kneeL = [0.7 * jump, 0, 0]; p.kneeR = [0.4 * jump, 0, 0]; p.ankleL = [0.4 * jump, 0, 0]; p.ankleR = [0.4 * jump, 0, 0];
    const up = smooth(u / 0.3);
    p.armL = [-0.35 * up, 0, lerp(0.3, 2.85, up)]; p.armR = [-0.35 * up, 0, lerp(-0.3, -2.75, up)];
    p.elbowL = [-0.1, 0, 0]; p.elbowR = [-0.1, 0, 0];
    p.spine = [-0.1 * jump, 0, 0]; p.head = [-0.4 * up, 0, 0];
    p.tail = jump;
    return p;
  },
  // beaten: off balance, spinning (u 0 → 1)
  stumble(u, t) {
    const p = BPOSES.stance(t, 0);
    const k = bump(u);
    p.spine = [0.1 + 0.25 * k, 0.5 * k, -0.3 * k]; p.armL = [-0.8 * k, 0, 1.6]; p.armR = [0.4 * k, 0, -2.2 * k - 0.4];
    p.legL = [-0.5 * k, 0, 0.4]; p.kneeL = [0.3, 0, 0]; p.head = [0.1, 0.4 * k, 0];
    p.y = -0.1 - 0.05 * k;
    return p;
  },
  // standing with the ball held at the chest (for a check pass / the start screen)
  hold(t) {
    const p = POSES.stand(t);
    const R = aimLimb([-0.35, -0.75, 0.45], [0.35, 0.05, 0.9]), L = aimLimb([0.35, -0.75, 0.45], [-0.35, 0.05, 0.9]);
    p.armR = R.a; p.elbowR = R.b; p.armL = L.a; p.elbowL = L.b;
    return p;
  },
};
