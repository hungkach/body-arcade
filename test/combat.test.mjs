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
  segs.push(levelShot(11.5, { holdS: 1.5, jump: 0.08 }));
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
  const script = scriptMotion([levelShot(6, { holdS: 3 }), levelShot(13, { holdS: 0.5, jump: 0.08 }), moves.squat(18, 0.3, 0.6, 0.6, 2.5)]);
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
  assert.deepEqual(events.map((e) => e[0] + ':' + (e[1].hand || e[1].stance || e[1].side)), ['strike:left', 'stance:southpaw', 'strike:right', 'strike:left', 'slip:left']);
  assert.equal(d.signals(100).slip, -1);
  assert.equal(d.signals(100).stance, 'southpaw');
  const a = d.arms(150);
  assert.ok(a.left.reach > 0.8, 'the cross hand is out');
  d.destroy();
});
