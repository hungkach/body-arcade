// Milestone 4 done-when: a scripted sparring dummy can be struck, taken
// down, and finished in demo and camera modes. Plus every combat detector
// on synthetic clips in the standard framings, portrait vs landscape parity,
// and no false strikes from walking, running or the locomotion gestures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RE } from './helpers/engine.mjs';
import { moves, scriptMotion } from './helpers/synth.mjs';
import { runScript, VARIANTS } from './helpers/run-clip.mjs';

const runAll = (script, opts) => Object.fromEntries(Object.entries(VARIANTS).map(([name, v]) => [name, runScript(script, v, opts)]));
const strikes = (r) => r.events.filter((e) => e.name === 'strike').map((e) => `${e.payload.hand}-${e.payload.type}`);

// A combination thrown from a stance: two straights each hand, a hook and an
// uppercut each hand.
function combo(stance, t0 = 6.5) {
  const segs = [moves.stance(5, t0 + 11, stance)];
  const thrown = [];
  let t = t0;
  for (const [hand, type] of [['left', 'straight'], ['right', 'straight'], ['left', 'straight'], ['right', 'straight'], ['left', 'hook'], ['right', 'hook'], ['left', 'uppercut'], ['right', 'uppercut']]) {
    segs.push(moves.punch(t, hand, type));
    thrown.push([hand, type]);
    t += 1.2;
  }
  return { script: scriptMotion(segs), thrown };
}
const label = (stance, hand, type) => {
  if (type !== 'straight') return `${hand}-${type}`;
  const lead = stance === 'southpaw' ? 'right' : 'left';
  return `${hand}-${hand === lead ? 'jab' : 'cross'}`;
};

for (const stance of ['orthodox', 'southpaw']) {
  test(`${stance}: every punch registers once with its hand and type, in every framing`, () => {
    const { script, thrown } = combo(stance);
    const want = thrown.map(([hand, type]) => label(stance, hand, type));
    for (const [name, r] of Object.entries(runAll(script))) {
      assert.deepEqual(strikes(r), want, `${name}`);
      const st = r.events.filter((e) => e.name === 'stance').map((e) => e.payload.stance);
      assert.equal(st[0], stance, `${name}: stance ${st}`);
      for (const e of r.events.filter((x) => x.name === 'strike')) {
        assert.ok(e.payload.power >= 0.5 && e.payload.power <= 1.5, `${name}: power ${e.payload.power}`);
      }
    }
  });
}

test('portrait and landscape agree on strikes, guard and stance', () => {
  const { script } = combo('orthodox');
  const p = runScript(script, VARIANTS.portrait);
  const l = runScript(script, VARIANTS.landscape);
  assert.deepEqual(strikes(p), strikes(l));
  const guard = (r) => r.frames.filter((f) => f.t > 6000 && f.t < 16000 && f.snap.guard_up).length;
  assert.ok(Math.abs(guard(p) - guard(l)) <= 3, `guard frames ${guard(p)} vs ${guard(l)}`);
});

test('guard: up with fists by the face, down with hands at the sides', () => {
  const script = scriptMotion([moves.guard(5, 9)]);
  for (const [name, r] of Object.entries(runAll(script))) {
    const at = (ms) => r.frames.find((f) => f.t >= ms).snap.guard_up;
    assert.equal(at(4800), false, `${name}: guard before`);
    assert.equal(at(7000), true, `${name}: no guard`);
    assert.equal(at(9800), false, `${name}: guard after`);
    assert.equal(strikes(r).length, 0, `${name}: raising the guard struck: ${strikes(r)}`);
  }
});

test('a square stance reads square; stance changes are held half a second', () => {
  const script = scriptMotion([moves.guard(5, 8), moves.stance(9, 13, 'southpaw')]);
  const r = runScript(script, VARIANTS.portrait);
  const at = (ms) => r.frames.find((f) => f.t >= ms).snap.stance;
  assert.equal(at(7000), 'square');
  assert.equal(at(11000), 'southpaw');
  const changes = r.events.filter((e) => e.name === 'stance').map((e) => e.payload.stance);
  assert.deepEqual(changes, ['southpaw', 'square']);
});

test('no strikes from marching, high knees, points, turn around or waves', () => {
  const script = scriptMotion([
    moves.march(5, 15), moves.highKnees(15, 22), moves.walk(22, 28),
    moves.point(29, 30.5, 'left'), moves.point(31, 32.5, 'right'),
    moves.turnAround(33, 34.5), moves.wave(35, 37, 'right'), moves.swipe(38, 39, 'left'),
  ]);
  for (const [name, r] of Object.entries(runAll(script))) {
    assert.deepEqual(strikes(r), [], `${name}: false strikes`);
    assert.equal(r.count('squat'), 0, `${name}: false squat`);
  }
});

test('marching in a guard still steps, and does not punch', () => {
  const script = scriptMotion([moves.guard(5, 20), moves.march(6, 18)]);
  for (const [name, r] of Object.entries(runAll(script))) {
    assert.deepEqual(strikes(r), [], `${name}: false strikes`);
    assert.ok(r.count('step') >= Math.ceil(0.9 * script.expected.step), `${name}: ${r.count('step')} of ${script.expected.step} steps`);
  }
});

test('slip: head off the center line, each way, once', () => {
  const script = scriptMotion([moves.guard(5, 16), moves.lean(7, 9, 'left', 0.35), moves.lean(11, 13, 'right', 0.35)]);
  for (const [name, r] of Object.entries(runAll(script))) {
    const slips = r.events.filter((e) => e.name === 'slip').map((e) => e.payload.side);
    assert.deepEqual(slips, ['left', 'right'], `${name}`);
    assert.deepEqual(strikes(r), [], `${name}: a slip struck`);
  }
});

test('squat and drive up: a slow squat is a squat, an explosive one also drives up', () => {
  const script = scriptMotion([moves.squat(6, 0.3, 0.6, 0.6, 2.0), moves.shot(10)]);
  for (const [name, r] of Object.entries(runAll(script))) {
    const ev = r.events.filter((e) => e.name === 'squat' || e.name === 'drive_up').map((e) => e.name);
    assert.deepEqual(ev, ['squat', 'squat', 'drive_up'], `${name}`);
    assert.equal(r.count('step'), 0, `${name}: a squat stepped`);
  }
});

// Knees-up framing: a fighting crouch or a squat pushes the knees out of the
// frame (MediaPipe drops their visibility) and arms in front can hide the
// hips. Neither may switch off the fight detectors (0.4.2: the first real
// phone fight registered no punches and no level changes).
const hide = (from, idx) => (f) => { if (f.t >= from) for (const i of idx) f.lm[i][3] = f.wl[i][3] = 0.1; };
test('knees hidden after calibration: punches, guard and level changes still register', () => {
  const { script, thrown } = combo('orthodox');
  const want = thrown.map(([hand, type]) => label('orthodox', hand, type));
  for (const [name, r] of Object.entries(runAll(script, { onFrame: hide(5500, [25, 26]) }))) {
    assert.deepEqual(strikes(r), want, `${name}`);
    assert.ok(r.frames.some((f) => f.snap.guard_up), `${name}: no guard`);
  }
  const shots = scriptMotion([moves.squat(6, 0.3, 0.6, 0.6, 2.0), moves.shot(10)]);
  for (const [name, r] of Object.entries(runAll(shots, { onFrame: hide(5500, [25, 26]) }))) {
    const ev = r.events.filter((e) => e.name === 'squat' || e.name === 'drive_up').map((e) => e.name);
    assert.deepEqual(ev, ['squat', 'squat', 'drive_up'], `${name}`);
  }
});

test('hips and knees hidden: the shoulders carry the level change and squat depth', () => {
  const script = scriptMotion([moves.shot(7), moves.crouch(10, 14, 0.25)]);
  for (const [name, r] of Object.entries(runAll(script, { onFrame: hide(5500, [23, 24, 25, 26]) }))) {
    const ev = r.events.filter((e) => e.name === 'squat' || e.name === 'drive_up').map((e) => e.name);
    assert.deepEqual(ev.slice(0, 2), ['squat', 'drive_up'], `${name}: ${ev}`);
    const mid = r.frames.find((f) => f.t >= 12000);
    assert.ok(mid.snap.squat_depth >= 0.4, `${name}: crouch depth ${mid.snap.squat_depth}`);
  }
});

test('down strikes from a crouch', () => {
  const script = scriptMotion([moves.guard(5, 13), moves.crouch(6, 12, 0.2), moves.punch(8, 'left', 'down'), moves.punch(9.5, 'right', 'down')]);
  for (const [name, r] of Object.entries(runAll(script))) {
    assert.deepEqual(strikes(r), ['left-down', 'right-down'], `${name}`);
  }
});

test('arm pose: guard fists by the face, a jab reaches the camera', () => {
  const script = scriptMotion([moves.stance(5, 10, 'orthodox'), moves.punch(7, 'left', 'straight')]);
  const r = runScript(script, VARIANTS.portrait);
  const arms = (ms) => r.frames.find((f) => f.t >= ms).det.arms;
  const g = arms(6500);
  assert.ok(g.left.wrist.y > -0.3 && g.left.wrist.z > 0.2, `guard fist ${JSON.stringify(g.left.wrist)}`);
  assert.ok(g.left.extension < 0.3, `guard extension ${g.left.extension}`);
  const j = arms(7150);
  assert.ok(j.left.reach > 0.7, `jab reach ${j.left.reach}`);
  assert.ok(j.left.extension > 0.7, `jab extension ${j.left.extension}`);
  assert.ok(j.left.wrist.z > g.left.wrist.z + 0.8, 'the jab did not come toward the camera');
  // the public API returns the same pose
  const e = r.engine.arms();
  assert.ok(e && e.left && e.right && e.left.wrist);
});

// ---- the fight state machine ----

// A scripted sparring dummy (spec done-when): takes hits, can be taken down,
// finished on the ground. open() lets a shot in; shooting() is its own takedown.
function dummy() {
  return {
    hp: 6, down: false, shoots: false, bearing: () => 90, open: () => true, shooting() { return this.shoots; },
    hit(power) { this.hp -= power; },
  };
}
function wire(engine, d) {
  const log = [];
  for (const n of ['strike', 'shot', 'takedown', 'stuffed', 'sprawl', 'down_strike', 'scramble', 'escape']) {
    engine.on(n, (p) => {
      log.push(n);
      if (n === 'strike' && engine.combat().phase === 'standing') d.hit(p.power);
      if (n === 'takedown') { d.down = true; d.takenDown = true; }
      if (n === 'down_strike') d.hit(p.power);
      if (n === 'scramble') d.down = false;
    });
  }
  return log;
}

test('done-when, camera: the dummy is struck, taken down, and finished', () => {
  const segs = [moves.stance(5, 11, 'orthodox')];
  for (const [i, [hand, type]] of [['left', 'straight'], ['right', 'straight'], ['left', 'hook']].entries()) segs.push(moves.punch(6.5 + i * 1.2, hand, type));
  // shoot the double leg (hips drop 0.3 m), drive through (back up to 0.15 m
  // fast) and stay low on top, a half squat hold, for the down strikes
  segs.push({
    start: 11.5, end: 19, kind: 'level', expected: {},
    apply(t, m) {
      const u = t - 11.5, e = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
      m.drop = (m.drop || 0) + (u < 0.3 ? 0.3 * e(u / 0.3) : u < 0.45 ? 0.3 : u < 0.7 ? 0.3 - 0.15 * e((u - 0.45) / 0.25) : u < 7 ? 0.15 : 0.15 * (1 - e((u - 7) / 0.5)));
    },
  });
  segs.push(moves.guard(12.5, 20), moves.punch(14, 'left', 'down'), moves.punch(15.2, 'right', 'down'), moves.punch(16.4, 'left', 'down'));
  const script = scriptMotion(segs);
  for (const name of ['portrait', 'landscape', 'livingRoom']) {
    const d = dummy();
    let log;
    const r = runScript(script, VARIANTS[name], {
      onFrame: (f, engine) => {
        if (!log) { log = wire(engine, d); }
        if (f.t >= 6000 && engine.mode() !== 'combat') engine.enter_combat(d);
      },
    });
    assert.ok(log.filter((n) => n === 'strike').length >= 3, `${name}: ${log}`);
    assert.ok(log.includes('shot') && log.includes('takedown'), `${name}: no takedown: ${log}`);
    assert.ok(d.takenDown, `${name}: dummy never taken down`);
    assert.ok(log.filter((n) => n === 'down_strike').length >= 3, `${name}: down strikes ${log}`);
    assert.ok(d.hp <= 0, `${name}: dummy not finished, hp ${d.hp.toFixed(2)}`);
    assert.equal(r.engine.locomotion().speed, 0, `${name}: moved in combat`);
    assert.equal(r.engine.locomotion().facing, 90, `${name}: not facing the dummy`);
  }
});

test('done-when, demo: the dummy is struck, taken down, and finished', () => {
  const e = RE.create({ headless: true });
  e.enable_demo();
  const demo = e.debug().demo;
  const d = dummy();
  const log = wire(e, d);
  e.enter_combat(d);
  for (const b of ['jab', 'cross', 'hook', 'uppercut']) demo.press(b, RE.now());
  demo.press('squat', RE.now());
  e.signals();
  demo.press('drive_up', RE.now());
  assert.equal(e.combat().phase, 'top');
  // the demo holds the half squat of the top position: no scramble while striking down
  e.signals();
  assert.equal(e.signals().squat_depth, 0.5);
  for (let i = 0; i < 3; i++) { demo.press('jab', RE.now()); e.signals(); }
  assert.equal(e.combat().phase, 'top');
  assert.ok(d.down && d.hp <= 0, `hp ${d.hp}, log ${log}`);
  assert.deepEqual(log.filter((n) => n !== 'strike'), ['shot', 'takedown', 'down_strike', 'down_strike', 'down_strike']);
  e.disable_demo();
});

test('fight machine: slow drive is stuffed, a squat while they shoot is a sprawl, standing up scrambles', () => {
  const c = new RE.Combat(RE.defaultConfig());
  const tg = { shooting: () => false, open: () => true };
  c.enter(tg);
  assert.deepEqual(c.onEvent('squat', {}, 0).map((x) => x[0]), ['shot']);
  assert.deepEqual(c.update(1100, {}).map((x) => x[0]), ['stuffed']);
  assert.equal(c.phase, 'standing');
  tg.shooting = () => true;
  assert.deepEqual(c.onEvent('squat', {}, 1200).map((x) => x[0]), ['sprawl']);
  tg.shooting = () => false;
  c.onEvent('squat', {}, 2000);
  assert.deepEqual(c.onEvent('drive_up', {}, 2500).map((x) => x[0]), ['takedown']);
  assert.deepEqual(c.update(2600, { squat_depth: 0.5 }), []);
  c.update(2700, { squat_depth: 0.05 });
  assert.deepEqual(c.update(3050, { squat_depth: 0.05 }).map((x) => x[0]), ['scramble']);
  // a closed guard: the shot never starts
  tg.open = () => false;
  assert.deepEqual(c.onEvent('squat', {}, 4000), []);
});

test('fight machine: three seconds of high knees escapes and leaves combat mode', () => {
  const e = RE.create({ headless: true });
  e.enable_demo();
  const log = [];
  e.on('escape', () => log.push('escape'));
  e.enter_combat({});
  const demo = e.debug().demo;
  demo.startRun();
  const t0 = RE.now();
  return new Promise((resolve) => {
    const tick = () => {
      e.signals();
      if (RE.now() - t0 < 3300) { setTimeout(tick, 50); return; }
      demo.stopRun();
      assert.deepEqual(log, ['escape']);
      assert.equal(e.mode(), 'explore');
      e.disable_demo();
      resolve();
    };
    tick();
  });
});

test('demo: stance switches which hand jabs; slips and the arm pose for drawing fists', () => {
  const events = [];
  const d = new RE.DemoInput(RE.defaultConfig(), (n, p) => events.push([n, p]));
  d.press('jab', 0);
  d.press('stance', 10);
  d.press('jab', 20);
  d.press('cross', 30);
  d.press('slip_left', 40);
  assert.deepEqual(events.map((e) => e[0] + ':' + (e[1].hand || e[1].stance || e[1].side)), ['strike:left', 'stance:southpaw', 'strike:right', 'strike:left', 'slip:left']);
  assert.equal(d.signals(100).slip, -1);
  assert.equal(d.signals(100).stance, 'southpaw');
  const a = d.arms(150);
  assert.ok(a.left.reach > 0.8, 'the cross hand is out');
  d.destroy();
});
