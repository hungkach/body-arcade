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
const EVENTS = ['step', 'run_start', 'run_end', 'turn_left', 'turn_right', 'lean_left', 'lean_right', 'point', 'turn_around', 'wave'];

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

test('stride: low tired knees still walk, just shorter; higher knees stride longer at the same cadence', () => {
  const speedOf = (thigh) => {
    const r = runScript(scriptMotion([moves.march(5, 15, { thigh })]), VARIANTS.portrait);
    const f = r.frames.find((x) => x.t >= 12000);
    return { steps: r.count('step'), stride: f.snap.stride, speed: f.snap.speed };
  };
  const low = speedOf(0.6), mid = speedOf(0.87), high = speedOf(1.1);
  assert.ok(low.steps >= 15, `low knees (about 34 degrees) still step: ${low.steps}`);
  assert.ok(low.stride < 0.9 && low.speed < mid.speed, `low ${JSON.stringify(low)} mid ${JSON.stringify(mid)}`);
  assert.ok(high.stride > mid.stride && high.speed > mid.speed, `high ${JSON.stringify(high)} mid ${JSON.stringify(mid)}`);
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
    // high knees run at runSpeed, longer still for higher knees (stride up to strideMax)
    const want = cfg.locomotion.runSpeed * Math.min(cfg.locomotion.strideMax, Math.max(1, during.snap.stride));
    assert.ok(Math.abs(during.snap.speed - want) < 0.05, `${name}: run speed ${during.snap.speed} vs ${want}`);
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

// Knees-up framing often loses the knees; arm gestures need only the upper
// body (0.5.2: the phone menu opens with a wave, and waves paused with the
// knees out of view)
test('point, turn around and wave still fire with the knees out of view', () => {
  const hide = (f) => { if (f.t >= 5500) for (const i of [25, 26, 27, 28]) f.lm[i][3] = f.wl[i][3] = 0.1; };
  for (const [name, r] of Object.entries(runAll(GESTURES, { onFrame: hide }))) {
    assert.equal(r.count('point', { side: 'left' }), 1, `${name}: point left`);
    assert.equal(r.count('point', { side: 'right' }), 1, `${name}: point right`);
    assert.equal(r.count('turn_around'), 1, `${name}: turn_around`);
    assert.equal(r.count('wave', { hand: 'right' }), 1, `${name}: wave right`);
    assert.equal(r.count('wave', { hand: 'left' }), 1, `${name}: wave left`);
  }
});

test('a raised or waving hand does not steer, even with the shoulders turned (0.6.2)', () => {
  // waving tilts the shoulders like a torso turn; a turn alone still steers
  const script = scriptMotion([moves.holdTurn(5, 9, 40), moves.wave(5.2, 8.8, 'right'), moves.holdTurn(11, 14, 40)]);
  for (const [name, r] of Object.entries(runAll(script))) {
    const during = r.frames.filter((f) => f.t >= 6000 && f.t <= 8500).map((f) => Math.abs(f.snap.turn));
    assert.ok(Math.max(...during) < 0.05, `${name}: steered ${Math.max(...during).toFixed(2)} while waving`);
    const after = r.frames.find((f) => f.t >= 13000).snap.turn;
    assert.ok(Math.abs(after) > 0.3, `${name}: a plain turn steers ${after}`);
    assert.equal(r.count('wave', { hand: 'right' }), 1, `${name}: the wave still counts`);
  }
});

test('hands up in a guard still steer: only a hand raised out to the side stops it (0.8.2)', () => {
  const script = scriptMotion([moves.highGuard(5, 10), moves.holdTurn(6, 9.5, 40)]);
  for (const [name, r] of Object.entries(runAll(script))) {
    const f = r.frames.find((q) => q.t >= 8500).snap.turn;
    assert.ok(Math.abs(f) > 0.3, `${name}: guard up, turned, steering ${f}`);
    assert.equal(r.count('turn_right') + r.count('turn_left'), 1, `${name}: the turn event`);
  }
});

test('lean signal: deadzone, full scale, and fast wrists suppress it', () => {
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
    moves.turn(37, 39.5, 'left'), moves.turn(40, 42.5, 'right'),
  ]);
  const runs = runAll(script);
  const counts = (r) => Object.fromEntries(EVENTS.map((n) => [n, r.count(n)]));
  const base = counts(runs.portrait);
  assert.ok(base.step >= Math.ceil(0.95 * script.expected.step), `portrait ${base.step} of ${script.expected.step} steps`);
  for (const n of ['run_start', 'turn_around', 'wave', 'lean_left', 'lean_right', 'turn_left', 'turn_right']) assert.equal(base[n], 1, `portrait ${n}`);
  assert.equal(base.point, 2);
  for (const [name, r] of Object.entries(runs)) assert.deepEqual(counts(r), base, `${name} differs from portrait`);
});

// ---- torso turn steering ----

// Held torso turns, 4 s apart: [degrees, + = right]
const HOLDS = [10, -10, 30, -30, 45, -45, 60, -60];
const TURNS = scriptMotion(HOLDS.map((deg, i) => moves.holdTurn(5 + i * 4, 9 + i * 4, deg)));
const turns = runAll(TURNS);
// mean turn and yaw while each hold is steady
function holdReadings(r) {
  return HOLDS.map((deg, i) => {
    const fs = r.frames.filter((f) => f.det && f.t > (5.8 + i * 4) * 1000 && f.t < (8.2 + i * 4) * 1000);
    const mean = (k) => fs.reduce((a, f) => a + f.det[k], 0) / fs.length;
    return { deg, turn: mean('turn'), yaw: mean('yaw'), snap: fs.reduce((a, f) => a + f.snap.turn, 0) / fs.length };
  });
}

test('torso turn: deadzone 15, full at 45, signed, in every framing', () => {
  for (const [name, r] of Object.entries(turns)) {
    // the close 4 ft camera reads yaw about 10% low from perspective
    const close = name === 'livingRoom';
    for (const h of holdReadings(r)) {
      const sign = Math.sign(h.deg);
      const label = `${name} ${h.deg} deg: turn ${h.turn.toFixed(2)}, yaw ${h.yaw.toFixed(1)}`;
      assert.ok(Math.abs(h.yaw - h.deg) < (close ? 0.15 * Math.abs(h.deg) + 2 : 3), label);
      assert.equal(h.snap, h.turn, 'snapshot carries the turn signal');
      if (Math.abs(h.deg) <= 10) assert.equal(h.turn, 0, label);
      else if (Math.abs(h.deg) === 30) assert.ok(sign * h.turn > (close ? 0.3 : 0.4) && sign * h.turn < 0.6, label);
      else if (Math.abs(h.deg) === 45) assert.ok(sign * h.turn > (close ? 0.75 : 0.9), label);
      else assert.ok(sign * h.turn > 0.99, label);
    }
  }
});

test('torso turn: portrait and landscape agree, and distance does not matter', () => {
  const p = holdReadings(turns.portrait);
  for (const other of ['landscape', 'portraitMirrored', 'landscapeFar', 'tablet']) {
    holdReadings(turns[other]).forEach((h, i) => {
      assert.ok(Math.abs(h.turn - p[i].turn) < 0.05, `${other} ${h.deg} deg: ${h.turn.toFixed(3)} vs portrait ${p[i].turn.toFixed(3)}`);
    });
  }
});

test('torso turn is not distance drift, and lean does not read as turn', () => {
  for (const [name, r] of Object.entries(turns)) {
    assert.equal(r.count('recalibrate_suggested'), 0, `${name}: a held turn asked to recalibrate`);
    // the old shoulder-width check would have fired on the 45 and 60 degree holds
    const narrow = r.frames.filter((f) => f.raw && f.raw.shoulderRatio < 0.8).length;
    assert.ok(narrow > 90, `${name}: holds too short to test drift`);
  }
  for (const [name, r] of Object.entries(gestures)) {
    const leaning = r.frames.filter((f) => f.t > 5500 && f.t < 10000);
    assert.ok(leaning.every((f) => f.snap.turn === 0), `${name}: lean read as turn`);
  }
});

test('torso turn: a head turn alone, or cues that disagree, do not steer', () => {
  // head turned 50 degrees with the torso square; then torso right, head far left
  const script = scriptMotion([moves.holdTurn(5, 9, 0, 0.4, 50), moves.holdTurn(10, 14, 35, 0.4, -90)]);
  for (const [name, r] of Object.entries(runAll(script))) {
    const head = r.frames.filter((f) => f.t > 5800 && f.t < 8200);
    assert.ok(head.every((f) => f.snap.turn === 0), `${name}: head turn steered`);
    const conflict = r.frames.filter((f) => f.t > 10800 && f.t < 13200);
    assert.ok(conflict.every((f) => f.snap.turn === 0), `${name}: conflicting cues steered`);
  }
});

test('torso turn steers while marching, and a fast arm switches it off', () => {
  const script = scriptMotion([moves.march(5, 20), moves.holdTurn(8, 13, 45), moves.swipe(10.2, 11, 'left')]);
  for (const [name, r] of Object.entries(runAll(script))) {
    const at = (ms) => r.frames.find((f) => f.t >= ms);
    assert.ok(at(9500).snap.turn > 0.75, `${name}: turn while marching ${at(9500).snap.turn}`);
    const swipe = r.frames.filter((f) => f.t > 10400 && f.t < 10900);
    assert.ok(swipe.every((f) => f.snap.turn === 0), `${name}: a fast arm steered`);
    assert.ok(at(12000).snap.turn > 0.75, `${name}: turn after the swipe ${at(12000).snap.turn}`);
    // free movement: facing swings right while turned, straight otherwise
    assert.ok(at(7900).loco.facing === 0, `${name}: turned before the torso did`);
    const f = at(13500).loco.facing;
    assert.ok(f > 150 && f < 330, `${name}: facing ${f.toFixed(0)} after about 4 s at 45 degrees`);
    assert.ok(r.count('step') >= Math.ceil(0.95 * script.expected.step), `${name}: turning cost steps`);
  }
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

test('calibration move test runs on the locomotion and combat detectors', () => {
  const script = scriptMotion([
    moves.march(5, 8), moves.highKnees(8.5, 10.5),
    moves.turn(11, 13.5, 'left'), moves.turn(14, 16.5, 'right'),
    moves.point(17, 18.2, 'left'), moves.point(19, 20.2, 'right'),
    moves.squat(21, 0.3), moves.guard(23.5, 27), moves.punch(24.5, 'left'), moves.punch(25.5, 'right'),
  ]);
  for (const [name, r] of Object.entries(runAll(script, { moveTest: true }))) {
    const done = r.events.find((e) => e.name === 'calibrated');
    assert.ok(done, `${name}: move test never finished`);
    assert.ok(done.t > 25500 && done.t < 26500, `${name}: finished at ${done.t}`);
    assert.equal(done.payload.skippedTests, 0, 'every prompt has its detector');
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
    l.update(t, Object.assign({ cadence_spm: spm, turn: 0 }, extra), extra.mode || 'explore');
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
  l.update(0, { cadence_spm: 0, turn: 0 }, 'explore');
  l.onEvent('step', {}, 0);
  l.update(33, { cadence_spm: 110, turn: 0 }, 'explore');
  let t = 33;
  for (; t <= 300; t += 33) l.update(t, { cadence_spm: 110, turn: 0 }, 'explore');
  assert.ok(l.speed > 0.9 * cfg.locomotion.walkSpeed, `speed after 300 ms ${l.speed}`);
  assert.ok(l.speed < cfg.locomotion.walkSpeed);
  // steps stop: target drops once the gap passes 600 ms, then coasts
  for (; t <= 650; t += 33) l.update(t, { cadence_spm: 110, turn: 0 }, 'explore');
  assert.equal(l.targetSpeed, 0);
  const tStop = t;
  for (; t <= tStop + 450; t += 33) l.update(t, { cadence_spm: 110, turn: 0 }, 'explore');
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
  l.update(2100, { cadence_spm: 110, turn: 0 }, 'transit');
  assert.equal(l.speed, 0);
  l.update(2200, { cadence_spm: 110, turn: 0 }, 'combat');
  assert.equal(l.speed, 0);
  assert.equal(l.facing, 270);
});

test('state machine: turn around, rails turns at intersections, free yaw from turn', () => {
  // turn around adds 180 in either model
  const free = loco();
  free.update(0, { cadence_spm: 0, turn: 0 }, 'explore');
  free.onEvent('turn_around', {}, 10);
  free.update(33, { cadence_spm: 0, turn: 0 }, 'explore');
  assert.equal(free.facing, 180);
  // free movement: full turn steers 90 degrees per second, lean does not
  for (let t = 66; t < 1056; t += 33) free.update(t, { cadence_spm: 0, turn: 1, lean: -1 }, 'explore');
  assert.ok(Math.abs(free.facing - 270) < 2, `facing ${free.facing}`);
  assert.equal(free.lateral, 0);

  // rails: turn slides sideways, a point only turns at an intersection
  let atCorner = false;
  const rails = loco({ rails: true, at_intersection: () => atCorner, branch_bearing: (side) => (side === 'left' ? 270 : 90) });
  rails.update(0, { cadence_spm: 0, turn: 0.5 }, 'explore');
  assert.equal(rails.lateral, 0.5);
  assert.equal(rails.facing, 0);
  rails.onEvent('point', { side: 'left' }, 10);
  rails.update(33, { cadence_spm: 0, turn: 0 }, 'explore');
  assert.equal(rails.facing, 0, 'turned away from an intersection');
  atCorner = true;
  rails.onEvent('point', { side: 'right' }, 40);
  rails.update(66, { cadence_spm: 0, turn: 0 }, 'explore');
  assert.equal(rails.facing, 90);
  // at an intersection with no point, the player goes straight
  rails.update(99, { cadence_spm: 0, turn: 0 }, 'explore');
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

test('knee_lift: high knees read higher than a march, in torso lengths (0.8.3)', () => {
  const r1 = runScript(scriptMotion([moves.march(5, 15)]), VARIANTS.livingRoom);
  const r2 = runScript(scriptMotion([moves.highKnees(5, 15)]), VARIANTS.livingRoom);
  const at = (r) => r.frames.find((f) => f.t >= 14000).snap.knee_lift;
  assert.ok(at(r1) > 0.05, `march ${at(r1)}`);
  assert.ok(at(r2) > at(r1) * 1.2, `high knees ${at(r2)} vs march ${at(r1)}`);
});
