// Synthetic clip generator. Builds one 3D body motion and projects it
// through a pinhole camera into any frame size, so the same movement can be
// "recorded" in portrait, landscape, mirrored, off-center or farther away.
// Output matches the recorded clip format (rep-engine-clip v1).
//
// A motion is a function of time returning a pose description:
//   lean   upper body tilt (radians, + toward the player's right)
//   yaw    torso turn about the vertical axis (radians, + = turned to the
//          player's right); hips follow by hipYaw (fraction, default 0.3)
//   headYaw  extra head turn on top of yaw (radians), moves only the nose
//   drop   hip drop (m), as in a squat
//   bob    whole body vertical offset (m), shiftX whole body sideways (m, camera +x)
//   thighL, thighR   hip flexion (radians, 0 = standing, pi/2 = thigh level)
//   liftL, liftR     legacy straight knee lift (m), used by motionAt
//   armL, armR       {a, f, a2, f2}: upper arm and forearm directions.
//                    a = abduction (0 down, pi/2 out sideways, pi straight up),
//                    f = flexion toward the camera. a2, f2 are the forearm's.
// scriptMotion() composes these from move segments and reports how many of
// each move a clip contains, so tests can compare detected against expected.

// Heights from the floor in meters, x to the player's LEFT is camera +x
// (the player faces the camera, so their right side is on camera -x).
const BASE = {
  0: [0, 1.65, -0.1],       // nose, in front of the shoulder plane
  7: [0.075, 1.66, 0.02], 8: [-0.075, 1.66, 0.02], // ears, behind the nose (0.12.0: a side camera reads facing from them)
  11: [0.2, 1.45, 0], 12: [-0.2, 1.45, 0],   // shoulders L, R
  13: [0.26, 1.16, 0], 14: [-0.26, 1.16, 0], // elbows
  15: [0.28, 0.88, 0], 16: [-0.28, 0.88, 0], // wrists
  23: [0.15, 0.95, 0], 24: [-0.15, 0.95, 0], // hips
  25: [0.14, 0.5, 0], 26: [-0.14, 0.5, 0],   // knees
  27: [0.14, 0.08, 0], 28: [-0.14, 0.08, 0], // ankles
};
const UPPER = new Set([0, 7, 8, 11, 12, 13, 14, 15, 16]);
const HIP_Y = 0.95;
const THIGH = 0.45, SHIN = 0.42, UPPER_ARM = 0.29, FOREARM = 0.28;

// Body builds for robustness sweeps (synthClip opts.body): scale (overall
// size, 1 = about 1.75 m), and relative proportions shoulder (width), arm,
// leg and torso (lengths). makeBody(undefined) is the default body above.
export const BODIES = {
  short: { scale: 0.86 },
  tall: { scale: 1.12 },
  broad: { shoulder: 1.22 },
  narrow: { shoulder: 0.84 },
  longArms: { arm: 1.12 },
  shortArms: { arm: 0.88 },
  longLegs: { leg: 1.08, torso: 0.92 },
  longTorso: { torso: 1.12, leg: 0.93 },
};
function makeBody(body) {
  if (!body) return { BASE, HIP_Y, THIGH, SHIN, UPPER_ARM, FOREARM };
  const k = body.scale || 1, sw = body.shoulder || 1, A = body.arm || 1, Lg = body.leg || 1, Tz = body.torso || 1;
  const hipY = 0.95 * Lg, shY = hipY + 0.5 * Tz, sx = 0.2 * sw;
  const b = {
    0: [0, shY + 0.2 * Tz, -0.1],
    7: [0.075, shY + 0.21 * Tz, 0.02], 8: [-0.075, shY + 0.21 * Tz, 0.02],
    11: [sx, shY, 0], 12: [-sx, shY, 0],
    13: [sx + 0.06, shY - 0.29 * A, 0], 14: [-sx - 0.06, shY - 0.29 * A, 0],
    15: [sx + 0.08, shY - 0.57 * A, 0], 16: [-sx - 0.08, shY - 0.57 * A, 0],
    23: [0.15, hipY, 0], 24: [-0.15, hipY, 0],
    25: [0.14, hipY - 0.45 * Lg, 0], 26: [-0.14, hipY - 0.45 * Lg, 0],
    27: [0.14, hipY - 0.87 * Lg, 0], 28: [-0.14, hipY - 0.87 * Lg, 0],
  };
  for (const key of Object.keys(b)) b[key] = b[key].map((v) => v * k);
  return { BASE: b, HIP_Y: hipY * k, THIGH: 0.45 * Lg * k, SHIN: 0.42 * Lg * k, UPPER_ARM: 0.29 * A * k, FOREARM: 0.28 * A * k };
}
// Arms hanging at the sides, matching BASE.
export const ARM_REST = Object.freeze({ a: 0.2, f: 0, a2: 0.07, f2: 0 });

function smoothBump(t, start, end) {
  if (t <= start || t >= end) return 0;
  const u = (t - start) / (end - start);
  return Math.sin(Math.PI * u) ** 2;
}

// Milestone 1 scripted motion. Returns {lean (radians, + toward player's
// right), drop (m), liftL, liftR (m)} at time t seconds.
export function motionAt(t) {
  if (t < 5) return { lean: 0, drop: 0, liftL: 0, liftR: 0 };
  const lean = t < 11 ? 0.26 * Math.sin(((t - 5) / 3) * Math.PI) : 0;
  const drop = 0.3 * (smoothBump(t, 12, 14.5) + smoothBump(t, 20, 22.5));
  let liftL = 0, liftR = 0;
  if (t >= 15 && t < 19) {
    const ph = (t - 15) * 1.8 * Math.PI; // ~108 steps per minute
    liftL = 0.18 * Math.max(0, Math.sin(ph));
    liftR = 0.18 * Math.max(0, -Math.sin(ph));
  }
  return { lean, drop, liftL, liftR };
}

// Unit direction for a limb segment; out = +1 for the left arm, -1 for the right.
function dir(a, f, out) {
  return [out * Math.sin(a) * Math.cos(f), -Math.cos(a) * Math.cos(f), -Math.sin(f)];
}

function pose3d(m, B = makeBody()) {
  const { BASE, HIP_Y, THIGH, SHIN, UPPER_ARM, FOREARM } = B;
  const pts = {};
  for (const [k, p] of Object.entries(BASE)) pts[k] = p.slice();

  for (const [arm, sh, el, wr, out] of [[m.armL, 11, 13, 15, 1], [m.armR, 12, 14, 16, -1]]) {
    if (!arm) continue;
    const s = pts[sh];
    const u = dir(arm.a, arm.f, out), d = dir(arm.a2, arm.f2, out);
    pts[el] = [s[0] + UPPER_ARM * u[0], s[1] + UPPER_ARM * u[1], s[2] + UPPER_ARM * u[2]];
    pts[wr] = [pts[el][0] + FOREARM * d[0], pts[el][1] + FOREARM * d[1], pts[el][2] + FOREARM * d[2]];
  }

  for (const [th, lift, knee, ankle, hip, across, shin, side] of [[m.thighL, m.liftL, 25, 27, 23, m.acrossL, m.shinL, 1], [m.thighR, m.liftR, 26, 28, 24, m.acrossR, m.shinR, -1]]) {
    if (th != null && (across || shin)) {
      // 0.11.0 kicks: the thigh swings across the body (across, radians) as it flexes (th), and
      // the shin extends forward from the knee (shin: 0 hangs down, pi/2 points at the camera)
      const h = pts[hip], ax = across || 0, sh = shin || 0;
      const u = [-side * Math.sin(ax), -Math.cos(th) * Math.cos(ax), -Math.sin(th) * Math.cos(ax)];
      pts[knee] = [h[0] + THIGH * u[0], h[1] + THIGH * u[1], h[2] + THIGH * u[2]];
      const d = [-side * Math.sin(ax) * 0.5, -Math.cos(sh), -Math.sin(sh)];
      const n = Math.hypot(...d);
      pts[ankle] = [pts[knee][0] + (SHIN * d[0]) / n, pts[knee][1] + (SHIN * d[1]) / n, pts[knee][2] + (SHIN * d[2]) / n];
    } else if (th != null) {
      const ky = HIP_Y - THIGH * Math.cos(th), kz = -THIGH * Math.sin(th);
      pts[knee] = [pts[knee][0], ky, kz];
      pts[ankle] = [pts[ankle][0], ky - SHIN, kz];
    } else if (lift) {
      pts[knee][1] += lift; pts[knee][2] -= lift * 0.8;
      pts[ankle][1] += lift; pts[ankle][2] -= lift * 0.8;
    }
  }

  const lean = m.lean || 0, drop = m.drop || 0, bob = m.bob || 0, shiftX = m.shiftX || 0;
  const yaw = m.yaw || 0, hipYaw = yaw * (m.hipYaw == null ? 0.3 : m.hipYaw);
  for (const [k, p] of Object.entries(pts)) {
    const i = Number(k);
    const a = UPPER.has(i) ? yaw : i === 23 || i === 24 ? hipYaw : 0;
    if (a) {
      // turn about the vertical axis through the hip midpoint; turning to the
      // player's right swings their front toward camera -x, so the left
      // shoulder comes toward the camera
      const x = p[0], z = p[2];
      p[0] = x * Math.cos(a) + z * Math.sin(a);
      p[2] = -x * Math.sin(a) + z * Math.cos(a);
    }
    if (i === 0 && m.headYaw) {
      const x = p[0], z = p[2], h = m.headYaw;
      p[0] = x * Math.cos(h) + z * Math.sin(h);
      p[2] = -x * Math.sin(h) + z * Math.cos(h);
    }
    if (UPPER.has(i) && lean) {
      // rotate upper body about the hip midpoint in the frontal plane;
      // player's right is camera -x, so a right lean moves points toward -x
      const dx = p[0], dy = p[1] - HIP_Y;
      const c = Math.cos(lean), s = Math.sin(lean);
      p[0] = dx * c - dy * s;
      p[1] = HIP_Y + dx * s + dy * c;
    }
    if (UPPER.has(i) || i === 23 || i === 24) p[1] -= drop;
    if (i === 25 || i === 26) { p[1] -= drop * 0.15; p[2] -= drop * 0.6; }
    p[0] += shiftX;
    p[1] += bob;
  }
  return pts;
}

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand) {
  return () => { const u = Math.max(rand(), 1e-9), v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
}

// opts: {w, h, f (px), distance (m), camHeight (m), offsetX (px),
//        mirrored, fps, seconds, noisePx, worldNoise (m), seed, motion, camYaw (radians)}
export function synthClip(opts) {
  const o = Object.assign({ f: 900, distance: 2.0, camHeight: 1.0, offsetX: 0, mirrored: false, fps: 30, seconds: 25, noisePx: 1.2, worldNoise: 0.008, seed: 7, motion: motionAt }, opts);
  const gauss = gaussian(mulberry32(o.seed));
  // separate stream so image noise is identical with or without world noise
  const wgauss = gaussian(mulberry32(o.seed + 1000));
  const B = makeBody(o.body);
  const frames = [];
  const n = Math.round(o.seconds * o.fps);
  for (let k = 0; k < n; k++) {
    const t = k / o.fps;
    const p3 = pose3d(o.motion(t), B);
    // camYaw (0.12.0): the camera swung around the player about the vertical through the hips, in
    // radians (-pi/2: at the player's right, a side camera; +pi/2 at their left)
    if (o.camYaw) {
      const cx = (p3[23][0] + p3[24][0]) / 2, cz = (p3[23][2] + p3[24][2]) / 2, c = Math.cos(o.camYaw), sn = Math.sin(o.camYaw);
      for (const k of Object.keys(p3)) { const q = p3[k], x = q[0] - cx, z = q[2] - cz; p3[k] = [cx + x * c + z * sn, q[1], cz - x * sn + z * c]; }
    }
    // MediaPipe world landmarks: meters, origin at the hip midpoint, y down
    const hx = (p3[23][0] + p3[24][0]) / 2, hy = (p3[23][1] + p3[24][1]) / 2, hz = (p3[23][2] + p3[24][2]) / 2;
    const lm = [];
    const wl = [];
    for (let i = 0; i < 33; i++) {
      const p = p3[i] || p3[0];
      const Z = o.distance + p[2];
      let u = o.w / 2 + o.offsetX + (o.f * p[0]) / Z + gauss() * o.noisePx;
      const v = o.h / 2 - (o.f * (p[1] - o.camHeight)) / Z + gauss() * o.noisePx;
      if (o.mirrored) u = o.w - u;
      const inFrame = u >= 0 && u <= o.w && v >= 0 && v <= o.h;
      const vis = p3[i] ? (inFrame ? 0.99 : 0.1) : 0.2;
      lm.push([u / o.w, v / o.h, 0, vis]);
      const wn = o.worldNoise;
      wl.push([p[0] - hx + wgauss() * wn, -(p[1] - hy) + wgauss() * wn, p[2] - hz + wgauss() * wn, vis]);
    }
    frames.push({ t: Math.round(t * 1000 * 10) / 10, w: o.w, h: o.h, lm, wl });
  }
  const { motion, ...meta } = o;
  return {
    format: 'rep-engine-clip',
    version: 1,
    meta: { synthetic: true, orientation: o.w >= o.h ? 'landscape' : 'portrait', ...meta },
    frames,
  };
}

// ---- move segments -------------------------------------------------------

const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const lerpArm = (a, b, k) => ({ a: a.a + (b.a - a.a) * k, f: a.f + (b.f - a.f) * k, a2: a.a2 + (b.a2 - a.a2) * k, f2: a.f2 + (b.f2 - a.f2) * k });
// 0 -> 1 over rampS at the start, 1 -> 0 over rampS at the end
const envelope = (t, start, end, rampS) => Math.min(ease((t - start) / rampS), ease((end - t) / rampS));

// Stepping in place: one leg lifts per step, opposite arm swings forward.
// opts: spm, thigh (radians at the top of the lift), swing (arm flexion),
//       bob (m dip mid-step), sway (m sideways weight shift)
function stepping(start, end, opts) {
  const o = Object.assign({ spm: 110, thigh: 0.87, swing: 0.35, bob: 0, sway: 0, lift: 0.85 }, opts);
  const period = 60 / o.spm;
  const steps = [];
  for (let k = 0; start + k * period + o.lift * period <= end; k++) steps.push(start + k * period);
  return {
    start, end, kind: o.kind || 'step',
    expected: { step: steps.length },
    apply(t, m) {
      const k = Math.floor((t - start) / period);
      if (k < 0 || k >= steps.length) return;
      const u = (t - steps[k]) / (o.lift * period);
      const leg = k % 2 === 0 ? 'L' : 'R';
      const s = u > 0 && u < 1 ? Math.sin(Math.PI * u) : 0;
      m['thigh' + leg] = o.thigh * s;
      m['thigh' + (leg === 'L' ? 'R' : 'L')] = 0;
      const ph = Math.sin(Math.PI * ((t - steps[k]) / period));
      // arm opposite the lifting leg swings forward, elbow bent
      const fwd = o.swing * ph * (leg === 'L' ? -1 : 1);
      m.armL = m.armL || { a: ARM_REST.a, f: fwd, a2: ARM_REST.a2, f2: fwd + 0.6 * Math.abs(o.swing) };
      m.armR = m.armR || { a: ARM_REST.a, f: -fwd, a2: ARM_REST.a2, f2: -fwd + 0.6 * Math.abs(o.swing) };
      m.bob = (m.bob || 0) - o.bob * s * s;
      m.shiftX = (m.shiftX || 0) + o.sway * ph * (leg === 'L' ? -1 : 1);
    },
  };
}

// Arm pose held between start and end with eased ramps in and out.
function armPose(start, end, { left, right, rampS = 0.25, expected = {} }) {
  return {
    start, end, kind: 'arms', expected,
    apply(t, m) {
      const k = envelope(t, start, end, rampS);
      if (left) m.armL = lerpArm(ARM_REST, typeof left === 'function' ? left(t) : left, k);
      if (right) m.armR = lerpArm(ARM_REST, typeof right === 'function' ? right(t) : right, k);
    },
  };
}

const POINT = { a: Math.PI / 2, f: 0, a2: Math.PI / 2, f2: 0 };
// Fighting poses. Guard: elbows down and in front, fists up by the cheeks.
export const GUARD = { a: 0.25, f: 0.55, a2: Math.PI + 0.55, f2: 0.25 };
export const HIGH_GUARD = { a: 0.2, f: 1.1, a2: Math.PI + 0.35, f2: 0.35 };
const STRAIGHT = { a: Math.PI / 2 - 0.12, f: Math.PI / 2 - 0.15, a2: Math.PI / 2 - 0.08, f2: Math.PI / 2 - 0.05 }; // fist at the camera, shoulder height
const HOOK_OUT = { a: Math.PI / 2 - 0.1, f: 0.1, a2: Math.PI / 2 - 0.1, f2: 0.1 + Math.PI / 2 }; // elbow up and out, bent 90
const HOOK_IN = { a: Math.PI / 2 - 0.1, f: 1.0, a2: Math.PI / 2 - 0.1, f2: 1.0 + Math.PI / 2 }; // swept across the front
const UPPER_LOW = { a: 0.15, f: 0.25, a2: 0.6, f2: 1.4 };              // fist dropped to the belly, forearm forward
const UPPER_HIGH = { a: 0.2, f: 1.0, a2: Math.PI - 0.2, f2: 0.5 };    // driven up to the chin in front
const DOWN = { a: 0.35, f: 0.75, a2: 0.35, f2: 0.75 };                 // straight arm down and forward
const ease01 = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
// piecewise path through arm poses: keys [[t, pose], ...] relative to the start
function armPath(keys) {
  return (dt) => {
    if (dt <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      if (dt <= keys[i][0]) {
        const [t0, p0] = keys[i - 1], [t1, p1] = keys[i];
        return lerpArm(p0, p1, ease01((dt - t0) / (t1 - t0)));
      }
    }
    return keys[keys.length - 1][1];
  };
}
const PUNCH_PATHS = {
  straight: [[0, GUARD], [0.12, STRAIGHT], [0.18, STRAIGHT], [0.4, GUARD]],
  hook: [[0, GUARD], [0.1, HOOK_OUT], [0.24, HOOK_IN], [0.5, GUARD]],
  uppercut: [[0, GUARD], [0.12, UPPER_LOW], [0.26, UPPER_HIGH], [0.5, GUARD]],
  down: [[0, GUARD], [0.14, DOWN], [0.2, DOWN], [0.45, GUARD]],
  // 0.16.0, the rest of the clock (Mark: what real strikes cover which hours): a straight to the
  // body, a hook to the body, an overhand looping over the top and down, a shovel hook from low on
  // the side up toward the chin
  bodyStraight: [[0, GUARD], [0.12, { a: 0.15, f: 0.95, a2: 0.15, f2: 1.1 }], [0.18, { a: 0.15, f: 0.95, a2: 0.15, f2: 1.1 }], [0.4, GUARD]],
  bodyHook: [[0, GUARD], [0.1, { a: 1.0, f: 0.15, a2: 0.6, f2: 1.2 }], [0.24, { a: 1.0, f: 0.9, a2: 0.6, f2: 1.2 }], [0.5, GUARD]],
  overhand: [[0, GUARD], [0.1, { a: 2.0, f: 0.5, a2: 2.1, f2: 1.5 }], [0.26, { a: 1.35, f: 1.2, a2: 1.0, f2: 2.1 }], [0.5, GUARD]],
  shovel: [[0, GUARD], [0.12, { a: 0.55, f: 0.25, a2: 0.9, f2: 1.3 }], [0.28, { a: 0.95, f: 0.8, a2: 2.0, f2: 1.9 }], [0.55, GUARD]],
};
const OVERHEAD = { a: 2.95, f: 0, a2: 3.05, f2: 0 };
// 0.9.0: punches as people actually throw them on the first camera sessions (Mark 10/20: the
// warm-up missed hooks and uppercuts): a hook with the elbow lower and less wound out, a short
// hook, and an uppercut that only dips to the chest
const LOOSE_PATHS = {
  hook: [[0, GUARD], [0.1, { a: 1.05, f: 0.35, a2: 1.05, f2: 1.85 }], [0.26, { a: 1.05, f: 0.95, a2: 1.05, f2: 2.45 }], [0.55, GUARD]],
  shortHook: [[0, GUARD], [0.08, { a: 1.2, f: 0.5, a2: 1.2, f2: 2.0 }], [0.2, { a: 1.2, f: 1.0, a2: 1.2, f2: 2.5 }], [0.45, GUARD]],
  uppercut: [[0, GUARD], [0.1, { a: 0.2, f: 0.45, a2: 0.4, f2: 1.0 }], [0.24, UPPER_HIGH], [0.5, GUARD]],
};
// 0.10.0: a tired, low guard (fists at the belly, elbows down; under the rules' guard height), and
// a wide hook thrown nearly straight-armed (the rules call it a straight)
export const LOW_GUARD = { a: 0.1, f: 0.3, a2: Math.PI + 0.4, f2: 1.9 };
const WIDE_HOOK = [[0, GUARD], [0.12, { a: Math.PI / 2 - 0.1, f: 0.25, a2: Math.PI / 2 - 0.1, f2: 0.5 }], [0.28, { a: Math.PI / 2 - 0.1, f: 1.2, a2: Math.PI / 2 - 0.1, f2: 1.5 }], [0.55, GUARD]];
// arms moving the whole time between start and end (a quick ramp in and out from hanging)
function armsMoving(start, end, fnL, fnR) {
  return {
    start, end, kind: 'arms', expected: {},
    apply(t, m) {
      const k = Math.max(0, Math.min(1, (t - start) / 0.3, (end - t) / 0.3));
      if (fnL) m.armL = lerpArm(ARM_REST, fnL(t - start), k);
      if (fnR) m.armR = lerpArm(ARM_REST, fnR(t - start), k);
    },
  };
}

export const moves = {
  march: (start, end, opts) => stepping(start, end, Object.assign({ spm: 110, thigh: 0.87, swing: 0.35 }, opts)),
  // light walk in place: lower lift, hip bob and side-to-side weight shift
  walk: (start, end, opts) => stepping(start, end, Object.assign({ spm: 100, thigh: 0.66, swing: 0.3, bob: 0.025, sway: 0.02 }, opts)),
  highKnees: (start, end, opts) => {
    const seg = stepping(start, end, Object.assign({ spm: 170, thigh: 1.4, swing: 0.6 }, opts));
    seg.expected.run_start = 1;
    seg.expected.run_end = 1;
    return seg;
  },
  // turn the torso to one side and back, peaking at deg (side: 'left' | 'right')
  turn: (start, end, side, deg = 50) => ({
    start, end, kind: 'turn', expected: { ['turn_' + side]: 1 },
    apply(t, m) { m.yaw = (m.yaw || 0) + (side === 'right' ? 1 : -1) * (deg * Math.PI / 180) * envelope(t, start, end, (end - start) / 3); },
  }),
  // hold the torso turned at deg (signed, + = right) between start and end
  // after a quick ramp; headDeg turns the head on top of it
  holdTurn: (start, end, deg, rampS = 0.4, headDeg = 0) => ({
    start, end, kind: 'turn', expected: {},
    apply(t, m) {
      const k = envelope(t, start, end, rampS);
      m.yaw = (m.yaw || 0) + (deg * Math.PI / 180) * k;
      m.headYaw = (m.headYaw || 0) + (headDeg * Math.PI / 180) * k;
    },
  }),
  // lean the upper body to one side and back (side: 'left' | 'right')
  lean: (start, end, side, angle = 0.26) => ({
    start, end, kind: 'lean', expected: { ['lean_' + side]: 1 },
    apply(t, m) { m.lean = (side === 'right' ? 1 : -1) * angle * envelope(t, start, end, (end - start) / 2.5); },
  }),
  // a weave (0.13.0): the head slips to one side (inS), drops through a U under to the other side
  // (uS, depth m at the bottom), then comes back to the middle (outS). jumpAt (0..1 along the U):
  // drive up out of it into a hop of jump m instead of finishing the U
  weave: (start, from, opts = {}) => {
    const o = Object.assign({ angle: 0.35, depth: 0.12, inS: 0.35, uS: 0.8, outS: 0.4, jumpAt: null, jump: 0.14 }, opts);
    const sgn = from === 'right' ? 1 : -1, sm = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
    const end = start + o.inS + o.uS + o.outS;
    return {
      start, end, kind: 'weave', expected: { weave: o.jumpAt == null ? 1 : 0 },
      apply(t, m) {
        const u = t - start;
        let lean = 0, drop = 0;
        if (u < o.inS) lean = sgn * o.angle * sm(u / o.inS);
        else if (u < o.inS + o.uS) {
          const k = (u - o.inS) / o.uS;
          if (o.jumpAt != null && k > o.jumpAt) {
            // up out of the dip into a hop, the head back over the hips
            const j = (u - o.inS - o.jumpAt * o.uS) / 0.3;
            const base = o.depth * Math.sin(Math.PI * o.jumpAt);
            lean = sgn * o.angle * Math.cos(Math.PI * o.jumpAt) * (1 - sm(j));
            drop = j < 1 ? base - (base + o.jump) * sm(j) : -o.jump * (1 - sm((j - 1) * 1.5));
          } else { lean = sgn * o.angle * Math.cos(Math.PI * k); drop = o.depth * Math.sin(Math.PI * k); }
        } else if (o.jumpAt == null) lean = -sgn * o.angle * (1 - sm((u - o.inS - o.uS) / o.outS));
        m.lean = (m.lean || 0) + lean;
        m.drop = (m.drop || 0) + drop;
      },
    };
  },
  point: (start, end, side) => armPose(start, end, { [side]: POINT, expected: { ['point_' + side]: 1 } }),
  turnAround: (start, end) => armPose(start, end, { left: OVERHEAD, right: OVERHEAD, rampS: 0.35, expected: { turn_around: 1 } }),
  // upper arm out, forearm up and swaying side to side at hz
  wave: (start, end, hand, hz = 1.5) => armPose(start, end, {
    [hand]: (t) => ({ a: Math.PI / 2, f: 0.1, a2: Math.PI + 0.45 * Math.sin(2 * Math.PI * hz * (t - start)), f2: 0.1 }),
    rampS: 0.3,
    expected: { wave: 1 },
  }),
  // a bound out to the player's side and back (whole body sideways, a little hop)
  bound: (start, side, dist = 0.45, outS = 0.3, holdS = 0.1, backS = 0.35) => ({
    start, end: start + outS + holdS + backS, kind: 'body', expected: { bound: 1 },
    apply(t, m) {
      const u = t - start;
      let k = 0;
      if (u > 0 && u < outS) k = Math.sin((Math.PI / 2) * (u / outS)) ** 2;
      else if (u >= outS && u < outS + holdS) k = 1;
      else if (u >= outS + holdS && u < outS + holdS + backS) k = Math.cos((Math.PI / 2) * ((u - outS - holdS) / backS)) ** 2;
      m.shiftX = (m.shiftX || 0) + (side === 'right' ? -1 : 1) * dist * k; // the player's right is camera -x
      m.bob = (m.bob || 0) + 0.04 * Math.sin(Math.PI * Math.min(1, Math.max(0, u / outS)));
    },
  }),
  // one fist up at the guard (the other hand down): a hand by the ear covers that side
  guardHand: (start, end, hand) => armPose(start, end, { [hand]: GUARD, rampS: 0.2 }),
  // both fists up at the guard
  guard: (start, end) => armPose(start, end, { left: GUARD, right: GUARD, rampS: 0.2 }),
  // a high guard: elbows in, fists up by the brow, in front of the face
  highGuard: (start, end) => armPose(start, end, { left: HIGH_GUARD, right: HIGH_GUARD, rampS: 0.2 }),
  // fighting stance: guard up and the torso bladed deg toward the lead side
  // (orthodox leads with the left shoulder, so the torso turns to the right)
  stance: (start, end, kind = 'orthodox', deg = 25) => ({
    start, end, kind: 'arms', expected: {},
    apply(t, m) {
      const k = envelope(t, start, end, 0.3);
      m.yaw = (m.yaw || 0) + (kind === 'orthodox' ? 1 : -1) * (deg * Math.PI / 180) * k;
      m.armL = m.armL || lerpArm(ARM_REST, GUARD, k);
      m.armR = m.armR || lerpArm(ARM_REST, GUARD, k);
    },
  }),
  // one punch thrown from the guard at t: type straight | hook | uppercut | down
  // 0.10.0: a textbook punch thrown from (and back to) another guard pose, e.g. LOW_GUARD
  punchFrom: (t0, hand, type, from) => {
    const keys = PUNCH_PATHS[type].map(([k, p], i, all) => [k, i === 0 || i === all.length - 1 ? from : p]);
    const path = armPath(keys), dur = keys[keys.length - 1][0];
    return { start: t0, end: t0 + dur, kind: 'strike', expected: { strike: 1 }, apply(t, m) { m[hand === 'left' ? 'armL' : 'armR'] = path(t - t0); } };
  },
  wideHook: (t0, hand) => {
    const path = armPath(WIDE_HOOK), dur = WIDE_HOOK[WIDE_HOOK.length - 1][0];
    return { start: t0, end: t0 + dur, kind: 'strike', expected: { strike: 1 }, apply(t, m) { m[hand === 'left' ? 'armL' : 'armR'] = path(t - t0); } };
  },
  // 0.11.0 kicks, one leg while the other stays planted (leg: 'left' | 'right'):
  // a teep: the knee comes up to the chest and the foot pushes out at the camera
  teep: (t0, leg, dur = 0.7) => ({
    start: t0, end: t0 + dur, kind: 'kick', expected: { teep: 1 },
    apply(t, m) {
      const u = (t - t0) / dur, k = Math.sin(Math.PI * Math.min(1, Math.max(0, u)));
      const ext = Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, (u - 0.25) / 0.5))));
      m[leg === 'left' ? 'thighL' : 'thighR'] = 1.35 * k;
      m[leg === 'left' ? 'shinL' : 'shinR'] = 0.2 + 1.2 * ext;
      m.lean = (m.lean || 0);
    },
  }),
  // a rear low kick (Dutch style): the hips turn and the rear leg swings across at thigh height
  lowKick: (t0, leg, dur = 0.65) => ({
    start: t0, end: t0 + dur, kind: 'kick', expected: { low_kick: 1 },
    apply(t, m) {
      const u = (t - t0) / dur, k = Math.sin(Math.PI * Math.min(1, Math.max(0, u)));
      m[leg === 'left' ? 'thighL' : 'thighR'] = 0.75 * k;
      m[leg === 'left' ? 'acrossL' : 'acrossR'] = 0.75 * k;
      m[leg === 'left' ? 'shinL' : 'shinR'] = 0.6 * k;
      m.yaw = (m.yaw || 0) + (leg === 'right' ? -1 : 1) * 0.6 * k;
    },
  }),
  // a knee: the rear knee driven straight up
  knee: (t0, leg, dur = 0.5) => ({
    start: t0, end: t0 + dur, kind: 'kick', expected: { knee: 1 },
    apply(t, m) {
      const u = (t - t0) / dur, k = Math.sin(Math.PI * Math.min(1, Math.max(0, u)));
      m[leg === 'left' ? 'thighL' : 'thighR'] = 1.45 * k;
    },
  }),
  // both arms held in a pose (e.g. LOW_GUARD) between start and end
  holdArms: (start, end, pose) => armPose(start, end, { left: pose, right: pose, rampS: 0.2 }),
  // 0.9.0: a looser punch ('hook', 'shortHook', 'uppercut'; see LOOSE_PATHS)
  loosePunch: (t0, hand, type) => {
    const path = armPath(LOOSE_PATHS[type]);
    const dur = LOOSE_PATHS[type][LOOSE_PATHS[type].length - 1][0];
    return { start: t0, end: t0 + dur, kind: 'strike', expected: { strike: 1 }, apply(t, m) { m[hand === 'left' ? 'armL' : 'armR'] = path(t - t0); } };
  },
  // not punches (Mark 10/20: waving the arms back and forth threw hooks and overhands):
  // forearms wiping side to side in front of the face, straight arms swinging across the
  // chest, and bent arms swinging out and in at shoulder height
  flail: (start, end, hz = 2) => armsMoving(start, end,
    (u) => ({ a: 0.4, f: 0.9, a2: Math.PI + 0.9 * Math.sin(2 * Math.PI * hz * u), f2: 0.3 }),
    (u) => ({ a: 0.4, f: 0.9, a2: Math.PI - 0.9 * Math.sin(2 * Math.PI * hz * u), f2: 0.3 })),
  armSwing: (start, end, hz = 1.2) => armsMoving(start, end,
    (u) => { const a = 0.4 + Math.sin(2 * Math.PI * hz * u); return { a, f: 1.0, a2: a, f2: 1.0 }; },
    (u) => { const a = 0.4 - Math.sin(2 * Math.PI * hz * u); return { a, f: 1.0, a2: a, f2: 1.0 }; }),
  bentSwing: (start, end, hz = 1.5) => armsMoving(start, end,
    (u) => { const f = 0.3 + 0.8 * (0.5 + 0.5 * Math.sin(2 * Math.PI * hz * u)); return { a: 1.2, f, a2: 1.2, f2: f + 1.5 }; },
    (u) => { const f = 0.3 + 0.8 * (0.5 - 0.5 * Math.sin(2 * Math.PI * hz * u)); return { a: 1.2, f, a2: 1.2, f2: f + 1.5 }; }),
  punch: (t0, hand, type = 'straight') => {
    const path = armPath(PUNCH_PATHS[type]);
    const dur = PUNCH_PATHS[type][PUNCH_PATHS[type].length - 1][0];
    return {
      start: t0, end: t0 + dur, kind: 'strike', expected: { strike: 1 },
      apply(t, m) { m[hand === 'left' ? 'armL' : 'armR'] = path(t - t0); },
    };
  },
  // squat: hips drop by depth (m) over downS, hold, back up over upS
  squat: (start, depth = 0.3, downS = 0.5, holdS = 0.6, upS = 0.6) => ({
    start, end: start + downS + holdS + upS, kind: 'level', expected: { squat: 1 },
    apply(t, m) {
      const u = t - start;
      const k = u < downS ? ease01(u / downS) : u < downS + holdS ? 1 : 1 - ease01((u - downS - holdS) / upS);
      m.drop = (m.drop || 0) + depth * k;
    },
  }),
  // hold a crouch of depth (m) between start and end
  crouch: (start, end, depth = 0.2) => ({
    start, end, kind: 'level', expected: {},
    apply(t, m) { m.drop = (m.drop || 0) + depth * envelope(t, start, end, 0.3); },
  }),
  // fast fast hip drop and an explosive drive back up (the double leg)
  shot: (start, depth = 0.3, downS = 0.3, holdS = 0.15, upS = 0.25) => {
    const seg = moves.squat(start, depth, downS, holdS, upS);
    seg.expected = { squat: 1, drive_up: 1 };
    return seg;
  },
  // fast horizontal arm sweep at shoulder height, out to the side and across
  // the front, wrist peaking near 7 m/s (stands in for a hook or swipe in the
  // steering suppression tests)
  swipe: (start, end, hand) => armPose(start, end, {
    [hand]: (t) => {
      const f = 0.8 - 0.8 * Math.cos(2 * Math.PI * 2.5 * (t - start));
      return { a: Math.PI / 2, f, a2: Math.PI / 2, f2: f + 0.3 };
    },
    rampS: 0.1,
  }),
};

// Combine segments into one motion. Locomotion and lean segments add up;
// arm gestures override the arm swing from stepping.
export function scriptMotion(segments) {
  const expected = {};
  for (const s of segments) for (const [k, v] of Object.entries(s.expected || {})) expected[k] = (expected[k] || 0) + v;
  const order = (s) => (s.kind === 'arms' ? 0 : 1);
  const sorted = segments.slice().sort((a, b) => order(a) - order(b));
  const motion = (t) => {
    const m = {};
    for (const s of sorted) if (t >= s.start && t <= s.end) s.apply(t, m);
    return m;
  };
  return { motion, expected, seconds: Math.max(...segments.map((s) => s.end)) + 1.5 };
}
