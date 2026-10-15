// Milestone 1 done-when: the same movement recorded in portrait and in
// landscape produces the same body-unit signals. Also covers mirrored feeds,
// an off-center player and a player standing farther back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RE } from './helpers/engine.mjs';
import { synthClip, motionAt } from './helpers/synth.mjs';

const VARIANTS = {
  portrait: { w: 720, h: 1280 },
  landscape: { w: 1280, h: 720, offsetX: 180, seed: 99 },
  portraitMirrored: { w: 720, h: 1280, mirrored: true, seed: 31 },
  landscapeFar: { w: 1280, h: 720, distance: 2.6, offsetX: -120, seed: 5 },
  tablet: { w: 1024, h: 768, f: 760, seed: 12 },
};

// Run a clip through a headless engine: calibrate, then record every signal.
function run(clip, preset) {
  RE.profiles.clear(preset, clip.meta.orientation);
  const engine = RE.create({ headless: true, preset });
  let cal = null;
  engine.calibrate().then((c) => { cal = c; });
  const trace = new Map();
  engine.on('calibrated', (e) => { cal = e.cal; });
  RE.replaySync(clip, (f) => {
    engine._ingest(f);
    const d = engine.debug();
    if (d.cal && d.rawSignals && d.rawSignals.lean != null) {
      trace.set(f.t, {
        lean: d.rawSignals.lean,
        squat: d.rawSignals.squatDepth,
        kneeL: d.rawSignals.kneeLiftL,
        kneeR: d.rawSignals.kneeLiftR,
        ratio: d.rawSignals.shoulderRatio,
        snapLean: d.signals.lean,
      });
    }
  });
  return { engine, cal: cal || engine.debug().cal, trace };
}

function maxDiff(a, b, key, fromMs = 6000) {
  let worst = 0, at = null;
  for (const [t, va] of a.trace) {
    if (t < fromMs) continue;
    const vb = b.trace.get(t);
    if (!vb) continue;
    const d = Math.abs(va[key] - vb[key]);
    if (d > worst) { worst = d; at = t; }
  }
  return { worst, at };
}

const runs = {};
for (const [name, opts] of Object.entries(VARIANTS)) {
  runs[name] = run(synthClip(opts), 'living_room');
}

test('every variant calibrates within 5 seconds of standing still', () => {
  for (const [name, r] of Object.entries(runs)) {
    assert.ok(r.cal, `${name} never calibrated`);
    const first = Math.min(...r.trace.keys());
    assert.ok(first <= 4500, `${name} calibrated late at ${first} ms`);
  }
});

test('anatomical side is detected from the shoulders, mirrored or not', () => {
  assert.equal(runs.portrait.cal.side, -1);
  assert.equal(runs.portraitMirrored.cal.side, 1);
  assert.equal(runs.portrait.cal.orientation, 'portrait');
  assert.equal(runs.landscape.cal.orientation, 'landscape');
});

test('portrait and landscape give the same signals (done-when)', () => {
  const a = runs.portrait, b = runs.landscape;
  for (const [key, tol] of [['lean', 0.03], ['squat', 0.03], ['kneeL', 0.03], ['kneeR', 0.03], ['ratio', 0.03]]) {
    const { worst, at } = maxDiff(a, b, key);
    assert.ok(worst < tol, `${key} differs by ${worst.toFixed(4)} at ${at} ms`);
  }
});

test('a mirrored feed gives the same signals, same signs', () => {
  for (const key of ['lean', 'squat', 'kneeL', 'kneeR']) {
    const { worst, at } = maxDiff(runs.portrait, runs.portraitMirrored, key);
    assert.ok(worst < 0.03, `${key} differs by ${worst.toFixed(4)} at ${at} ms`);
  }
});

test('distance and tablet framing stay within tolerance', () => {
  for (const other of ['landscapeFar', 'tablet']) {
    for (const key of ['lean', 'squat']) {
      const { worst, at } = maxDiff(runs.portrait, runs[other], key);
      assert.ok(worst < 0.04, `${other} ${key} differs by ${worst.toFixed(4)} at ${at} ms`);
    }
  }
});

test('signals track the scripted movement', () => {
  const tr = runs.portrait.trace;
  const near = (ms) => {
    let best = null;
    for (const [t, v] of tr) if (best === null || Math.abs(t - ms) < Math.abs(best[0] - ms)) best = [t, v];
    return best[1];
  };
  // standing: everything near zero
  const still = near(4800);
  assert.ok(Math.abs(still.lean) < 0.05, `standing lean ${still.lean}`);
  assert.ok(still.squat < 0.05, `standing squat ${still.squat}`);
  // peak right lean at 6.5 s (motion lean > 0 means player's right)
  assert.ok(motionAt(6.5).lean > 0.2);
  assert.ok(near(6500).lean > 0.25, `right lean reads ${near(6500).lean}`);
  // peak left lean at 9.5 s
  assert.ok(near(9500).lean < -0.25, `left lean reads ${near(9500).lean}`);
  // squat bottom at 13.25 s: 0.3 m hip drop on a 0.5 m torso is about 0.6 T
  assert.ok(near(13250).squat > 0.9, `squat reads ${near(13250).squat}`);
  // marching: left knee peaks at 15.28 s, right at 15.83 s. Read 50 ms
  // later to allow for smoothing lag (about 50 ms at default settings).
  assert.ok(near(15330).kneeL > 0.2 && near(15330).kneeR < 0.05, `left knee lift ${near(15330).kneeL}`);
  assert.ok(near(15880).kneeR > 0.2 && near(15880).kneeL < 0.05, `right knee lift ${near(15880).kneeR}`);
});

test('the game-facing snapshot carries lean and confidence', () => {
  const s = runs.landscape.engine.signals();
  assert.equal(typeof s.lean, 'number');
  assert.ok(s.confidence > 0.9);
  for (const key of ['cadence_spm', 'effort', 'speed', 'lean', 'squat_depth', 'guard_up', 'confidence']) {
    assert.ok(key in s, `snapshot missing ${key}`);
  }
});
