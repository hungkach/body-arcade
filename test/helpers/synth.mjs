// Synthetic clip generator. Builds one 3D body motion and projects it
// through a pinhole camera into any frame size, so the same movement can be
// "recorded" in portrait, landscape, mirrored, off-center or farther away.
// Output matches the recorded clip format (rep-engine-clip v1).

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

function smoothBump(t, start, end) {
  if (t <= start || t >= end) return 0;
  const u = (t - start) / (end - start);
  return Math.sin(Math.PI * u) ** 2;
}

// Scripted motion. Returns {lean (radians, + toward player's right),
// drop (m), liftL, liftR (m)} at time t seconds.
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

function pose3d(t) {
  const m = motionAt(t);
  const pts = {};
  for (const [k, p] of Object.entries(BASE)) {
    const i = Number(k);
    let [x, y, z] = p;
    if (UPPER.has(i) && m.lean) {
      // rotate upper body about the hip midpoint in the frontal plane;
      // player's right is camera -x, so a right lean moves points toward -x
      const dx = x, dy = y - HIP_Y;
      const c = Math.cos(m.lean), s = Math.sin(m.lean);
      x = dx * c - dy * s;
      y = HIP_Y + dx * s + dy * c;
    }
    if (i === 25 || i === 27) { y += m.liftL; z -= m.liftL * 0.8; }
    if (i === 26 || i === 28) { y += m.liftR; z -= m.liftR * 0.8; }
    if (UPPER.has(i) || i === 23 || i === 24) y -= m.drop;
    if (i === 25 || i === 26) { y -= m.drop * 0.15; z -= m.drop * 0.6; }
    pts[i] = [x, y, z];
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

// opts: {w, h, f (px), distance (m), camHeight (m), offsetX (px),
//        mirrored, fps, seconds, noisePx, seed}
export function synthClip(opts) {
  const o = Object.assign({ f: 900, distance: 2.0, camHeight: 1.0, offsetX: 0, mirrored: false, fps: 30, seconds: 25, noisePx: 1.2, seed: 7 }, opts);
  const rand = mulberry32(o.seed);
  const gauss = () => { const u = Math.max(rand(), 1e-9), v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const frames = [];
  const n = Math.round(o.seconds * o.fps);
  for (let k = 0; k < n; k++) {
    const t = k / o.fps;
    const p3 = pose3d(t);
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
      wl.push([p[0], -(p[1] - HIP_Y), p[2], vis]);
    }
    frames.push({ t: Math.round(t * 1000 * 10) / 10, w: o.w, h: o.h, lm, wl });
  }
  return {
    format: 'rep-engine-clip',
    version: 1,
    meta: { synthetic: true, orientation: o.w >= o.h ? 'landscape' : 'portrait', ...o },
    frames,
  };
}
