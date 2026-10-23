// 0.12.0: a second camera at the side (Mark 10/23: punches still glitchy after the gym teaching;
// "could the second camera be placed at the side you have an open stance in?"). The side phone
// sends a few landmarks; the main engine reads forward reach from them, so a straight at the
// main camera is plain sideways travel in the side picture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RE } from './helpers/engine.mjs';
import { moves, scriptMotion, synthClip } from './helpers/synth.mjs';
import { runScript, VARIANTS } from './helpers/run-clip.mjs';

const strikes = (r) => r.events.filter((e) => e.name === 'strike').map((e) => `${e.payload.hand}-${e.payload.type}`);

function combo(stance, t0 = 6.5) {
  const segs = [moves.stance(5, t0 + 11, stance)];
  let t = t0;
  for (const [hand, type] of [['left', 'straight'], ['right', 'straight'], ['left', 'straight'], ['right', 'straight'], ['left', 'hook'], ['right', 'hook'], ['left', 'uppercut'], ['right', 'uppercut']]) {
    segs.push(moves.punch(t, hand, type));
    t += 1.2;
  }
  return scriptMotion(segs);
}
const WANT = { orthodox: ['left-jab', 'right-cross', 'left-jab', 'right-cross', 'left-hook', 'right-overhand', 'left-uppercut', 'right-uppercut'],
  southpaw: ['left-cross', 'right-jab', 'left-cross', 'right-jab', 'left-overhand', 'right-hook', 'left-uppercut', 'right-uppercut'] };

// the worst main camera: no world depth at all for the elbows and wrists, and the
// foreshortening fix switched off, so only a side camera can see a straight's reach
const flatDepth = (f) => { for (const [s, e, w] of [[11, 13, 15], [12, 14, 16]]) for (const i of [e, w]) f.wl[i][2] = f.wl[s][2]; };
const NO_FIX = { combat: { depth: { minLen: 0, maxLen: 0 } } };

// a side clip of the same script, fed lagFrames behind (the link's delay); opts.swap: the side
// tracker calls the arms the wrong way round; camYaw: which side it stands on
function withSide(script, opts = {}) {
  const side = synthClip(Object.assign({ w: 720, h: 1280, f: 800, distance: 2.4, camHeight: 1.0, seed: 77, camYaw: opts.camYaw ?? -Math.PI / 2 }, { motion: script.motion, seconds: script.seconds }));
  const lag = opts.lagFrames ?? 2;
  let i = 0;
  return (f, engine) => {
    flatDepth(f);
    const k = i++ - lag;
    if (opts.stopAt != null && f.t > opts.stopAt) return;
    if (k < 0) return;
    if (k === 0) engine.side_sync(0); // the synthetic clips share one clock
    const sf = side.frames[k];
    // a swap of every left and right landmark the side phone sends
    const S = sf.lm, sw = (opts.swap || (opts.flipAt != null && f.t >= opts.flipAt)) ? Object.assign(S.slice(), { 7: S[8], 8: S[7], 11: S[12], 12: S[11], 13: S[14], 14: S[13], 15: S[16], 16: S[15], 23: S[24], 24: S[23], 25: S[26], 26: S[25] }) : S;
    engine.side_feed(RE.sidePack(Object.assign({}, sf, { lm: sw })), f.t);
  };
}

test('without a side camera, a flat-depth main camera misses the straights (the test means something)', () => {
  const r = runScript(combo('orthodox'), VARIANTS.portrait, { onFrame: flatDepth, config: NO_FIX });
  assert.ok(strikes(r).filter((x) => /jab|cross/.test(x)).length < 2, strikes(r).join(' '));
});

for (const stance of ['orthodox', 'southpaw']) {
  test(`${stance}: with a side camera every punch registers, flat depth, in every framing`, () => {
    const script = combo(stance);
    for (const [name, v] of Object.entries(VARIANTS)) {
      const r = runScript(script, v, { onFrame: withSide(script), config: NO_FIX });
      assert.deepEqual(strikes(r), WANT[stance], `${name}`);
      assert.ok(r.engine.side_status().connected, `${name}: connected`);
    }
  });
}

// the warm-up's waves come first (one hand high): that is what tells the side's arms apart when
// the phone has them the wrong way round from the start
function waveThenCombo() {
  const segs = [moves.wave(5, 7, 'right'), moves.stance(8, 19.5, 'orthodox')];
  let t = 9.5;
  for (const [hand, type] of [['left', 'straight'], ['right', 'straight'], ['left', 'straight'], ['right', 'straight'], ['left', 'hook'], ['right', 'hook'], ['left', 'uppercut'], ['right', 'uppercut']]) { segs.push(moves.punch(t, hand, type)); t += 1.2; }
  return scriptMotion(segs);
}
test('the side tracker calling the arms the wrong way round, the camera on the other side, a slower link', () => {
  const script = waveThenCombo();
  for (const [tag, opts] of [['swapped', { swap: true }], ['left side', { camYaw: Math.PI / 2 }], ['lag 4 frames', { lagFrames: 4 }], ['all three', { swap: true, camYaw: Math.PI / 2, lagFrames: 4 }], ['labels flip mid-fight', { flipAt: 11700 }]]) {
    const r = runScript(script, VARIANTS.portrait, { onFrame: withSide(script, opts), config: NO_FIX });
    assert.deepEqual(strikes(r), WANT.orthodox, tag);
  }
});

test('the side camera dropping out: the main camera carries on with the foreshortening fix', () => {
  const script = combo('orthodox');
  // side frames stop before the punches; depth squashed to 30% and the fix on, as in 0.6.0
  const squash = (f) => { for (const [s, e, w] of [[11, 13, 15], [12, 14, 16]]) { const z0 = f.wl[s][2]; for (const i of [e, w]) f.wl[i][2] = z0 + (f.wl[i][2] - z0) * 0.3; } };
  const feed = withSideOnce(script);
  const r2 = runScript(script, VARIANTS.portrait, { onFrame: (f, engine) => { squash(f); if (f.t <= 5000) feed(f, engine); } });
  assert.deepEqual(strikes(r2), WANT.orthodox);
  assert.equal(r2.engine.side_status().connected, false);
});
// a feed for the first seconds only, without the flat depth
function withSideOnce(script) {
  const side = synthClip({ w: 720, h: 1280, f: 800, distance: 2.4, seed: 77, camYaw: -Math.PI / 2, motion: script.motion, seconds: script.seconds });
  let i = 0;
  return (f, engine) => { if (!i) engine.side_sync(0); const sf = side.frames[i++]; if (sf) engine.side_feed(RE.sidePack(sf), f.t); };
}

test('a side camera turns nothing out of walking, waving and arm swings', () => {
  const script = scriptMotion([moves.march(5, 12), moves.highKnees(13, 18), moves.wave(19, 21, 'right'), moves.wave(22, 24, 'left'), moves.armSwing(25, 29)]);
  for (const v of [VARIANTS.portrait, VARIANTS.landscape]) {
    const r = runScript(script, v, { onFrame: withSide(script), config: NO_FIX });
    assert.deepEqual(strikes(r), []);
  }
});

test('punches taught with a side camera are kept apart from the main camera set', () => {
  const script = scriptMotion([moves.stance(5, 14, 'orthodox'), moves.punch(7, 'left', 'straight'), moves.punch(8.5, 'left', 'straight'), moves.punch(10, 'left', 'straight')]);
  const r = runScript(script, VARIANTS.portrait, {
    onFrame: (() => { const s = withSide(script); return (f, engine) => { s(f, engine); if (f.t === 6000) engine.teach_strike('straight', 'left'); }; })(),
    config: NO_FIX,
  });
  const cal = r.engine.debug().cal;
  assert.ok(cal.strikesSide && cal.strikesSide.left.straight.length >= 3, 'taught with the side camera');
  assert.ok(!cal.strikes, 'the main camera set untouched');
  assert.equal(r.engine.strike_samples().side, true);
});

// 0.12.1 (Mark: "wire the side cam into teeps and level changes too"): the side camera's thigh
// angles and hip drop take the place of the main camera's in the signals the steps, kicks and
// level changes read.
// the main camera loses the legs' depth (a thigh lifting toward it reads as hanging straight down)
const flatLegs = (f) => { for (const [h, k, a] of [[23, 25, 27], [24, 26, 28]]) for (const i of [k, a]) f.wl[i][2] = f.wl[h][2]; };
const kicked = (r) => r.events.filter((e) => ['teep', 'low_kick', 'knee'].includes(e.name)).map((e) => `${e.payload.leg}-${e.name}`);
function legFeed(script, opts = {}) {
  const side = synthClip({ w: 720, h: 1280, f: 800, distance: 2.4, camHeight: 1.0, seed: 77, camYaw: opts.camYaw ?? -Math.PI / 2, motion: script.motion, seconds: script.seconds });
  let i = 0;
  return (f, engine) => {
    if (opts.main) opts.main(f);
    const k = i++ - 2;
    if (k < 0) return;
    if (k === 0) engine.side_sync(0);
    const S = side.frames[k].lm, sw = opts.swap ? Object.assign(S.slice(), { 7: S[8], 8: S[7], 11: S[12], 12: S[11], 13: S[14], 14: S[13], 15: S[16], 16: S[15], 23: S[24], 24: S[23], 25: S[26], 26: S[25] }) : S;
    engine.side_feed(RE.sidePack(Object.assign({}, side.frames[k], { lm: sw })), f.t);
  };
}
const KICKS = scriptMotion([moves.march(5, 9), moves.stance(10, 21, 'orthodox'), moves.teep(12, 'left'), moves.lowKick(14.5, 'right'), moves.knee(17, 'right')]);

test('kicks: with the main camera\'s leg depth flat, the side camera reads the teep, the low kick and the knee (0.12.1)', () => {
  const off = runScript(KICKS, VARIANTS.portrait, { onFrame: flatLegs });
  assert.notDeepEqual(kicked(off), ['left-teep', 'right-low_kick', 'right-knee'], `without the side camera: ${kicked(off)}`);
  for (const [name, v] of Object.entries(VARIANTS)) {
    const r = runScript(KICKS, v, { onFrame: legFeed(KICKS, { main: flatLegs }) });
    assert.deepEqual(kicked(r), ['left-teep', 'right-low_kick', 'right-knee'], name);
  }
  for (const [tag, o] of [['swapped', { swap: true }], ['left side', { camYaw: Math.PI / 2 }]]) {
    const r = runScript(KICKS, VARIANTS.portrait, { onFrame: legFeed(KICKS, Object.assign({ main: flatLegs }, o)) });
    assert.deepEqual(kicked(r), ['left-teep', 'right-low_kick', 'right-knee'], tag);
  }
});

test('level changes: with the main camera blind to the hip drop, the side camera reads the squats and the shot (0.12.1)', () => {
  const script = scriptMotion([moves.stance(5, 30, 'orthodox'), moves.squat(8, 0.3, 0.6, 0.6, 2.0), moves.squat(13, 0.3, 0.6, 0.6, 2.0), moves.shot(18, 0.3)]);
  // the main camera's hips and shoulders held where they stood
  let first = null;
  const frozen = (f) => { if (!first) first = f.lm.map((p) => p.slice()); for (const i of [11, 12, 23, 24]) f.lm[i][1] = first[i][1]; };
  const off = runScript(script, VARIANTS.portrait, { onFrame: frozen });
  assert.equal(off.count('squat'), 0, 'the test means something');
  for (const name of ['portrait', 'landscape', 'livingRoom']) {
    const r = runScript(script, VARIANTS[name], { onFrame: legFeed(script, { main: frozen }) });
    assert.equal(r.count('squat'), 3, `${name}: squats ${r.count('squat')}`);
    assert.equal(r.count('drive_up'), 1, `${name}: drive up`);
  }
});

test('steps and runs count the same with a side camera on (0.12.1)', () => {
  const script = scriptMotion([moves.march(5, 15), moves.highKnees(16, 24)]);
  for (const name of ['portrait', 'landscape']) {
    const a = runScript(script, VARIANTS[name]);
    const b = runScript(script, VARIANTS[name], { onFrame: legFeed(script, { main: flatLegs }) });
    assert.ok(Math.abs(a.count('step') - b.count('step')) <= 1, `${name}: ${a.count('step')} vs ${b.count('step')}`);
    assert.equal(b.count('run_start'), 1, `${name}: run`);
    assert.deepEqual(kicked(b), [], `${name}: no kicks from marching`);
  }
});

// the game's takedown is a jump out of a level change: the jump has to read from the side too
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
test('the takedown: a jump out of a level change reads through the side camera alone (0.12.1)', () => {
  const script = scriptMotion([moves.stance(5, 20, 'orthodox'), levelShot(8, { holdS: 0.5, jump: 0.14 }), levelShot(13, { holdS: 0.5 })]);
  let first = null;
  const frozen = (f) => { if (!first) first = f.lm.map((p) => p.slice()); for (const i of [11, 12, 23, 24]) f.lm[i][1] = first[i][1]; };
  for (const name of ['portrait', 'landscape']) {
    const r = runScript(script, VARIANTS[name], { onFrame: legFeed(script, { main: frozen }) });
    const ev = r.events.filter((e) => ['squat', 'drive_up', 'jump'].includes(e.name)).map((e) => e.name);
    assert.deepEqual(ev, ['squat', 'drive_up', 'jump', 'squat', 'drive_up'], name);
  }
});

// 0.12.2 (Mark: stray punches during head movement, with the side camera): from the side both
// fists sit together in front of the face, and a phone tracker swaps their labels there. Head
// movement in a guard, with the labels swapping at random whenever the fists are close in the
// side picture, throws nothing; and punches still read through it.
function swappyFeed(script, seed = 5, whole = false) {
  const side = synthClip({ w: 720, h: 1280, f: 800, distance: 2.4, seed: 77, camYaw: -Math.PI / 2, motion: script.motion, seconds: script.seconds });
  let i = 0, r = seed;
  const rand = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
  return (f, engine) => {
    const k = i++ - 2;
    if (k < 0) return;
    if (k === 0) engine.side_sync(0);
    const S = side.frames[k].lm, T = Math.hypot(S[11][1] - S[23][1], S[11][0] - S[23][0]) * 1280;
    const close = Math.hypot((S[15][0] - S[16][0]) * 720, (S[15][1] - S[16][1]) * 1280) < 0.3 * T;
    const sw = whole ? { 7: S[8], 8: S[7], 11: S[12], 12: S[11], 13: S[14], 14: S[13], 15: S[16], 16: S[15], 23: S[24], 24: S[23], 25: S[26], 26: S[25] } : { 13: S[14], 14: S[13], 15: S[16], 16: S[15] };
    const lm = close && rand() < 0.5 ? Object.assign(S.slice(), sw) : S;
    engine.side_feed(RE.sidePack(Object.assign({}, side.frames[k], { lm })), f.t);
  };
}
test('head movement in a guard throws nothing with the side camera, even with its fists swapping (0.12.2)', () => {
  const script = scriptMotion([moves.stance(5, 26, 'orthodox'), moves.lean(7, 8.5, 'left', 0.35), moves.lean(9.5, 11, 'right', 0.35), moves.lean(12, 13, 'left', 0.25), moves.lean(13.5, 14.5, 'right', 0.25),
    moves.squat(16, 0.15, 0.4, 0.3, 0.5), moves.squat(18, 0.15, 0.4, 0.3, 0.5), moves.bound(20, 'left'), moves.bound(22, 'right')]);
  for (const name of ['portrait', 'landscape', 'livingRoom']) {
    for (const seed of [5, 11, 23]) for (const whole of [false, true]) {
      const r = runScript(script, VARIANTS[name], { onFrame: swappyFeed(script, seed, whole) });
      assert.deepEqual(strikes(r), [], `${name} seed ${seed}${whole ? ' whole side' : ''}`);
    }
    assert.deepEqual(strikes(runScript(script, VARIANTS[name])), [], `${name} without the side camera`);
  }
  const punches = combo('orthodox');
  for (const name of ['portrait', 'landscape']) {
    const r = runScript(punches, VARIANTS[name], { onFrame: swappyFeed(punches) });
    assert.deepEqual(strikes(r), WANT.orthodox, `${name}: punches through the swaps`);
  }
});

// 0.14.1 (Mark: the side camera should show a zone that is ideal for picking up)
test('the side zone: in it at 2.4 m; too close, too far and too low say what to change', () => {
  const zoneAt = (opts) => {
    const script = scriptMotion([moves.stance(5, 8, 'orthodox')]);
    const side = synthClip(Object.assign({ w: 720, h: 1280, f: 800, distance: 2.4, camHeight: 1.0, seed: 77, camYaw: -Math.PI / 2, motion: script.motion, seconds: script.seconds }, opts));
    const lm = side.frames[side.frames.length - 1].lm;
    return RE.sideZone((i) => lm[i] && { x: lm[i][0], y: lm[i][1], v: lm[i][3] ?? 1 });
  };
  assert.ok(zoneAt({}).ok, zoneAt({}).hint);
  assert.match(zoneAt({ distance: 0.6 }).hint, /back/);
  assert.equal(zoneAt({ distance: 7 }).hint, 'Move the phone closer');
  assert.equal(zoneAt({ camHeight: 0.15 }).hint, 'Raise the phone to hip height');
  assert.equal(zoneAt({ camHeight: 1.9 }).hint, 'Lower the phone to hip height');
  // the engine reports it with the link
  const script = scriptMotion([moves.stance(5, 8, 'orthodox')]);
  const side = synthClip({ w: 720, h: 1280, f: 800, distance: 2.4, camHeight: 1.0, seed: 77, camYaw: -Math.PI / 2, motion: script.motion, seconds: script.seconds });
  let k = 0;
  const r = runScript(script, VARIANTS.portrait, { onFrame: (f, engine) => { if (k === 0) engine.side_sync(0); engine.side_feed(RE.sidePack(side.frames[Math.min(k++, side.frames.length - 1)]), f.t); } });
  assert.deepEqual(r.engine.side_status().zone, { ok: true, hint: 'In the zone' });
});
