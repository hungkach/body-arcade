// Milestone 2 done-when: the marching and walking acceptance checks pass.
//   30 s of marching: at least 95% of steps detected, zero false run triggers
//   30 s of walking: zero false squats
// Plus every locomotion gesture on synthetic clips, portrait vs landscape
// parity of event counts, the move test, and the locomotion state machine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RE } from './helpers/engine.mjs';
import { moves, scriptMotion } from './helpers/synth.mjs';
import { runScript, VARIANTS } from './helpers/run-clip.mjs';

const cfg = RE.defaultConfig();
const runAll = (script, opts) => Object.fromEntries(Object.entries(VARIANTS).map(([name, v]) => [name, runScript(script, v, opts)]));
const EVENTS = ['step', 'run_start', 'run_end', 'lean_left', 'lean_right', 'point', 'turn_around', 'wave'];

const MARCH = scriptMotion([moves.march(5, 35)]);
const WALK = scriptMotion([moves.walk(5, 35)]);
const march = runAll(MARCH);
const walk = runAll(WALK);

test('30 s of marching: at least 95% of steps, zero false runs (done-when)', () => {
  assert.ok(MARCH.expected.step >= 54, `script has ${MARCH.expected.step} steps`);
  for (const [name, r] of Object.entries(march)) {
    const steps = r.count('step');
    assert.ok(steps >= Math.ceil(0.95 * MARCH.expected.step), `${name}: ${steps} of ${MARCH.expected.step} steps`);
    assert.ok(steps <= MARCH.expected.step, `${name}: ${steps} steps, more than the ${MARCH.expected.step} taken`);
    assert.equal(r.count('run_start'), 0, `${name}: false run trigger`);
    // legs alternate
    const legs = r.events.filter((e) => e.name === 'step').map((e) => e.payload.leg);
    for (let i = 1; i < legs.length; i++) assert.notEqual(legs[i], legs[i - 1], `${name}: step ${i} repeats a leg`);
  }
});

test('30 s of walking: zero false squats (done-when)', () => {
  // The squat event arrives with the combat module; until then this checks
  // the squat gate: the hip never drops far enough to start a squat or to
  // pause march detection, and walking still registers as steps.
  for (const [name, r] of Object.entries(walk)) {
    assert.equal(r.count('squat'), 0, `${name}: false squat`);
    const maxDrop = Math.max(...r.frames.filter((f) => f.raw && f.raw.hipDrop != null && f.t > 5000).map((f) => f.raw.hipDrop));
    assert.ok(maxDrop < cfg.march.squatPauseDrop, `${name}: hip drop ${maxDrop.toFixed(3)} T reaches the squat gate`);
    const steps = r.count('step');
    assert.ok(steps >= Math.ceil(0.95 * WALK.expected.step), `${name}: ${steps} of ${WALK.expected.step} walking steps`);
    assert.equal(r.count('run_start'), 0, `${name}: false run trigger`);
  }
});

test('marching moves the player at walking speed and stops after the last step', () => {
  for (const [name, r] of Object.entries(march)) {
    const at = (ms) => r.frames.find((f) => f.t >= ms);
    const mid = at(20000);
    assert.ok(Math.abs(mid.snap.cadence_spm - 110) <= 6, `${name}: cadence ${mid.snap.cadence_spm}`);
    assert.ok(Math.abs(mid.snap.speed - cfg.locomotion.walkSpeed) < 0.15, `${name}: speed ${mid.snap.speed}`);
    assert.equal(mid.loco.state, 'walk');
    // stop rule: no step for 1.5 step intervals (818 ms at 110 spm), then a
    // 400 ms coast
    const lastStep = Math.max(...r.events.filter((e) => e.name === 'step').map((e) => e.t));
    assert.ok(at(lastStep + 800).snap.speed > 1, `${name}: stopped between steps`);
    assert.equal(at(lastStep + 1250).snap.speed, 0, `${name}: still moving after the last step`);
    assert.equal(at(lastStep + 1250).loco.state, 'idle');
  }
});

test('high knees start one run, run at run speed, and end it', () => {
  const script = scriptMotion([moves.march(5, 9), moves.highKnees(9, 19), moves.march(19, 23)]);
  for (const [name, r] of Object.entries(runAll(script))) {
    assert.equal(r.count('run_start'), 1, `${name}: run_start`);
    assert.equal(r.count('run_end'), 1, `${name}: run_end`);
    assert.ok(r.count('step') >= Math.ceil(0.95 * script.expected.step), `${name}: ${r.count('step')} of ${script.expected.step} steps`);
    const start = r.events.find((e) => e.name === 'run_start').t;
    const end = r.events.find((e) => e.name === 'run_end').t;
    assert.ok(start > 9000 && start < 10500, `${name}: run started at ${start}`);
    // the last high knee lands just before 19 s; the run ends 600 ms later
    assert.ok(end > 19000 && end < 19800, `${name}: run ended at ${end}`);
    const during = r.frames.find((f) => f.t >= 15000);
    assert.equal(during.loco.state, 'run');
    assert.ok(Math.abs(during.snap.speed - cfg.locomotion.runSpeed) < 0.05, `${name}: run speed ${during.snap.speed}`);
    assert.ok(during.snap.effort > 0.9, `${name}: effort ${during.snap.effort}`);
  }
});

const GESTURES = scriptMotion([
  moves.lean(5, 7.5, 'left'), moves.lean(8, 10.5, 'right'),
  moves.point(11, 12.2, 'left'), moves.point(13, 14.2, 'right'),
  moves.turnAround(15, 16.6),
  moves.wave(17.5, 19.5, 'right'), moves.wave(21, 23, 'left'),
  moves.swipe(24, 25.5, 'right'),
]);
const gestures = runAll(GESTURES);

test('lean, point, turn around and wave each fire once, and a swipe is not a point', () => {
  for (const [name, r] of Object.entries(gestures)) {
    assert.equal(r.count('lean_left'), 1, `${name}: lean_left`);
    assert.equal(r.count('lean_right'), 1, `${name}: lean_right`);
    assert.equal(r.count('point', { side: 'left' }), 1, `${name}: point left`);
    assert.equal(r.count('point', { side: 'right' }), 1, `${name}: point right`);
    assert.equal(r.count('turn_around'), 1, `${name}: turn_around`);
    assert.equal(r.count('wave', { hand: 'right' }), 1, `${name}: wave right`);
    assert.equal(r.count('wave', { hand: 'left' }), 1, `${name}: wave left`);
    assert.equal(r.count('step'), 0, `${name}: arm gestures stepped`);
    // in order, inside their segments
    const t = (n, m) => r.events.find((e) => e.name === n && (!m || Object.keys(m).every((k) => e.payload[k] === m[k]))).t;
    assert.ok(t('point', { side: 'left' }) > 11000 && t('point', { side: 'left' }) < 12200);
    assert.ok(t('turn_around') > 15000 && t('turn_around') < 16600);
    assert.ok(t('wave', { hand: 'right' }) > 17500 && t('wave', { hand: 'right' }) < 19500);
  }
});

test('lean steering: deadzone, full scale, and fast wrists suppress it', () => {
  const r = gestures.portrait;
  const at = (ms) => r.frames.find((f) => f.t >= ms);
  assert.equal(at(4800).snap.lean, 0, 'standing still steers');
  assert.ok(at(6250).snap.lean < -0.95, `full left lean reads ${at(6250).snap.lean}`);
  assert.ok(at(9250).snap.lean > 0.95, `full right lean reads ${at(9250).snap.lean}`);
  // while leaning right, a fast swipe switches steering off
  const swipe = scriptMotion([moves.lean(5, 13, 'right'), moves.swipe(9, 10, 'left')]);
  const s = runScript(swipe, VARIANTS.portrait);
  const sAt = (ms) => s.frames.find((f) => f.t >= ms);
  assert.ok(sAt(8600).snap.lean > 0.9, `lean before the swipe ${sAt(8600).snap.lean}`);
  const during = s.frames.filter((f) => f.t > 9200 && f.t < 9900);
  assert.ok(during.every((f) => f.snap.lean === 0), 'swipe steered');
  assert.ok(sAt(10400).snap.lean > 0.9, `lean after the swipe ${sAt(10400).snap.lean}`);
});

test('arm swing while marching never points, waves or kills steering', () => {
  const script = scriptMotion([moves.march(5, 25), moves.lean(10, 16, 'right')]);
  for (const [name, r] of Object.entries(runAll(script))) {
    for (const n of ['point', 'wave', 'turn_around']) assert.equal(r.count(n), 0, `${name}: ${n} from arm swing`);
    const leaning = r.frames.filter((f) => f.t > 12000 && f.t < 14000);
    assert.ok(leaning.every((f) => f.snap.lean > 0.8), `${name}: steering dropped while marching`);
    assert.equal(r.count('lean_right'), 1);
  }
});

test('portrait and landscape give the same event counts', () => {
  const script = scriptMotion([
    moves.march(5, 14), moves.highKnees(14.5, 20), moves.walk(20.5, 30),
    moves.point(8, 9.2, 'left'), moves.point(11, 12.2, 'right'),
    moves.turnAround(23, 24.6), moves.wave(26.5, 28.5, 'right'),
    moves.lean(31, 33.5, 'left'), moves.lean(34, 36.5, 'right'),
  ]);
  const runs = runAll(script);
  const counts = (r) => Object.fromEntries(EVENTS.map((n) => [n, r.count(n)]));
  const base = counts(runs.portrait);
  assert.ok(base.step >= Math.ceil(0.95 * script.expected.step), `portrait ${base.step} of ${script.expected.step} steps`);
  for (const n of ['run_start', 'turn_around', 'wave', 'lean_left', 'lean_right']) assert.equal(base[n], 1, `portrait ${n}`);
  assert.equal(base.point, 2);
  for (const [name, r] of Object.entries(runs)) assert.deepEqual(counts(r), base, `${name} differs from portrait`);
});

test('hidden knees pause step detection', () => {
  const script = scriptMotion([moves.march(5, 15)]);
  const hide = (f) => {
    if (f.t < 8000 || f.t > 10000) return;
    for (const i of [25, 26]) f.lm[i][3] = 0.1;
  };
  const r = runScript(script, VARIANTS.portrait, { onFrame: hide });
  const during = r.events.filter((e) => e.name === 'step' && e.t > 8000 && e.t <= 10000);
  assert.equal(during.length, 0, 'stepped with the knees hidden');
  assert.ok(r.events.some((e) => e.name === 'low_confidence'));
  assert.ok(r.events.some((e) => e.name === 'step' && e.t > 10500), 'steps resume');
});

test('calibration move test runs on the locomotion detectors', () => {
  const script = scriptMotion([
    moves.march(5, 8), moves.highKnees(8.5, 10.5),
    moves.lean(11, 13.5, 'left'), moves.lean(14, 16.5, 'right'),
    moves.point(17, 18.2, 'left'), moves.point(19, 20.2, 'right'),
  ]);
  for (const [name, r] of Object.entries(runAll(script, { moveTest: true }))) {
    const done = r.events.find((e) => e.name === 'calibrated');
    assert.ok(done, `${name}: move test never finished`);
    assert.ok(done.t > 19000 && done.t < 20200, `${name}: finished at ${done.t}`);
    assert.equal(done.payload.skippedTests, 2, 'squat and jab-cross wait for the combat module');
  }
});

// ---- locomotion state machine (pure) ----

function loco(model) {
  const l = new RE.Locomotion(cfg);
  if (model) l.setModel(model);
  return l;
}
// steps at spm from t0 for durMs, updating every 33 ms
function stepAt(l, t0, durMs, spm, extra = {}) {
  const period = 60000 / spm;
  let next = t0;
  let t = t0;
  for (; t <= t0 + durMs; t += 33) {
    while (next <= t) { l.onEvent('step', { leg: 'left' }, next); next += period; }
    l.update(t, Object.assign({ cadence_spm: spm, lean: 0 }, extra), extra.mode || 'explore');
  }
  return t;
}

test('state machine: walk speed follows cadence, clamped', () => {
  for (const spm of [80, 110, 140]) {
    const l = loco();
    stepAt(l, 0, 3000, spm);
    const expected = cfg.locomotion.walkSpeed * Math.min(Math.max(spm / 110, 0.8), 1.2);
    assert.ok(Math.abs(l.speed - expected) < 0.01, `${spm} spm gives ${l.speed}, want ${expected}`);
    assert.equal(l.state, 'walk');
  }
  const slow = loco();
  stepAt(slow, 0, 3000, 60);
  assert.equal(slow.targetSpeed, 0, 'below 70 spm still walking');
});

test('state machine: ramps up over about 300 ms and coasts down over about 400 ms', () => {
  const l = loco();
  l.update(0, { cadence_spm: 0, lean: 0 }, 'explore');
  l.onEvent('step', {}, 0);
  l.update(33, { cadence_spm: 110, lean: 0 }, 'explore');
  let t = 33;
  for (; t <= 300; t += 33) l.update(t, { cadence_spm: 110, lean: 0 }, 'explore');
  assert.ok(l.speed > 0.9 * cfg.locomotion.walkSpeed, `speed after 300 ms ${l.speed}`);
  assert.ok(l.speed < cfg.locomotion.walkSpeed);
  // steps stop: target drops once the gap passes 600 ms, then coasts
  for (; t <= 650; t += 33) l.update(t, { cadence_spm: 110, lean: 0 }, 'explore');
  assert.equal(l.targetSpeed, 0);
  const tStop = t;
  for (; t <= tStop + 450; t += 33) l.update(t, { cadence_spm: 110, lean: 0 }, 'explore');
  assert.equal(l.speed, 0);
  assert.equal(l.state, 'idle');
});

test('state machine: run speed only while running and stepping', () => {
  const l = loco();
  l.onEvent('run_start', {}, 0);
  stepAt(l, 0, 2000, 170);
  assert.equal(l.state, 'run');
  assert.ok(Math.abs(l.speed - cfg.locomotion.runSpeed) < 0.01);
  l.onEvent('run_end', {}, 2000);
  stepAt(l, 2033, 2000, 110);
  assert.equal(l.state, 'walk');
});

test('state machine: transit and combat stop the player, combat faces the target', () => {
  const l = loco({ rails: false, target_bearing: () => 270 });
  stepAt(l, 0, 2000, 110);
  assert.ok(l.speed > 1);
  l.update(2100, { cadence_spm: 110, lean: 0 }, 'transit');
  assert.equal(l.speed, 0);
  l.update(2200, { cadence_spm: 110, lean: 0 }, 'combat');
  assert.equal(l.speed, 0);
  assert.equal(l.facing, 270);
});

test('state machine: turn around, rails turns at intersections, free yaw from lean', () => {
  // turn around adds 180 in either model
  const free = loco();
  free.update(0, { cadence_spm: 0, lean: 0 }, 'explore');
  free.onEvent('turn_around', {}, 10);
  free.update(33, { cadence_spm: 0, lean: 0 }, 'explore');
  assert.equal(free.facing, 180);
  // free movement: full lean turns 90 degrees per second
  for (let t = 66; t < 1056; t += 33) free.update(t, { cadence_spm: 0, lean: 1 }, 'explore');
  assert.ok(Math.abs(free.facing - 270) < 2, `facing ${free.facing}`);
  assert.equal(free.lateral, 0);

  // rails: lean slides sideways, a point only turns at an intersection
  let atCorner = false;
  const rails = loco({ rails: true, at_intersection: () => atCorner, branch_bearing: (side) => (side === 'left' ? 270 : 90) });
  rails.update(0, { cadence_spm: 0, lean: 0.5 }, 'explore');
  assert.equal(rails.lateral, 0.5);
  assert.equal(rails.facing, 0);
  rails.onEvent('point', { side: 'left' }, 10);
  rails.update(33, { cadence_spm: 0, lean: 0 }, 'explore');
  assert.equal(rails.facing, 0, 'turned away from an intersection');
  atCorner = true;
  rails.onEvent('point', { side: 'right' }, 40);
  rails.update(66, { cadence_spm: 0, lean: 0 }, 'explore');
  assert.equal(rails.facing, 90);
  // at an intersection with no point, the player goes straight
  rails.update(99, { cadence_spm: 0, lean: 0 }, 'explore');
  assert.equal(rails.facing, 90);
});

test('demo mode drives the same state machine', async () => {
  const e = RE.create({ headless: true });
  e.enable_demo();
  const demo = e.debug().demo;
  const legs = [];
  e.on('step', (p) => legs.push(p.leg));
  const t0 = RE.now();
  for (let i = 0; i < 4; i++) demo.step(t0 - 1500 + i * 500); // 120 spm of taps
  assert.deepEqual(legs, ['left', 'right', 'left', 'right']);
  for (let i = 0; i < 8; i++) { e.signals(); await new Promise((r) => setTimeout(r, 40)); }
  const s = e.signals();
  assert.equal(s.cadence_spm, 120);
  assert.ok(s.speed > 1.2, `demo speed ${s.speed}`);
  assert.equal(e.locomotion().state, 'walk');
  e.disable_demo();
  assert.equal(e.signals().speed, 0);
});
