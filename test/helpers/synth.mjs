// Synthetic clip generator. Builds one 3D body motion and projects it
// through a pinhole camera into any frame size, so the same movement can be
// "recorded" in portrait, landscape, mirrored, off-center or farther away.
// Output matches the recorded clip format (rep-engine-clip v1).
//
// A motion is a function of time returning a pose description:
//   lean   upper body tilt (radians, + toward the player's right)
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
  0: [0, 1.65, 0],          // nose
  11: [0.2, 1.45, 0], 12: [-0.2, 1.45, 0],   // shoulders L, R
  13: [0.26, 1.16, 0], 14: [-0.26, 1.16, 0], // elbows
  15: [0.28, 0.88, 0], 16: [-0.28, 0.88, 0], // wrists
  23: [0.15, 0.95, 0], 24: [-0.15, 0.95, 0], // hips
  25: [0.14, 0.5, 0], 26: [-0.14, 0.5, 0],   // knees
  27: [0.14, 0.08, 0], 28: [-0.14, 0.08, 0], // ankles
};
const UPPER = new Set([0, 11, 12, 13, 14, 15, 16]);
const HIP_Y = 0.95;
const THIGH = 0.45, SHIN = 0.42, UPPER_ARM = 0.29, FOREARM = 0.28;
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

function pose3d(m) {
  const pts = {};
  for (const [k, p] of Object.entries(BASE)) pts[k] = p.slice();

  for (const [arm, sh, el, wr, out] of [[m.armL, 11, 13, 15, 1], [m.armR, 12, 14, 16, -1]]) {
    if (!arm) continue;
    const s = pts[sh];
    const u = dir(arm.a, arm.f, out), d = dir(arm.a2, arm.f2, out);
    pts[el] = [s[0] + UPPER_ARM * u[0], s[1] + UPPER_ARM * u[1], s[2] + UPPER_ARM * u[2]];
    pts[wr] = [pts[el][0] + FOREARM * d[0], pts[el][1] + FOREARM * d[1], pts[el][2] + FOREARM * d[2]];
  }

  for (const [th, lift, knee, ankle] of [[m.thighL, m.liftL, 25, 27], [m.thighR, m.liftR, 26, 28]]) {
    if (th != null) {
      const ky = HIP_Y - THIGH * Math.cos(th), kz = -THIGH * Math.sin(th);
      pts[knee] = [pts[knee][0], ky, kz];
      pts[ankle] = [pts[ankle][0], ky - SHIN, kz];
    } else if (lift) {
      pts[knee][1] += lift; pts[knee][2] -= lift * 0.8;
      pts[ankle][1] += lift; pts[ankle][2] -= lift * 0.8;
    }
  }

  const lean = m.lean || 0, drop = m.drop || 0, bob = m.bob || 0, shiftX = m.shiftX || 0;
  for (const [k, p] of Object.entries(pts)) {
    const i = Number(k);
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
//        mirrored, fps, seconds, noisePx, worldNoise (m), seed, motion}
export function synthClip(opts) {
  const o = Object.assign({ f: 900, distance: 2.0, camHeight: 1.0, offsetX: 0, mirrored: false, fps: 30, seconds: 25, noisePx: 1.2, worldNoise: 0.008, seed: 7, motion: motionAt }, opts);
  const gauss = gaussian(mulberry32(o.seed));
  // separate stream so image noise is identical with or without world noise
  const wgauss = gaussian(mulberry32(o.seed + 1000));
  const frames = [];
  const n = Math.round(o.seconds * o.fps);
  for (let k = 0; k < n; k++) {
    const t = k / o.fps;
    const p3 = pose3d(o.motion(t));
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
const OVERHEAD = { a: 2.95, f: 0, a2: 3.05, f2: 0 };

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
  // lean the upper body to one side and back (side: 'left' | 'right')
  lean: (start, end, side, angle = 0.26) => ({
    start, end, kind: 'lean', expected: { ['lean_' + side]: 1 },
    apply(t, m) { m.lean = (side === 'right' ? 1 : -1) * angle * envelope(t, start, end, (end - start) / 2.5); },
  }),
  point: (start, end, side) => armPose(start, end, { [side]: POINT, expected: { ['point_' + side]: 1 } }),
  turnAround: (start, end) => armPose(start, end, { left: OVERHEAD, right: OVERHEAD, rampS: 0.35, expected: { turn_around: 1 } }),
  // upper arm out, forearm up and swaying side to side at hz
  wave: (start, end, hand, hz = 1.5) => armPose(start, end, {
    [hand]: (t) => ({ a: Math.PI / 2, f: 0.1, a2: Math.PI + 0.45 * Math.sin(2 * Math.PI * hz * (t - start)), f2: 0.1 }),
    rampS: 0.3,
    expected: { wave: 1 },
  }),
  // fast sideways arm sweep at shoulder height (stands in for a hook in
  // the lean suppression test)
  swipe: (start, end, hand) => armPose(start, end, {
    [hand]: (t) => ({ a: 1.45, f: 0.9, a2: 1.45 + 0.9 * Math.sin(2 * Math.PI * 2.5 * (t - start)), f2: 1.0 }),
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
