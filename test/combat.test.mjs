// Milestone 4 done-when: a scripted sparring dummy can be struck, taken
// down, and finished in demo and camera modes. Plus every combat detector
// on synthetic clips in the standard framings, portrait vs landscape parity,
// and no false strikes from walking, running or the locomotion gestures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RE } from './helpers/engine.mjs';
import { moves, scriptMotion, LOW_GUARD } from './helpers/synth.mjs';
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
  const lead = stance === 'southpaw' ? 'right' : 'left';
  if (type === 'hook' && hand !== lead) return `${hand}-overhand`; // 0.8.0: the rear hook
  if (type !== 'straight') return `${hand}-${type}`;
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

// MediaPipe's world landmarks squash depth toward the camera, and a straight
// goes right at it (0.6.0: on the first camera fights hooks and uppercuts
// landed, straights did not). Squash the elbows' and wrists' world depth to
// 30% of the truth: the image still shows the punch as foreshortening, and
// the arm depth fix has to recover it.
const squashDepth = (k) => (f) => {
  for (const [s, e, w] of [[11, 13, 15], [12, 14, 16]]) {
    const z0 = f.wl[s][2];
    for (const i of [e, w]) f.wl[i][2] = z0 + (f.wl[i][2] - z0) * k;
  }
};
test('straights register from foreshortening when world depth is squashed', () => {
  for (const stance of ['orthodox', 'southpaw']) {
    const { script, thrown } = combo(stance);
    const want = thrown.map(([hand, type]) => label(stance, hand, type)).filter((x) => /jab|cross/.test(x));
    for (const [name, r] of Object.entries(runAll(script, { onFrame: squashDepth(0.3) }))) {
      const got = strikes(r).filter((x) => /jab|cross/.test(x));
      assert.deepEqual(got, want, `${stance} ${name}`);
    }
  }
  // and without the fix the same clip misses them (the test means something)
  const { script } = combo('orthodox');
  const off = runScript(script, VARIANTS.portrait, { onFrame: squashDepth(0.3), config: { combat: { depth: { minLen: 0, maxLen: 0 } } } });
  assert.ok(strikes(off).filter((x) => /jab|cross/.test(x)).length < 2, `without the fix: ${strikes(off)}`);
});

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

test('each hand at the guard reads on its own: one hand by the ear covers that side', () => {
  const script = scriptMotion([moves.guardHand(5.5, 8, 'right'), moves.guardHand(9, 11.5, 'left'), moves.guard(12.5, 15)]);
  for (const [name, r] of Object.entries(runAll(script))) {
    const at = (t) => r.frames.find((f) => f.t >= t).snap;
    assert.deepEqual([at(7000).guard_left, at(7000).guard_right, at(7000).guard_up], [false, true, false], `${name}: right hand up`);
    assert.deepEqual([at(10500).guard_left, at(10500).guard_right, at(10500).guard_up], [true, false, false], `${name}: left hand up`);
    assert.deepEqual([at(14000).guard_left, at(14000).guard_right, at(14000).guard_up], [true, true, true], `${name}: both up`);
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
// A level change and a drive out of it: the level drops by depth (m) over
// downS, holds holdS, then drives back up over upS, rising jump (m) above
// standing (a hop) before settling back.
function levelShot(start, { depth = 0.3, downS = 0.35, holdS = 1, upS = 0.25, jump = 0 } = {}) {
  const e = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const upAt = start + downS + holdS;
  return {
    start, end: upAt + upS + 0.5, kind: 'level', expected: {},
    apply(t, m) {
      let d;
      if (t < start + downS) d = depth * e((t - start) / downS);
      else if (t < upAt) d = depth;
      else if (t < upAt + upS) d = depth - (depth + jump) * e((t - upAt) / upS);
      else d = -jump * (1 - e((t - upAt - upS) / 0.3));
      m.drop = (m.drop || 0) + d;
    },
  };
}

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
  // level change (hips drop 0.3 m and hold), then drive up into a jump: the
  // strongest shot, a 5 s ground and pound burst for the down strikes
  segs.push(levelShot(11.5, { holdS: 1.5, jump: 0.14 }));
  segs.push(moves.guard(13.6, 20), moves.punch(14.2, 'left', 'down'), moves.punch(15.2, 'right', 'down'), moves.punch(16.2, 'left', 'down'));
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
  assert.equal(e.signals().level_low, true);
  // a jump resolves the shot at once (a plain drive up waits jumpWaitMs for one)
  demo.press('jump', RE.now());
  assert.equal(e.combat().phase, 'top');
  e.signals();
  for (let i = 0; i < 3; i++) { demo.press('jab', RE.now()); e.signals(); }
  assert.equal(e.combat().phase, 'top');
  assert.ok(d.down && d.hp <= 0, `hp ${d.hp}, log ${log}`);
  assert.deepEqual(log.filter((n) => n !== 'strike'), ['shot', 'takedown', 'down_strike', 'down_strike', 'down_strike']);
  e.disable_demo();
});

test('fight machine with requireJump: a drive up alone is a level change, a jump off it is the shot (0.7.0)', () => {
  const cfg = RE.defaultConfig();
  cfg.combat.fight.requireJump = true;
  const c = new RE.Combat(cfg);
  c.enter({ shooting: () => false, open: () => true });
  assert.deepEqual(c.onEvent('drive_up', { speed: 2 }, 1000), []);
  assert.deepEqual(c.update(1000 + cfg.combat.fight.requireJumpWaitMs - 10, {}), []);
  assert.deepEqual(c.update(1000 + cfg.combat.fight.requireJumpWaitMs, {}).map((x) => x[0]), ['level_change']);
  assert.equal(c.phase, 'standing');
  c.onEvent('drive_up', { speed: 2 }, 5000);
  const r = c.onEvent('jump', { height: 0.2 }, 5400);
  assert.deepEqual(r.map((x) => x[0]), ['shot', 'takedown']);
  assert.equal(r[1][1].jumped, true);
  assert.equal(c.phase, 'top');
});

test('fight machine: holding a squat sprawls their shot; a drive up is the shot, a jump makes it stronger', () => {
  const cfg = RE.defaultConfig();
  const c = new RE.Combat(cfg);
  const tg = { shooting: () => false, open: () => true };
  c.enter(tg);
  // a held squat when they shoot: one sprawl per shot, no new squat needed
  assert.deepEqual(c.update(0, { level_low: true }), []);
  tg.shooting = () => true;
  assert.deepEqual(c.update(100, { level_low: true }).map((x) => x[0]), ['sprawl']);
  assert.deepEqual(c.update(200, { level_low: true }), []);
  tg.shooting = () => false;
  c.update(300, {});
  // a squat as they shoot also sprawls
  tg.shooting = () => true;
  assert.deepEqual(c.onEvent('squat', {}, 400).map((x) => x[0]), ['sprawl']);
  // driving up while they shoot is not a shot
  assert.deepEqual(c.onEvent('drive_up', { speed: 3 }, 450), []);
  tg.shooting = () => false;
  c.update(500, {});
  // a plain drive: waits for a jump, then resolves on power from the rise speed
  assert.deepEqual(c.onEvent('drive_up', { speed: cfg.combat.fight.refRise }, 1000).map((x) => x[0]), ['shot']);
  assert.equal(c.phase, 'drive');
  assert.deepEqual(c.update(1000 + cfg.combat.fight.jumpWaitMs - 10, {}), []);
  const td = c.update(1000 + cfg.combat.fight.jumpWaitMs, {});
  assert.equal(td[0][0], 'takedown');
  assert.equal(td[0][1].jumped, false);
  assert.ok(Math.abs(td[0][1].power - 1) < 1e-9);
  const plainMs = td[0][1].topMs;
  // top is a timed burst: strikes are down strikes, then they scramble up
  assert.deepEqual(c.onEvent('strike', { hand: 'left', power: 1 }, 1500).map((x) => x[0]), ['down_strike']);
  assert.deepEqual(c.update(1300 + plainMs - 10, {}), []);
  assert.deepEqual(c.update(1300 + plainMs, {}).map((x) => x[0]), ['scramble']);
  // a jump off the drive: resolved at once, more power, a longer burst
  c.onEvent('drive_up', { speed: cfg.combat.fight.refRise }, 10000);
  const jt = c.onEvent('jump', { height: 0.2 }, 10100);
  assert.equal(jt[0][0], 'takedown');
  assert.equal(jt[0][1].jumped, true);
  assert.ok(jt[0][1].topMs > plainMs, `jump ${jt[0][1].topMs} vs ${plainMs}`);
  assert.equal(jt[0][1].topMs, cfg.combat.fight.gnpMs[1]);
  c.update(10100 + jt[0][1].topMs, {});
  // the game decides a shot into a waiting opponent: stuffed
  tg.shot = ({ power }) => ({ takedown: power >= 0.9 });
  c.onEvent('drive_up', { speed: 1.0 }, 20000);
  assert.deepEqual(c.update(20000 + cfg.combat.fight.jumpWaitMs, {}).map((x) => x[0]), ['stuffed']);
  assert.equal(c.phase, 'standing');
  c.onEvent('drive_up', { speed: 1.0 }, 21000);
  assert.deepEqual(c.onEvent('jump', {}, 21100).map((x) => x[0]), ['takedown']);
  c.update(30000, {});
  // not open (out of range): no shot
  tg.open = () => false;
  assert.deepEqual(c.onEvent('drive_up', { speed: 3 }, 40000), []);
});

test('level: a squat held for seconds still drives up; a hop off the drive is a jump', () => {
  const script = scriptMotion([levelShot(6, { holdS: 3 }), levelShot(13, { holdS: 0.5, jump: 0.14 }), moves.squat(18, 0.3, 0.6, 0.6, 2.5)]);
  for (const [name, r] of Object.entries(runAll(script))) {
    const ev = r.events.filter((e) => ['squat', 'drive_up', 'jump'].includes(e.name)).map((e) => e.name);
    assert.deepEqual(ev, ['squat', 'drive_up', 'squat', 'drive_up', 'jump', 'squat'], `${name}`);
    // the speed is the rise's own, not averaged over the held squat before it
    const drives = r.events.filter((e) => e.name === 'drive_up').map((e) => e.payload.speed);
    assert.ok(drives[0] >= 2, `${name}: drive speed ${drives[0]} after a 3 s hold`);
    const held = r.frames.find((f) => f.t >= 8000);
    assert.equal(held.snap.level_low, true, `${name}: not held low`);
    const up = r.frames.find((f) => f.t >= 11500);
    assert.equal(up.snap.level_low, false, `${name}: still low`);
  }
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
  assert.deepEqual(events.filter((e) => e[0] !== 'punch').map((e) => e[0] + ':' + (e[1].hand || e[1].stance || e[1].side)), ['strike:left', 'stance:southpaw', 'strike:right', 'strike:left', 'slip:left']);
  // 0.14.0: each punch button also emits 'punch'
  assert.deepEqual(events.filter((e) => e[0] === 'punch').map((e) => e[1].hand + '-' + e[1].shape), ['left-straight', 'right-straight', 'left-straight']);
  assert.equal(d.signals(100).slip, -1);
  assert.equal(d.signals(100).stance, 'southpaw');
  const a = d.arms(150);
  assert.ok(a.left.reach > 0.8, 'the cross hand is out');
  d.destroy();
});

test('bound: out to a side and back is one bound with its side; stepping over and staying is not (0.8.0)', () => {
  const script = scriptMotion([moves.stance(5, 16, 'orthodox'), moves.bound(7, 'left'), moves.bound(10, 'right')]);
  for (const [name, r] of Object.entries(runAll(script))) {
    const b = r.events.filter((e) => e.name === 'bound');
    assert.deepEqual(b.map((e) => e.payload.side), ['left', 'right'], `${name}: ${JSON.stringify(b.map((e) => e.payload))}`);
    for (const e of b) assert.ok(e.payload.ms < 1500 && e.payload.dist >= 0.9, `${name}: ${JSON.stringify(e.payload)}`);
    assert.equal(r.count('strike'), 0, `${name}: no strikes`);
  }
  // a step to the side that stays there
  const stay = scriptMotion([{ start: 6, end: 12, kind: 'body', expected: {}, apply(t, m) { m.shiftX = (m.shiftX || 0) + 0.45 * Math.min(1, Math.max(0, (t - 6) / 0.3)); } }]);
  for (const [name, r] of Object.entries(runAll(stay))) assert.equal(r.count('bound'), 0, `${name}: stepped over`);
});

test('requireJump: a jump from a shallow dip is not a shot; out of a real level change it is (0.8.1)', () => {
  const script = scriptMotion([levelShot(8, { depth: 0.07, downS: 0.25, holdS: 0.1, upS: 0.22, jump: 0.14 }), levelShot(13, { depth: 0.3, holdS: 0.6, jump: 0.14 })]);
  for (const name of ['portrait', 'landscape', 'livingRoom']) {
    const d = dummy();
    let log;
    runScript(script, VARIANTS[name], {
      config: { combat: { fight: { requireJump: true } } },
      onFrame: (f, engine) => {
        if (!log) { log = []; for (const n of ['jump', 'squat', 'shot', 'takedown', 'level_change']) engine.on(n, () => log.push(`${n}@${Math.round(engine.debug().raw.t / 1000)}`)); }
        if (f.t >= 6000 && engine.mode() !== 'combat') engine.enter_combat(d);
      },
    });
    const early = log.filter((x) => +x.split('@')[1] < 12), late = log.filter((x) => +x.split('@')[1] >= 12);
    assert.ok(early.some((x) => x.startsWith('jump')), `${name}: the hop is a jump: ${log}`);
    assert.ok(!early.some((x) => x.startsWith('shot') || x.startsWith('squat')), `${name}: a shallow dip and hop is not a shot: ${log}`);
    assert.ok(late.some((x) => x.startsWith('shot')) && late.some((x) => x.startsWith('takedown')), `${name}: squat then jump is: ${log}`);
  }
});

test('demo: jump from standing is only a jump; squat then jump is the shot (0.8.1)', () => {
  const e = RE.create({ headless: true, config: { combat: { fight: { requireJump: true } } } });
  e.enable_demo();
  const demo = e.debug().demo;
  const log = [];
  for (const n of ['shot', 'takedown', 'jump']) e.on(n, () => log.push(n));
  e.enter_combat({ open: () => true });
  demo.press('jump', RE.now());
  assert.deepEqual(log, ['jump']);
  demo.press('squat', RE.now());
  demo.press('jump', RE.now());
  assert.deepEqual(log, ['jump', 'jump', 'shot', 'takedown']);
  e.disable_demo();
});

test('requireJump: a fast drive up that rises onto the toes is not a jump or a shot (0.8.4)', () => {
  // Mark 10/19: takedowns registered with no jump. A hard drive up overshoots standing by a few
  // centimeters (up on the toes); only a hop off the floor is a jump.
  const script = scriptMotion([levelShot(8, { depth: 0.3, holdS: 0.6, upS: 0.2, jump: 0.05 }), levelShot(13, { depth: 0.3, holdS: 0.6, upS: 0.2, jump: 0.07 }), levelShot(18, { depth: 0.3, holdS: 0.6, jump: 0.14 })]);
  for (const name of ['portrait', 'landscape', 'livingRoom']) {
    let log;
    runScript(script, VARIANTS[name], {
      config: { combat: { fight: { requireJump: true } } },
      onFrame: (f, engine) => {
        if (!log) { log = []; for (const n of ['jump', 'shot', 'level_change']) engine.on(n, () => log.push(`${n}@${Math.round(engine.debug().raw.t / 1000)}`)); }
        if (f.t >= 6000 && engine.mode() !== 'combat') engine.enter_combat(dummy());
      },
    });
    const before = log.filter((x) => +x.split('@')[1] < 18);
    const after = log.filter((x) => +x.split('@')[1] >= 18);
    assert.ok(!before.some((x) => x.startsWith('jump') || x.startsWith('shot')), `${name}: up on the toes is not a jump: ${log}`);
    assert.equal(before.filter((x) => x.startsWith('level_change')).length, 2, `${name}: two level changes: ${log}`);
    assert.ok(after.some((x) => x.startsWith('shot')), `${name}: a hop out of the squat shoots: ${log}`);
  }
});

// ---- 0.9.0: strikes from a set hand, judged where they end (Mark 10/20) ----
const strikeList = (r) => r.events.filter((e) => e.name === 'strike').map((e) => `${e.payload.hand}-${e.payload.type}`);

test('loose hooks and uppercuts register in every framing, with depth squashed too (0.9.0)', () => {
  const script = scriptMotion([moves.stance(5, 30, 'orthodox'), moves.loosePunch(7, 'left', 'hook'), moves.loosePunch(8.5, 'right', 'hook'), moves.loosePunch(10, 'left', 'shortHook'), moves.loosePunch(11.5, 'right', 'shortHook'), moves.loosePunch(13, 'left', 'uppercut'), moves.loosePunch(14.5, 'right', 'uppercut')]);
  const want = ['left-hook', 'right-overhand', 'left-hook', 'right-overhand', 'left-uppercut', 'right-uppercut'];
  for (const [name, r] of Object.entries(runAll(script))) assert.deepEqual(strikeList(r), want, name);
  for (const [name, r] of Object.entries(runAll(script, { onFrame: squashDepth(0.3) }))) assert.deepEqual(strikeList(r), want, `${name} squashed`);
});

test('waving, flailing and swinging the arms throw nothing; neither do marching or high knees (0.9.0)', () => {
  const script = scriptMotion([moves.guard(5, 7), moves.flail(7, 12), moves.armSwing(13, 17), moves.guard(18, 19.2), moves.bentSwing(19, 24), moves.march(25, 30), moves.highKnees(31, 36), moves.wave(37, 40, 'right')]);
  for (const [name, r] of Object.entries(runAll(script))) assert.deepEqual(strikeList(r), [], name);
});

test('a double jab and a fast combination all register (0.9.0)', () => {
  const script = scriptMotion([moves.stance(5, 30, 'orthodox'), moves.punch(7, 'left', 'straight'), moves.punch(7.5, 'left', 'straight'), moves.punch(9, 'left', 'straight'), moves.punch(9.4, 'right', 'straight'), moves.punch(9.8, 'left', 'hook'), moves.punch(10.35, 'right', 'uppercut')]);
  for (const [name, r] of Object.entries(runAll(script))) assert.deepEqual(strikeList(r), ['left-jab', 'left-jab', 'left-jab', 'right-cross', 'left-hook', 'right-uppercut'], name);
});

// ---- 0.10.0: taught strikes (Mark 10/21: "the coach teaches you how to throw a strike, the
// system captures it, and that's how it reads it") ----
// a gym session in the clip: hold the guard (teach_guard), then two reps of each punch while
// that punch is being taught; plan entries are [startS, endS, role, hand]
function gym(plan) {
  return (f, engine) => {
    const t = f.t / 1000;
    for (const [a, b, role, hand] of plan) {
      if (t >= a && t < b && !(engine.__teaching === `${a}`)) { engine.__teaching = `${a}`; if (role === 'guard') engine.teach_guard(); else engine.teach_strike(role, hand); }
      if (t >= b && engine.__teaching === `${a}`) { engine.__teaching = 'done' + a; engine.teach_stop(); }
    }
  };
}
const PUNCHES = [['straight', 'left', 'straight'], ['straight', 'right', 'straight'], ['hook', 'left', 'hook'], ['hook', 'right', 'hook'], ['uppercut', 'left', 'uppercut'], ['uppercut', 'right', 'uppercut']];
function gymClip(from, live = []) {
  const segs = [moves.holdTurn(5, 70, 25), moves.holdArms(5, 70, from)];
  const plan = [[6, 8, 'guard']];
  let t = 8.5;
  for (const [role, hand, type] of PUNCHES) {
    plan.push([t, t + 2.6, role, hand]);
    segs.push(moves.punchFrom(t + 0.4, hand, type, from), moves.punchFrom(t + 1.6, hand, type, from));
    t += 2.8;
  }
  return { segs: segs.concat(live), plan, liveAt: t + 1 };
}

test('a low guard: the rules read nothing; once the gym learns the guard and each punch, they all count (0.10.0)', () => {
  const g = gymClip(LOW_GUARD);
  const live = [];
  PUNCHES.forEach(([, hand, type], i) => live.push(moves.punchFrom(g.liveAt + i * 1.4, hand, type, LOW_GUARD)));
  const script = scriptMotion(g.segs.concat(live));
  const want = ['left-jab', 'right-cross', 'left-hook', 'right-overhand', 'left-uppercut', 'right-uppercut'];
  for (const name of ['portrait', 'landscape', 'livingRoom']) {
    const taught = [];
    const r = runScript(script, VARIANTS[name], { onFrame: gym(g.plan) });
    r.engine.on && null;
    const after = r.events.filter((e) => e.name === 'strike' && e.t >= g.liveAt * 1000).map((e) => `${e.payload.hand}-${e.payload.type}`);
    assert.deepEqual(after, want, `${name}: taught`);
    const samples = r.events.filter((e) => e.name === 'strike_taught').length;
    assert.ok(samples >= 12, `${name}: ${samples} samples taught`);
    const lib = r.engine.strike_samples();
    assert.ok(lib.guard, `${name}: guard learned`);
    for (const hand of ['left', 'right']) for (const role of ['straight', 'hook', 'uppercut']) assert.ok(lib[hand][role] >= 2, `${name}: ${hand} ${role} ${lib[hand][role]}`);
    // the same clip with no gym: the rules never see a set guard this low
    const plain = runScript(script, VARIANTS[name]);
    assert.ok(strikeList(plain).length <= 1, `${name}: untaught ${strikeList(plain)}`);
  }
});

test('a wide hook the rules call a straight reads as a hook once taught; straights stay straights (0.10.0)', () => {
  const segs = [moves.stance(5, 40, 'orthodox')];
  const plan = [[7, 9.6, 'hook', 'left'], [10, 12.6, 'straight', 'left']];
  segs.push(moves.wideHook(7.4, 'left'), moves.wideHook(8.6, 'left'), moves.punch(10.4, 'left', 'straight'), moves.punch(11.6, 'left', 'straight'));
  segs.push(moves.wideHook(14, 'left'), moves.punch(15.4, 'left', 'straight'), moves.wideHook(16.8, 'left'));
  const script = scriptMotion(segs);
  for (const name of ['portrait', 'landscape', 'livingRoom']) {
    const r = runScript(script, VARIANTS[name], { onFrame: gym(plan) });
    assert.deepEqual(r.events.filter((e) => e.name === 'strike' && e.t >= 13500).map((e) => `${e.payload.hand}-${e.payload.type}`), ['left-hook', 'left-jab', 'left-hook'], name);
    const plain = runScript(script, VARIANTS[name]);
    assert.ok(!plain.events.some((e) => e.name === 'strike' && e.t >= 13500 && e.payload.type === 'hook'), `${name}: the rules alone call it a hook: ${strikeList(plain)}`);
  }
});

test('with taught samples, waving and swinging the arms still throw nothing (0.10.0)', () => {
  const g = gymClip({ a: 0.25, f: 0.55, a2: Math.PI + 0.55, f2: 0.25 });
  const at = g.liveAt;
  const script = scriptMotion(g.segs.concat([moves.flail(at, at + 5), moves.armSwing(at + 6, at + 10), moves.bentSwing(at + 11, at + 15), moves.wave(at + 16, at + 19, 'right')]));
  for (const name of ['portrait', 'landscape', 'livingRoom']) {
    const r = runScript(script, VARIANTS[name], { onFrame: gym(g.plan) });
    assert.deepEqual(r.events.filter((e) => e.name === 'strike' && e.t >= at * 1000).map((e) => `${e.payload.hand}-${e.payload.type}`), [], name);
  }
});

test('taught samples are saved with the profile and kept by the next calibration (0.10.0)', () => {
  const g = gymClip(LOW_GUARD);
  const r = runScript(scriptMotion(g.segs), VARIANTS.portrait, { onFrame: gym(g.plan) });
  const cal = r.engine.debug().cal;
  const saved = RE.profiles.load(cal.preset, cal.orientation);
  assert.ok(saved && saved.strikes && saved.strikes.left.hook.length >= 2 && saved.guardPos && saved.guardPos.left, 'saved');
  r.engine.forget_strikes();
  assert.equal(r.engine.strike_samples().left.hook, 0);
});

// ---- 0.11.0: kicks and knees, read from the thigh and the knee (the feet are often out of view) ----
const kickList = (r) => r.events.filter((e) => ['teep', 'low_kick', 'knee'].includes(e.name)).map((e) => `${e.payload.leg}-${e.name}`);

test('a lead teep, a rear low kick and a rear knee read in every framing, both stances (0.11.0)', () => {
  const orth = scriptMotion([moves.stance(5, 30, 'orthodox'), moves.teep(7, 'left'), moves.lowKick(9, 'right'), moves.knee(11, 'right'), moves.lowKick(13, 'right')]);
  const south = scriptMotion([moves.stance(5, 30, 'southpaw'), moves.teep(7, 'right'), moves.lowKick(9, 'left'), moves.knee(11, 'left')]);
  for (const [name, r] of Object.entries(runAll(orth))) {
    assert.deepEqual(kickList(r), ['left-teep', 'right-low_kick', 'right-knee', 'right-low_kick'], `orthodox ${name}`);
    for (const e of r.events.filter((x) => ['teep', 'low_kick', 'knee'].includes(x.name))) assert.ok(e.payload.power >= 0.5 && e.payload.power <= 1.5 && e.payload.pitch > 25, `${name}: ${JSON.stringify(e.payload)}`);
  }
  for (const [name, r] of Object.entries(runAll(south))) assert.deepEqual(kickList(r), ['right-teep', 'left-low_kick', 'left-knee'], `southpaw ${name}`);
});

test('marching, high knees, a squat, a bound and punches kick nothing (0.11.0)', () => {
  const script = scriptMotion([moves.march(5, 12), moves.highKnees(13, 20), moves.march(21, 25, { spm: 90 }), moves.squat(27), moves.bound(31, 'left'), moves.stance(33, 40, 'orthodox'), moves.punch(35, 'left', 'straight'), moves.punch(36.4, 'right', 'hook')]);
  for (const [name, r] of Object.entries(runAll(script))) assert.deepEqual(kickList(r), [], name);
});

test('demo: teep, low kick and knee buttons emit the camera events (0.11.0)', () => {
  const e = RE.create({ headless: true });
  const log = [];
  for (const n of ['teep', 'low_kick', 'knee']) e.on(n, (p) => log.push(`${p.leg}-${n}`));
  e.enable_demo(null);
  const demo = e.debug().demo;
  for (const b of ['teep', 'low_kick', 'knee']) demo.press(b, RE.now());
  assert.deepEqual(log, ['left-teep', 'right-low_kick', 'right-knee']);
});
