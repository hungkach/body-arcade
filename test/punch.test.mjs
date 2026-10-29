// 0.14.0 (Mark 10/23 PM: "when your hands are in guard they are part of your body; when your arms
// leave your guard they are strikes"): a 'punch' for every trip out of the guard, landed on the
// way out, with only its shape (straight or round) for damage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RE } from './helpers/engine.mjs';
import { moves, scriptMotion, synthClip, BODIES, LOW_GUARD, HIGH_GUARD, MID_GUARD } from './helpers/synth.mjs';
import { runScript, VARIANTS } from './helpers/run-clip.mjs';

const runAll = (script, opts) => Object.fromEntries(Object.entries(VARIANTS).map(([name, v]) => [name, runScript(script, v, opts)]));
const punches = (r) => r.events.filter((e) => e.name === 'punch').map((e) => `${e.payload.hand}-${e.payload.arc === 'up' ? 'up' : e.payload.shape}`);
const squashDepth = (k) => (f) => {
  for (const [s, e, w] of [[11, 13, 15], [12, 14, 16]]) {
    const z0 = f.wl[s][2];
    for (const i of [e, w]) f.wl[i][2] = z0 + (f.wl[i][2] - z0) * k;
  }
};
// 0.15.0: an uppercut's arc is 'up' (shown here in place of round), hooks are round 'side'
const SHAPE = { straight: 'straight', hook: 'round', uppercut: 'up', shortHook: 'round' };
function combo(stance, t0 = 6.5) {
  const segs = [moves.stance(5, t0 + 11, stance)], want = [];
  let t = t0;
  for (const [hand, type] of [['left', 'straight'], ['right', 'straight'], ['left', 'straight'], ['right', 'straight'], ['left', 'hook'], ['right', 'hook'], ['left', 'uppercut'], ['right', 'uppercut']]) {
    segs.push(moves.punch(t, hand, type));
    want.push(`${hand}-${SHAPE[type]}`);
    t += 1.2;
  }
  return { script: scriptMotion(segs), want };
}

for (const stance of ['orthodox', 'southpaw']) {
  test(`${stance}: one punch per trip out of the guard, straight or round, in every framing and with depth squashed`, () => {
    const { script, want } = combo(stance);
    for (const [name, r] of Object.entries(runAll(script))) {
      assert.deepEqual(punches(r), want, name);
      for (const e of r.events.filter((x) => x.name === 'punch')) assert.ok(e.payload.power >= 0.5 && e.payload.power <= 1.5 && e.payload.reach > 0.3, `${name}: ${JSON.stringify(e.payload)}`);
    }
    for (const [name, r] of Object.entries(runAll(script, { onFrame: squashDepth(0.3) }))) assert.deepEqual(punches(r), want, `${name} squashed`);
  });
}

test('it lands on the way out: before the fist is back, and before the old strike reads it', () => {
  const { script } = combo('orthodox');
  const r = runScript(script, VARIANTS.portrait);
  const p = r.events.filter((e) => e.name === 'punch'), s = r.events.filter((e) => e.name === 'strike');
  assert.equal(p.length, s.length);
  p.forEach((e, i) => assert.ok(e.t <= s[i].t, `punch ${i} at ${e.t}, strike at ${s[i].t}`));
  // each lands within 200 ms of being thrown (6.5 s, then every 1.2 s); an uppercut waits for its rise
  p.forEach((e, i) => assert.ok(e.t - (6500 + 1200 * i) <= (e.payload.arc === 'up' ? 300 : 200), `punch ${i} at ${e.t}`));
});

test('loose hooks, short hooks, loose uppercuts and a wide hook are round, one each, a double jab is two', () => {
  const script = scriptMotion([moves.stance(5, 30, 'orthodox'), moves.loosePunch(7, 'left', 'hook'), moves.loosePunch(8.5, 'right', 'hook'), moves.loosePunch(10, 'left', 'shortHook'), moves.loosePunch(11.5, 'right', 'shortHook'), moves.loosePunch(13, 'left', 'uppercut'), moves.loosePunch(14.5, 'right', 'uppercut'), moves.wideHook(16, 'left'),
    moves.punch(18, 'left', 'straight'), moves.punch(18.5, 'left', 'straight')]);
  const want = ['left-round', 'right-round', 'left-round', 'right-round', 'left-up', 'right-up', 'left-round', 'left-straight', 'left-straight'];
  for (const [name, r] of Object.entries(runAll(script))) assert.deepEqual(punches(r), want, name);
  for (const [name, r] of Object.entries(runAll(script, { onFrame: squashDepth(0.3) }))) assert.deepEqual(punches(r), want, `${name} squashed`);
});

test('flailing, swinging the arms, marching (in a guard too), high knees, waves, points and turn around punch nothing', () => {
  const script = scriptMotion([moves.guard(5, 7), moves.flail(7, 12), moves.armSwing(13, 17), moves.guard(18, 19.2), moves.bentSwing(19, 24), moves.march(25, 30), moves.highKnees(31, 36), moves.wave(37, 40, 'right'),
    moves.guard(41, 47), moves.march(41, 47), moves.point(48, 50, 'left'), moves.turnAround(51, 53), moves.wave(54, 57, 'left')]);
  for (const [name, r] of Object.entries(runAll(script))) assert.deepEqual(punches(r), [], name);
});

test('head movement in a guard punches nothing: slips, ducks, bounds and weaves', () => {
  const script = scriptMotion([moves.stance(5, 28, 'orthodox'), moves.lean(7, 8.5, 'left', 0.35), moves.lean(9.5, 11, 'right', 0.35), moves.lean(12, 13, 'left', 0.25), moves.lean(13.5, 14.5, 'right', 0.25),
    moves.squat(16, 0.15, 0.4, 0.3, 0.5), moves.squat(18, 0.15, 0.4, 0.3, 0.5), moves.bound(20, 'left'), moves.bound(22, 'right'), moves.weave(24, 'left'), moves.weave(26, 'right')]);
  for (const [name, r] of Object.entries(runAll(script))) assert.deepEqual(punches(r), [], name);
});

test('every body build: the combination reads the same', () => {
  const { script, want } = combo('orthodox');
  for (const [body, b] of Object.entries(BODIES)) for (const vn of ['portrait', 'livingRoom']) {
    const r = runScript(script, Object.assign({}, VARIANTS[vn], { body: b, distance: (VARIANTS[vn].distance || 2.0) * (b.scale || 1) }));
    assert.deepEqual(punches(r), want, `${body} ${vn}`);
  }
});

test('a low, tired guard: once the gym has learned it, every trip out of it is a punch', () => {
  const segs = [moves.holdTurn(5, 30, 25), moves.holdArms(5, 30, LOW_GUARD)];
  const kinds = [['left', 'straight'], ['right', 'straight'], ['left', 'hook'], ['right', 'hook'], ['left', 'uppercut'], ['right', 'uppercut']];
  kinds.forEach(([hand, type], i) => segs.push(moves.punchFrom(10 + i * 1.4, hand, type, LOW_GUARD)));
  const script = scriptMotion(segs);
  for (const name of ['portrait', 'landscape', 'livingRoom']) {
    let taught = 0;
    const r = runScript(script, VARIANTS[name], { onFrame: (f, engine) => { if (!taught && f.t > 6500) { taught = 1; engine.teach_guard(); } else if (taught === 1 && f.t > 8000) { taught = 2; engine.teach_stop(); } } });
    assert.equal(punches(r).length, 6, `${name}: ${punches(r)}`);
    assert.deepEqual(punches(r).map((x) => x.split('-')[0]), kinds.map(([h]) => h), name);
  }
});

// the side camera's fists swapping labels when they are close (0.12.2): still nothing from head
// movement, and the punches read through it
function swappyFeed(script, seed = 5) {
  const side = synthClip({ w: 720, h: 1280, f: 800, distance: 2.4, seed: 77, camYaw: -Math.PI / 2, motion: script.motion, seconds: script.seconds });
  let i = 0, r = seed;
  const rand = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
  return (f, engine) => {
    const k = i++ - 2;
    if (k < 0) return;
    if (k === 0) engine.side_sync(0);
    const S = side.frames[k].lm, T = Math.hypot(S[11][1] - S[23][1], S[11][0] - S[23][0]) * 1280;
    const close = Math.hypot((S[15][0] - S[16][0]) * 720, (S[15][1] - S[16][1]) * 1280) < 0.3 * T;
    const lm = close && rand() < 0.5 ? Object.assign(S.slice(), { 13: S[14], 14: S[13], 15: S[16], 16: S[15] }) : S;
    engine.side_feed(RE.sidePack(Object.assign({}, side.frames[k], { lm })), f.t);
  };
}
test('with a side camera whose fists swap labels: head movement punches nothing, punches still read', () => {
  const head = scriptMotion([moves.stance(5, 26, 'orthodox'), moves.lean(7, 8.5, 'left', 0.35), moves.lean(9.5, 11, 'right', 0.35), moves.squat(16, 0.15, 0.4, 0.3, 0.5), moves.bound(20, 'left'), moves.weave(23, 'right')]);
  const { script, want } = combo('orthodox');
  for (const name of ['portrait', 'landscape', 'livingRoom']) for (const seed of [5, 11, 23]) {
    assert.deepEqual(punches(runScript(head, VARIANTS[name], { onFrame: swappyFeed(head, seed) })), [], `${name} seed ${seed}`);
    assert.deepEqual(punches(runScript(script, VARIANTS[name], { onFrame: swappyFeed(script, seed) })), want, `${name} seed ${seed}: punches`);
  }
});

test('a fast combination: jab, cross, hook, uppercut half a second apart, every one lands', () => {
  const script = scriptMotion([moves.stance(5, 14, 'orthodox'), moves.punch(7, 'left', 'straight'), moves.punch(7.4, 'right', 'straight'), moves.punch(7.8, 'left', 'hook'), moves.punch(8.35, 'right', 'uppercut')]);
  const want = ['left-straight', 'right-straight', 'left-round', 'right-up'];
  for (const [name, r] of Object.entries(runAll(script))) assert.deepEqual(punches(r), want, name);
  for (const [name, r] of Object.entries(runAll(script, { onFrame: squashDepth(0.3) }))) assert.deepEqual(punches(r), want, `${name} squashed`);
});


// 0.16.0 (Mark: punches traverse the clock): each punch carries the fist's path across the picture
test('the path: a rear hook sweeps in from the right, a lead hook from the left, an uppercut dips then rises', () => {
  const script = scriptMotion([moves.stance(5, 16, 'orthodox'), moves.punch(7, 'right', 'hook'), moves.punch(8.5, 'left', 'hook'), moves.punch(10, 'right', 'uppercut'), moves.punch(11.5, 'left', 'straight')]);
  for (const [name, r] of Object.entries(runAll(script))) {
    // 0.18.0: 'punch' lands as the fist leaves the zone; 'punch_path' carries the whole sweep
    const [rh, lh, up, jab] = r.events.filter((e) => e.name === 'punch_path').map((e) => e.payload.path);
    for (const p of [rh, lh, up, jab]) assert.equal(p.length, 8, name);
    const maxX = (p) => Math.max(...p.map((q) => q[0])), minX = (p) => Math.min(...p.map((q) => q[0])), minY = (p) => Math.min(...p.map((q) => q[1]));
    assert.ok(maxX(rh) > rh[7][0] + 0.1, `${name}: rear hook out right then in ${JSON.stringify(rh)}`);
    assert.ok(minX(lh) < lh[7][0] - 0.1, `${name}: lead hook out left then in ${JSON.stringify(lh)}`);
    assert.ok(up[7][1] > minY(up) + 0.15, `${name}: uppercut rises from its low point ${JSON.stringify(up)}`);
    assert.ok(Math.abs(jab[7][0] - jab[0][0]) < 0.25 && Math.abs(jab[7][1] - jab[0][1]) < 0.25, `${name}: a jab barely moves across the picture ${JSON.stringify(jab)}`);
  }
});

test('the rest of the clock: body hooks and an overhand are round side punches, one each, with their heights in the path', () => {
  const script = scriptMotion([moves.stance(5, 16, 'orthodox'), moves.punch(7, 'left', 'bodyHook'), moves.punch(8.3, 'right', 'bodyHook'), moves.punch(9.6, 'right', 'overhand'), moves.punch(10.9, 'left', 'hook')]);
  for (const [name, r] of Object.entries(runAll(script))) {
    const kinds = r.events.filter((e) => e.name === 'punch').map((e) => e.payload);
    assert.deepEqual(kinds.map((p) => `${p.hand}-${p.shape}-${p.arc}`), ['left-round-side', 'right-round-side', 'right-round-side', 'left-round-side'], name);
    const ps = r.events.filter((e) => e.name === 'punch_path').map((e) => e.payload);   // the whole sweep (0.18.0)
    assert.equal(ps.length, 4, name);
    const lowest = (p) => Math.min(...p.path.map((q) => q[1])), highest = (p) => Math.max(...p.path.map((q) => q[1]) ) - p.path[0][1];
    assert.ok(lowest(ps[0]) < -0.4 && lowest(ps[1]) < -0.4, `${name}: body hooks low ${lowest(ps[0])} ${lowest(ps[1])}`);
    assert.ok(lowest(ps[3]) > -0.3, `${name}: a head hook stays up ${lowest(ps[3])}`);
    assert.ok(highest(ps[2]) > 0.1 && highest(ps[3]) < 0.05, `${name}: the overhand rises over the guard ${highest(ps[2])}, the hook does not ${highest(ps[3])}`);
  }
});

// 0.18.0 (Mark 10/24: "any fist that comes out of the middle zone is a strike, detected as it leaves")
test('a punch lands as the fist leaves the zone: straights and hooks within 100 ms, then its whole path follows', () => {
  const { script } = combo('orthodox');
  for (const [name, r] of Object.entries(runAll(script))) {
    const p = r.events.filter((e) => e.name === 'punch'), q = r.events.filter((e) => e.name === 'punch_path');
    assert.equal(q.length, p.length, name);
    p.forEach((e, i) => { if (e.payload.arc !== 'up') assert.ok(e.t - (6500 + 1200 * i) <= 100, `${name}: punch ${i} at ${e.t}`); });
    p.forEach((e, i) => assert.ok(q[i].t >= e.t && q[i].payload.hand === e.payload.hand, `${name}: path ${i}`));
  }
});

test('dropping the guard, or swinging a forearm out on a still elbow, is not a punch', () => {
  // the stance ends with both hands dropping out of the guard; a lone guard released the same way
  const script = scriptMotion([moves.stance(5, 9, 'orthodox'), moves.guard(11, 13), moves.stance(15, 18, 'southpaw')]);
  for (const [name, r] of Object.entries(runAll(script))) assert.deepEqual(punches(r), [], name);
});

// 0.22.0 (Mark, 10/26 to 10/28: "uppercut detection is not perfect"; "slipping occasionally causes punches")
test('an uppercut with no dip first (the elbow in, driven up the middle) is a rising round in every framing, both stances, squashed depth and every build', () => {
  for (const stance of ['orthodox', 'southpaw']) {
    const script = scriptMotion([moves.stance(5, 16, stance), moves.loosePunch(7, 'left', 'shortUpper'), moves.loosePunch(9, 'right', 'shortUpper'), moves.punch(11, 'left', 'straight'), moves.punch(13, 'right', 'straight')]);
    const want = ['left-up', 'right-up', 'left-straight', 'right-straight'];
    for (const [name, r] of Object.entries(runAll(script))) assert.deepEqual(punches(r), want, `${stance} ${name}`);
    for (const [name, r] of Object.entries(runAll(script, { onFrame: squashDepth(0.3) }))) assert.deepEqual(punches(r), want, `${stance} ${name} squashed`);
    for (const [bn, body] of Object.entries(BODIES)) assert.deepEqual(punches(runScript(script, Object.assign({ body }, VARIANTS.livingRoom))), want, `${stance} ${bn}`);
  }
});

test('slips that turn the shoulders punch nothing; a counter thrown out of a slip still lands', () => {
  const slips = scriptMotion([moves.stance(5, 26, 'orthodox'), ...[7, 9, 11, 13, 15, 17].map((t, i) => moves.slipTurn(t, t + 0.6, i % 2 ? 'right' : 'left', 0.3 + 0.05 * (i % 3), 0.25 + 0.15 * (i % 3))), moves.slipTurn(20, 20.4, 'left', 0.4, 0.5), moves.slipTurn(21, 21.4, 'right', 0.4, 0.5)]);
  for (const [name, r] of Object.entries(runAll(slips))) assert.deepEqual(punches(r), [], name);
  for (const [name, r] of Object.entries(runAll(slips, { onFrame: squashDepth(0.3) }))) assert.deepEqual(punches(r), [], `${name} squashed`);
  const counters = scriptMotion([moves.stance(5, 16, 'orthodox'), moves.slipTurn(7, 7.8, 'left'), moves.punch(7.3, 'right', 'straight'), moves.slipTurn(10, 10.8, 'right'), moves.punch(10.3, 'left', 'hook'), moves.slipTurn(13, 13.8, 'left'), moves.loosePunch(13.3, 'right', 'shortUpper')]);
  for (const [name, r] of Object.entries(runAll(counters))) assert.deepEqual(punches(r), ['right-straight', 'left-round', 'right-up'], name);
});

test('snapping a low guard up to a high guard is not an uppercut', () => {
  const snap = (t0, hand) => ({ start: t0, end: t0 + 1.5, kind: 'arms', expected: {}, apply(t, m) { m[hand === 'left' ? 'armL' : 'armR'] = t - t0 < 0.7 ? LOW_GUARD : HIGH_GUARD; } });
  const script = scriptMotion([moves.stance(5, 16, 'orthodox'), snap(7, 'left'), snap(9, 'right'), snap(11, 'left'), snap(11, 'right')]);
  for (const [name, r] of Object.entries(runAll(script))) assert.deepEqual(punches(r), [], name);
});

// 0.23.0 (Mark 10/29: "most straights were read as rounds")
test('straights from a guard held at the chest are straights: both hands, both stances, every framing, squashed depth and every build', () => {
  const guardAt = (t0, t1) => ({ start: t0, end: t1, kind: 'arms', expected: {}, apply(t, m) { m.armL = MID_GUARD; m.armR = MID_GUARD; } });
  for (const stance of ['orthodox', 'southpaw']) {
    const script = scriptMotion([moves.stance(5, 16, stance), guardAt(6, 16), moves.midStraight(7, 'left'), moves.midStraight(9, 'right'), moves.midStraight(11, 'left'), moves.midStraight(13, 'right')]);
    const want = ['left-straight', 'right-straight', 'left-straight', 'right-straight'];
    for (const [name, r] of Object.entries(runAll(script))) assert.deepEqual(punches(r), want, `${stance} ${name}`);
    for (const [name, r] of Object.entries(runAll(script, { onFrame: squashDepth(0.3) }))) assert.deepEqual(punches(r), want, `${stance} ${name} squashed`);
    for (const [bn, body] of Object.entries(BODIES)) assert.deepEqual(punches(runScript(script, Object.assign({ body }, VARIANTS.livingRoom))), want, `${stance} ${bn}`);
  }
});
