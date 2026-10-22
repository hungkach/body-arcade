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
